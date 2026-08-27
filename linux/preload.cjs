"use strict";

const { contextBridge, ipcRenderer } = require("electron");
const { IPC_CHANNEL, IPC_PROTOCOL } = require("./ipcContract.cjs");

const prefix = "--drift-linux-generation=";
const generation = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? "";
if (!/^[a-f0-9-]{36}$/u.test(generation)) throw new Error("Drift Linux session generation is unavailable.");

let sequence = 0;
const invoke = (method, payload) => {
  sequence += 1;
  return ipcRenderer.invoke(IPC_CHANNEL, Object.freeze({
    protocol: IPC_PROTOCOL,
    requestId: `renderer-${sequence}`,
    generation,
    method,
    payload,
  }));
};

const marker = Object.freeze({
  bridgeVersion: 1,
  platform: "Linux",
  target: "linux-electron-tracer",
  protocol: IPC_PROTOCOL,
  sandboxed: process.sandboxed === true,
  contextIsolated: true,
  nodeIntegration: false,
  genericAuthority: false,
});

contextBridge.exposeInMainWorld("__DRIFT_LINUX_DESKTOP__", Object.freeze({
  marker,
  choosePortableProject: () => invoke("documents.choose", Object.freeze({})),
  finalizePortableProjectOpen: (grantId) => invoke(
    "documents.finalize-open",
    Object.freeze({ grantId }),
  ),
  abandonPortableProjectOpen: (grantId) => invoke(
    "documents.abandon-open",
    Object.freeze({ grantId }),
  ),
  savePortableProject: (request) => invoke("documents.save", Object.freeze(request)),
  revertPortableProject: (expectedSha256) => invoke(
    "documents.revert",
    Object.freeze({ expectedSha256 }),
  ),
}));
