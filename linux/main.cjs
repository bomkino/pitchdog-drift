"use strict";

const { createHash, randomUUID } = require("node:crypto");
const { readFile, writeFile } = require("node:fs/promises");
const { extname, join, relative, resolve, sep } = require("node:path");
const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  net,
  protocol,
  session,
} = require("electron");
const {
  LinuxDocumentAuthorityError,
  createLinuxDocumentAuthority,
} = require("./documentAuthority.cjs");
const {
  IPC_CHANNEL,
  safeDesktopFailure,
  validateDesktopRequest,
} = require("./ipcContract.cjs");

const APP_ORIGIN = "drift://app";
const WEB_ROOT = resolve(__dirname, "../web");
const SELF_TEST = process.argv.includes("--drift-linux-self-test");
const argumentValue = (prefix) => process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
const selfTestFixture = argumentValue("--drift-linux-self-test-fixture=");
const selfTestDestination = argumentValue("--drift-linux-self-test-destination=");
const selfTestReceiptPath = argumentValue("--drift-linux-self-test-receipt=");

protocol.registerSchemesAsPrivileged([{
  scheme: "drift",
  privileges: {
    standard: true,
    secure: true,
    supportFetchAPI: true,
    corsEnabled: false,
    stream: true,
  },
}]);

const authorities = new WeakMap();
const generations = new WeakMap();
let mainWindow = null;

function mimeType(pathname) {
  return ({
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".wav": "audio/wav",
  })[extname(pathname).toLowerCase()] ?? "application/octet-stream";
}

function packagedPath(requestUrl) {
  const parsed = new URL(requestUrl);
  if (parsed.protocol !== "drift:" || parsed.hostname !== "app" || parsed.username || parsed.password || parsed.port) {
    throw new Error("Packaged application origin rejected the request.");
  }
  const decoded = decodeURIComponent(parsed.pathname === "/" ? "/index.html" : parsed.pathname);
  if (decoded.includes("\0") || decoded.includes("\\")) throw new Error("Packaged application path is invalid.");
  const candidate = resolve(WEB_ROOT, `.${decoded}`);
  const inside = relative(WEB_ROOT, candidate);
  if (!inside || inside.startsWith(`..${sep}`) || inside === ".." || resolve(WEB_ROOT, inside) !== candidate) {
    throw new Error("Packaged application path escaped its root.");
  }
  return candidate;
}

async function registerPackagedOrigin() {
  protocol.handle("drift", async (request) => {
    try {
      const pathname = packagedPath(request.url);
      const bytes = await readFile(pathname);
      return new Response(bytes, {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
          "Content-Type": mimeType(pathname),
          "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob: data:; media-src 'self' blob: data:; font-src 'self' data:; connect-src 'none'; worker-src blob:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'none'",
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Resource-Policy": "same-origin",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}

function authorizeSender(event, window, generation) {
  if (event.sender !== window.webContents
    || event.senderFrame !== window.webContents.mainFrame
    || event.senderFrame.url !== `${APP_ORIGIN}/index.html`
    || generations.get(window) !== generation) {
    throw new LinuxDocumentAuthorityError("permission_denied", "Desktop request sender is not authorized.");
  }
}

function response(requestId, status, body = {}) {
  return Object.freeze({ requestId, status, ...body });
}

async function selectOpenPath(window) {
  if (SELF_TEST && selfTestFixture) return selfTestFixture;
  const result = await dialog.showOpenDialog(window, {
    title: "Open Drift Project",
    properties: ["openFile"],
    filters: [{ name: "Drift Project", extensions: ["pitched"] }],
  });
  return result.canceled ? null : result.filePaths[0] ?? null;
}

async function selectSavePath(window, authority, payload) {
  if (SELF_TEST && selfTestDestination) return selfTestDestination;
  if (payload.operation === "save") {
    try {
      return authority.boundPathForSave();
    } catch (error) {
      if (!(error instanceof LinuxDocumentAuthorityError) || error.code !== "not_found") throw error;
    }
  }
  const result = await dialog.showSaveDialog(window, {
    title: payload.operation === "save-as" ? "Save Drift Project As" : "Save Drift Project",
    defaultPath: payload.suggestedName,
    filters: [{ name: "Drift Project", extensions: ["pitched"] }],
  });
  return result.canceled ? null : result.filePath ?? null;
}

async function dispatch(window, authority, request) {
  switch (request.method) {
  case "documents.choose": {
    const pathname = await selectOpenPath(window);
    return pathname ? authority.admitOpenPath(pathname) : null;
  }
  case "documents.finalize-open":
    return authority.finalizeOpen(request.payload.grantId);
  case "documents.abandon-open":
    authority.abandonOpen(request.payload.grantId);
    return Object.freeze({ abandoned: true });
  case "documents.save": {
    const pathname = await selectSavePath(window, authority, request.payload);
    return pathname ? authority.saveToPath(pathname, request.payload) : null;
  }
  case "documents.revert":
    return authority.revert(request.payload.expectedSha256);
  default:
    throw new LinuxDocumentAuthorityError("invalid_request", "Desktop request method is unavailable.");
  }
}

function attachIpc(window, authority, generation) {
  ipcMain.handle(IPC_CHANNEL, async (event, input) => {
    let requestId = "rejected-request";
    try {
      authorizeSender(event, window, generation);
      const request = validateDesktopRequest(input, generation);
      requestId = request.requestId;
      const value = await dispatch(window, authority, request);
      return value === null
        ? response(requestId, "cancelled")
        : response(requestId, "completed", { value });
    } catch (error) {
      return response(requestId, "failed", { failure: safeDesktopFailure(error) });
    }
  });
}

function hardenSession() {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const allowed = details.url.startsWith(`${APP_ORIGIN}/`)
      || details.url.startsWith("blob:")
      || details.url.startsWith("data:");
    callback({ cancel: !allowed });
  });
  session.defaultSession.on("will-download", (event) => event.preventDefault());
}

function createWindow() {
  const generation = randomUUID();
  const authority = createLinuxDocumentAuthority();
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    show: !SELF_TEST,
    backgroundColor: "#151412",
    title: "Drift Linux Tracer",
    webPreferences: {
      preload: join(__dirname, "preload.cjs"),
      additionalArguments: [`--drift-linux-generation=${generation}`],
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      devTools: false,
      spellcheck: false,
    },
  });
  authorities.set(window, authority);
  generations.set(window, generation);
  attachIpc(window, authority, generation);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== `${APP_ORIGIN}/index.html`) event.preventDefault();
  });
  window.webContents.on("will-attach-webview", (event) => event.preventDefault());
  window.on("closed", () => {
    authority.revokeAll();
    ipcMain.removeHandler(IPC_CHANNEL);
    if (mainWindow === window) mainWindow = null;
  });
  void window.loadURL(`${APP_ORIGIN}/index.html`);
  return window;
}

async function sha256File(pathname) {
  return createHash("sha256").update(await readFile(pathname)).digest("hex");
}

async function waitForRendererReady(window) {
  const deadline = Date.now() + 30_000;
  let renderer = null;
  while (Date.now() < deadline) {
    renderer = await window.webContents.executeJavaScript(`(() => ({
      url: location.href,
      title: document.title,
      rootChildren: document.querySelector('#root')?.childElementCount ?? 0,
      canvasCount: document.querySelectorAll('canvas').length,
      linuxMarker: globalThis.__DRIFT_LINUX_DESKTOP__?.marker ?? null,
      nodeReachable: typeof globalThis.require === 'function' || typeof globalThis.process === 'object'
    }))()`, true);
    if (renderer.url === `${APP_ORIGIN}/index.html`
      && renderer.rootChildren > 0
      && renderer.canvasCount > 0
      && renderer.linuxMarker?.sandboxed === true
      && renderer.nodeReachable === false) return renderer;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 100));
  }
  throw new Error(`Packaged renderer did not reach its public ready seam: ${JSON.stringify(renderer)}`);
}

async function runSelfTest(window) {
  if (!selfTestFixture || !selfTestDestination || !selfTestReceiptPath) {
    throw new Error("Linux self-test requires fixture, destination, and receipt paths.");
  }
  await new Promise((resolvePromise, reject) => {
    const timeout = setTimeout(() => reject(new Error("Packaged renderer did not load in time.")), 30_000);
    window.webContents.once("did-finish-load", () => {
      clearTimeout(timeout);
      resolvePromise();
    });
    window.webContents.once("did-fail-load", (_event, code, description) => {
      clearTimeout(timeout);
      reject(new Error(`Packaged renderer load failed (${code}): ${description}`));
    });
  });
  const authority = authorities.get(window);
  const selected = await authority.admitOpenPath(selfTestFixture);
  let guessedGrantRejected = false;
  try {
    await authority.finalizeOpen("drift-grant-00000000-0000-4000-8000-000000000000");
  } catch (error) {
    guessedGrantRejected = error instanceof LinuxDocumentAuthorityError && error.code === "grant_expired";
  }
  const opened = await authority.finalizeOpen(selected.grantId);
  const saved = await authority.saveToPath(selfTestDestination, {
    operation: "save-as",
    transactionId: "linux-packaged-self-test",
    ticket: { sequence: 1, revision: 0 },
    bytes: selected.bytes,
    suggestedName: "linux-self-test.pitched",
  });
  const reopenedAuthority = createLinuxDocumentAuthority();
  const reopenedSelection = await reopenedAuthority.admitOpenPath(selfTestDestination);
  const reopened = await reopenedAuthority.finalizeOpen(reopenedSelection.grantId);
  const renderer = await waitForRendererReady(window);
  const buildReceipt = JSON.parse(await readFile(join(__dirname, "../BuildReceipt.json"), "utf8"));
  const receipt = {
    schema: "dog.pitch.drift/linux-tracer-runtime-receipt/1",
    ok: guessedGrantRejected
      && opened.sha256 === saved.sha256
      && saved.sha256 === reopened.sha256
      && renderer.url === `${APP_ORIGIN}/index.html`
      && renderer.rootChildren > 0
      && renderer.canvasCount > 0
      && renderer.linuxMarker?.sandboxed === true
      && renderer.nodeReachable === false,
    product: "dog.pitch.drift",
    platformClaim: "compatible-linux-cloud-internal-tracer",
    electronVersion: process.versions.electron,
    chromiumVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    sourceCommit: buildReceipt.sourceCommit,
    sourceTree: buildReceipt.sourceTree,
    artifactManifestSha256: await sha256File(join(__dirname, "../BuildReceipt.json")),
    renderer,
    document: {
      selectedBytes: selected.bytes.byteLength,
      sha256: opened.sha256,
      savedSha256: saved.sha256,
      reopenedSha256: reopened.sha256,
      readbackVerified: saved.readbackVerified,
      guessedGrantRejected,
      rawPathExposed: false,
    },
    security: {
      sandbox: window.webContents.getLastWebPreferences().sandbox,
      contextIsolation: window.webContents.getLastWebPreferences().contextIsolation,
      nodeIntegration: window.webContents.getLastWebPreferences().nodeIntegration,
      packagedOrigin: APP_ORIGIN,
      genericAuthority: false,
    },
  };
  await writeFile(selfTestReceiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  if (!receipt.ok) throw new Error(`Linux packaged tracer self-test failed its receipt invariants: ${JSON.stringify({
    guessedGrantRejected,
    hashesMatch: opened.sha256 === saved.sha256 && saved.sha256 === reopened.sha256,
    renderer,
  })}`);
}

app.on("web-contents-created", (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
});
app.on("window-all-closed", () => app.quit());

void app.whenReady().then(async () => {
  app.setName("Drift Linux Tracer");
  await registerPackagedOrigin();
  hardenSession();
  mainWindow = createWindow();
  if (SELF_TEST) {
    try {
      await runSelfTest(mainWindow);
      console.log("Drift Linux packaged-directory self-test passed.");
      app.exit(0);
    } catch (error) {
      console.error(error instanceof Error ? error.message : "Drift Linux packaged-directory self-test failed.");
      app.exit(1);
    }
  }
});
