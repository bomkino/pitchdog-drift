"use strict";

const { createHash, randomUUID } = require("node:crypto");
const { basename, dirname, extname, join, resolve } = require("node:path");
const fs = require("node:fs/promises");

const MAX_PROJECT_BYTES = 512 * 1024 * 1024;
const MAX_ACTIVE_GRANTS = 8;
const PROJECT_MIME = "application/vnd.pitchdog.pitched+zip";

class LinuxDocumentAuthorityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "LinuxDocumentAuthorityError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new LinuxDocumentAuthorityError(code, message);
}

function projectBytes(value) {
  const bytes = value instanceof Uint8Array
    ? new Uint8Array(value)
    : value instanceof ArrayBuffer
      ? new Uint8Array(value)
      : null;
  if (!bytes) fail("invalid_request", "Portable project bytes are invalid.");
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_PROJECT_BYTES) {
    fail("resource_limit", "Portable project bytes exceed the Linux tracer limit.");
  }
  return bytes;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function safeProjectName(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 180) {
    fail("invalid_request", "Portable project name is invalid.");
  }
  const leaf = basename(value).replace(/[\u0000-\u001f\u007f]/gu, "").trim();
  if (!leaf || leaf === "." || leaf === "..") fail("invalid_request", "Portable project name is invalid.");
  return leaf.toLowerCase().endsWith(".pitched") ? leaf : `${leaf}.pitched`;
}

function transactionId(value) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/u.test(value)) {
    fail("invalid_request", "Document transaction identity is invalid.");
  }
  return value;
}

function saveTicket(value) {
  if (!value || !Number.isSafeInteger(value.sequence) || value.sequence < 1
    || !Number.isSafeInteger(value.revision) || value.revision < 0) {
    fail("invalid_request", "Document save ticket is invalid.");
  }
  return Object.freeze({ sequence: value.sequence, revision: value.revision });
}

async function readRegularProject(pathname) {
  const stat = await fs.lstat(pathname).catch((error) => {
    if (error?.code === "ENOENT") fail("not_found", "The selected project is unavailable.");
    throw error;
  });
  if (!stat.isFile() || stat.isSymbolicLink()) fail("invalid_request", "The selected project is not a regular file.");
  if (stat.size < 1 || stat.size > MAX_PROJECT_BYTES) {
    fail("resource_limit", "The selected project exceeds the Linux tracer limit.");
  }
  const bytes = new Uint8Array(await fs.readFile(pathname));
  if (bytes.byteLength !== stat.size) fail("verification_failed", "The selected project changed while it was read.");
  return bytes;
}

function createLinuxDocumentAuthority() {
  const grants = new Map();
  const issuedReceipts = new WeakSet();
  let pendingOpenGrant = null;
  let boundDocument = null;
  let generation = 1;

  const requireGrant = (grantId, scope) => {
    if (typeof grantId !== "string" || grantId.length > 96) fail("invalid_request", "Document grant is invalid.");
    const grant = grants.get(grantId);
    if (!grant || grant.generation !== generation || grant.scope !== scope) {
      fail("grant_expired", "Document authority expired. Choose the project again.");
    }
    return grant;
  };

  const revokeGrant = (grantId) => {
    if (!grantId) return;
    grants.delete(grantId);
    if (pendingOpenGrant === grantId) pendingOpenGrant = null;
  };

  return Object.freeze({
    get generation() {
      return generation;
    },

    async admitOpenPath(pathname) {
      if (typeof pathname !== "string" || !pathname) fail("invalid_request", "Selected project authority is invalid.");
      if (grants.size >= MAX_ACTIVE_GRANTS) fail("resource_limit", "Too many document grants are active.");
      if (extname(pathname).toLowerCase() !== ".pitched") fail("invalid_request", "Choose a .pitched project.");
      if (pendingOpenGrant) revokeGrant(pendingOpenGrant);
      const bytes = await readRegularProject(pathname);
      const grantId = `drift-grant-${randomUUID()}`;
      grants.set(grantId, Object.freeze({
        id: grantId,
        scope: "pending-open",
        path: resolve(pathname),
        generation,
        sha256: sha256(bytes),
        byteLength: bytes.byteLength,
      }));
      pendingOpenGrant = grantId;
      return Object.freeze({
        grantId,
        name: safeProjectName(basename(pathname)),
        mimeType: PROJECT_MIME,
        bytes,
      });
    },

    async finalizeOpen(grantId) {
      const grant = requireGrant(grantId, "pending-open");
      const bytes = await readRegularProject(grant.path);
      const digest = sha256(bytes);
      if (bytes.byteLength !== grant.byteLength || digest !== grant.sha256) {
        revokeGrant(grantId);
        fail("verification_failed", "The selected project changed before Open completed.");
      }
      boundDocument = Object.freeze({ path: grant.path, sha256: digest, byteLength: bytes.byteLength });
      revokeGrant(grantId);
      return Object.freeze({
        sha256: digest,
        byteLength: bytes.byteLength,
        bound: true,
        conflict: false,
        readbackVerified: true,
      });
    },

    abandonOpen(grantId) {
      if (grantId && pendingOpenGrant === grantId) revokeGrant(grantId);
    },

    async saveToPath(pathname, request) {
      if (request?.operation !== "save" && request?.operation !== "save-as") {
        fail("invalid_request", "Document save operation is invalid.");
      }
      const id = transactionId(request.transactionId);
      const ticket = saveTicket(request.ticket);
      const bytes = projectBytes(request.bytes);
      const destination = resolve(pathname);
      safeProjectName(request.suggestedName);
      if (extname(destination).toLowerCase() !== ".pitched") {
        fail("invalid_request", "Document destination must use the .pitched extension.");
      }
      const stage = join(dirname(destination), `.${basename(destination)}.drift-stage-${randomUUID()}`);
      const backup = join(dirname(destination), `.${basename(destination)}.drift-backup-${randomUUID()}`);
      let handle = null;
      let previous = null;
      let committed = false;
      try {
        handle = await fs.open(stage, "wx", 0o600);
        await handle.writeFile(bytes);
        await handle.sync();
        await handle.close();
        handle = null;
        const staged = new Uint8Array(await fs.readFile(stage));
        const expectedSha256 = sha256(bytes);
        if (staged.byteLength !== bytes.byteLength || sha256(staged) !== expectedSha256) {
          fail("verification_failed", "Staged project readback did not match the requested bytes.");
        }
        try {
          previous = await readRegularProject(destination);
          const backupHandle = await fs.open(backup, "wx", 0o600);
          try {
            await backupHandle.writeFile(previous);
            await backupHandle.sync();
          } finally {
            await backupHandle.close();
          }
          const backedUp = new Uint8Array(await fs.readFile(backup));
          if (backedUp.byteLength !== previous.byteLength || sha256(backedUp) !== sha256(previous)) {
            fail("verification_failed", "Existing destination backup failed readback.");
          }
          const current = await readRegularProject(destination);
          if (current.byteLength !== previous.byteLength || sha256(current) !== sha256(previous)) {
            fail("conflict", "The project destination changed before commit.");
          }
        } catch (error) {
          if (!(error instanceof LinuxDocumentAuthorityError) || error.code !== "not_found") throw error;
          previous = null;
        }
        await fs.rename(stage, destination);
        committed = true;
        try {
          const published = await readRegularProject(destination);
          if (published.byteLength !== bytes.byteLength || sha256(published) !== expectedSha256) {
            fail("verification_failed", "Committed project readback did not match the staged bytes.");
          }
        } catch (error) {
          if (previous) await fs.rename(backup, destination);
          else await fs.rm(destination, { force: true });
          committed = false;
          throw error;
        }
        boundDocument = Object.freeze({
          path: destination,
          sha256: expectedSha256,
          byteLength: bytes.byteLength,
        });
        const receipt = Object.freeze({
          operation: request.operation,
          transactionId: id,
          sequence: ticket.sequence,
          revision: ticket.revision,
          sha256: expectedSha256,
          byteLength: bytes.byteLength,
          bound: true,
          conflict: false,
          readbackVerified: true,
        });
        issuedReceipts.add(receipt);
        return receipt;
      } catch (error) {
        if (error instanceof LinuxDocumentAuthorityError) throw error;
        if (error?.code === "EACCES" || error?.code === "EPERM") {
          fail("permission_denied", "The selected project destination denied access.");
        }
        if (error?.code === "ENOSPC") fail("resource_limit", "The project destination has insufficient space.");
        throw error;
      } finally {
        if (handle) await handle.close().catch(() => undefined);
        await fs.rm(stage, { force: true }).catch(() => undefined);
        await fs.rm(backup, { force: true }).catch(() => undefined);
      }
    },

    boundPathForSave() {
      if (!boundDocument) fail("not_found", "This project has no bound Linux document destination.");
      return boundDocument.path;
    },

    acceptsReceipt(receipt) {
      return Boolean(receipt && issuedReceipts.has(receipt));
    },

    async revert(expectedSha256) {
      if (!boundDocument) fail("not_found", "This project has no bound Linux document to revert.");
      if (typeof expectedSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(expectedSha256)) {
        fail("invalid_request", "Expected project identity is invalid.");
      }
      const bytes = await readRegularProject(boundDocument.path);
      const digest = sha256(bytes);
      if (digest !== expectedSha256 || digest !== boundDocument.sha256) {
        fail("conflict", "The bound project changed outside Drift.");
      }
      return Object.freeze({
        bytes,
        receipt: Object.freeze({
          operation: "revert",
          transactionId: `linux-revert-${randomUUID()}`,
          sequence: null,
          revision: null,
          sha256: digest,
          byteLength: bytes.byteLength,
          bound: true,
          conflict: false,
          readbackVerified: true,
        }),
      });
    },

    revokeAll() {
      generation += 1;
      grants.clear();
      pendingOpenGrant = null;
      boundDocument = null;
    },

    inspect() {
      return Object.freeze({
        generation,
        activeGrantCount: grants.size,
        pendingOpen: pendingOpenGrant !== null,
        documentBound: boundDocument !== null,
      });
    },
  });
}

module.exports = Object.freeze({
  LinuxDocumentAuthorityError,
  MAX_PROJECT_BYTES,
  PROJECT_MIME,
  createLinuxDocumentAuthority,
});
