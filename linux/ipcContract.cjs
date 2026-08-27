"use strict";

const { LinuxDocumentAuthorityError, MAX_PROJECT_BYTES } = require("./documentAuthority.cjs");

const IPC_CHANNEL = "drift:desktop-platform:v1";
const IPC_PROTOCOL = "dog.pitch.drift/desktop-platform/1";
const METHODS = Object.freeze([
  "documents.choose",
  "documents.finalize-open",
  "documents.abandon-open",
  "documents.save",
  "documents.revert",
]);
const METHOD_SET = new Set(METHODS);
const MAX_CONTROL_BYTES = 16 * 1024;

function invalid(message) {
  throw new LinuxDocumentAuthorityError("invalid_request", message);
}

function plainRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactKeys(value, keys) {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    invalid("Desktop request shape is invalid.");
  }
}

function boundedString(value, label, maximum = 256) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) {
    invalid(`${label} is invalid.`);
  }
  return value;
}

function validatePayload(method, payload) {
  if (!plainRecord(payload)) invalid("Desktop request payload is invalid.");
  switch (method) {
  case "documents.choose":
    exactKeys(payload, []);
    return Object.freeze({});
  case "documents.finalize-open":
  case "documents.abandon-open":
    exactKeys(payload, ["grantId"]);
    return Object.freeze({ grantId: boundedString(payload.grantId, "Document grant", 96) });
  case "documents.save": {
    exactKeys(payload, ["bytes", "operation", "suggestedName", "ticket", "transactionId"]);
    if (payload.operation !== "save" && payload.operation !== "save-as") invalid("Document save operation is invalid.");
    if (!plainRecord(payload.ticket)) invalid("Document save ticket is invalid.");
    exactKeys(payload.ticket, ["revision", "sequence"]);
    if (!Number.isSafeInteger(payload.ticket.sequence) || payload.ticket.sequence < 1
      || !Number.isSafeInteger(payload.ticket.revision) || payload.ticket.revision < 0) {
      invalid("Document save ticket is invalid.");
    }
    const bytes = payload.bytes instanceof Uint8Array
      ? payload.bytes
      : payload.bytes instanceof ArrayBuffer
        ? new Uint8Array(payload.bytes)
        : null;
    if (!bytes || bytes.byteLength < 1 || bytes.byteLength > MAX_PROJECT_BYTES) {
      throw new LinuxDocumentAuthorityError("resource_limit", "Portable project bytes exceed the Linux tracer limit.");
    }
    return Object.freeze({
      operation: payload.operation,
      transactionId: boundedString(payload.transactionId, "Document transaction", 128),
      ticket: Object.freeze({ sequence: payload.ticket.sequence, revision: payload.ticket.revision }),
      bytes: new Uint8Array(bytes),
      suggestedName: boundedString(payload.suggestedName, "Suggested project name", 180),
    });
  }
  case "documents.revert":
    exactKeys(payload, ["expectedSha256"]);
    if (typeof payload.expectedSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(payload.expectedSha256)) {
      invalid("Expected project identity is invalid.");
    }
    return Object.freeze({ expectedSha256: payload.expectedSha256 });
  default:
    invalid("Desktop request method is unavailable.");
  }
}

function controlSize(envelope) {
  const copy = envelope.method === "documents.save"
    ? { ...envelope, payload: { ...envelope.payload, bytes: `[${envelope.payload.bytes?.byteLength ?? 0} bytes]` } }
    : envelope;
  return Buffer.byteLength(JSON.stringify(copy), "utf8");
}

function validateDesktopRequest(value, expectedGeneration) {
  if (!plainRecord(value)) invalid("Desktop request envelope is invalid.");
  exactKeys(value, ["generation", "method", "payload", "protocol", "requestId"]);
  if (value.protocol !== IPC_PROTOCOL) invalid("Desktop request protocol is invalid.");
  const requestId = boundedString(value.requestId, "Desktop request identity", 96);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/u.test(requestId)) invalid("Desktop request identity is invalid.");
  const generation = boundedString(value.generation, "Desktop generation", 96);
  if (generation !== expectedGeneration) {
    throw new LinuxDocumentAuthorityError("grant_expired", "Desktop session generation expired.");
  }
  const method = boundedString(value.method, "Desktop request method", 64);
  if (!METHOD_SET.has(method)) invalid("Desktop request method is unavailable.");
  if (controlSize(value) > MAX_CONTROL_BYTES) {
    throw new LinuxDocumentAuthorityError("resource_limit", "Desktop request metadata exceeds its limit.");
  }
  return Object.freeze({
    protocol: IPC_PROTOCOL,
    requestId,
    generation,
    method,
    payload: validatePayload(method, value.payload),
  });
}

function safeDesktopFailure(error) {
  if (error instanceof LinuxDocumentAuthorityError) {
    return Object.freeze({ code: error.code, message: error.message.slice(0, 256) });
  }
  return Object.freeze({
    code: "internal_error",
    message: "Linux document authority failed.",
  });
}

module.exports = Object.freeze({
  IPC_CHANNEL,
  IPC_PROTOCOL,
  METHODS,
  safeDesktopFailure,
  validateDesktopRequest,
});
