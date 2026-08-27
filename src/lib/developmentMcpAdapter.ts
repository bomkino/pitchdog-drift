import type { ProductAutomationService } from "../core/automation/productAutomationService";
import { DRIFT_AUTOMATION_WRITE_SCOPE } from "../core/automation/productAutomationMutation";
import { DRIFT_AUTOMATION_PREVIEW_SCOPE } from "../core/automation/productAutomationPreview";
import {
  DRIFT_AUTOMATION_PRODUCT_ID,
  DRIFT_AUTOMATION_PROTOCOL_VERSION,
} from "../core/automation/selfDescription";

const DEFAULT_MAXIMUM_REQUEST_BYTES = 65_536;
const DEFAULT_MAXIMUM_REQUESTS_PER_SESSION = 512;

export type AutomationProtocolErrorCode =
  | "disabled"
  | "wrong_product"
  | "wrong_protocol"
  | "invalid_client"
  | "invalid_session"
  | "request_size"
  | "request_limit"
  | "invalid_request"
  | "scope_required"
  | "read_only";

export class AutomationProtocolError extends Error {
  readonly code: AutomationProtocolErrorCode;

  constructor(code: AutomationProtocolErrorCode, message: string) {
    super(message);
    this.name = "AutomationProtocolError";
    this.code = code;
  }
}

export interface DevelopmentMcpAdapterOptions {
  readonly enabled?: boolean;
  readonly issueSessionId?: () => string;
  readonly maximumRequestBytes?: number;
  readonly maximumRequestsPerSession?: number;
  readonly enabledScopes?: readonly (typeof DRIFT_AUTOMATION_WRITE_SCOPE | typeof DRIFT_AUTOMATION_PREVIEW_SCOPE)[];
}

type DevelopmentMcpScope =
  | "metadata-only-read"
  | typeof DRIFT_AUTOMATION_WRITE_SCOPE
  | typeof DRIFT_AUTOMATION_PREVIEW_SCOPE;

export interface DevelopmentMcpSession {
  readonly id: string;
  readonly productId: typeof DRIFT_AUTOMATION_PRODUCT_ID;
  readonly protocolVersion: typeof DRIFT_AUTOMATION_PROTOCOL_VERSION;
  readonly scope: "metadata-only-read";
  readonly scopes: readonly DevelopmentMcpScope[];
}

export interface DevelopmentMcpRequest {
  readonly id: string | number;
  readonly method: string;
  readonly params?: unknown;
}

export interface DevelopmentMcpResponse {
  readonly id: string | number;
  readonly result: unknown;
}

interface SessionState {
  count: number;
  readonly scopes: readonly DevelopmentMcpScope[];
}

export interface DevelopmentMcpAdapter {
  isEnabled(): boolean;
  connectionState(): "disconnected" | "connected";
  connect(input: {
    readonly productId: string;
    readonly protocolVersion: number;
    readonly clientId: string;
    readonly requestedScopes?: readonly string[];
  }): DevelopmentMcpSession;
  request(sessionId: string, message: DevelopmentMcpRequest): DevelopmentMcpResponse;
  disconnect(sessionId: string): boolean;
  revokeAll(): void;
  activeSessionCount(): number;
  setEnabled(value: boolean): void;
  setWriteScopeEnabled(value: boolean): void;
  setPreviewScopeEnabled(value: boolean): void;
  replaceService(next: ProductAutomationService): void;
  subscribe(listener: (state: "disconnected" | "connected") => void): () => void;
}

function defaultSessionId(): string {
  const cryptoObject = globalThis.crypto;
  return typeof cryptoObject?.randomUUID === "function"
    ? cryptoObject.randomUUID()
    : `session-${Date.now().toString(36)}`;
}

function positiveLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new TypeError("Automation adapter limits must be positive safe integers.");
  }
  return value;
}

function plainRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AutomationProtocolError("invalid_request", "Automation request params must be an object.");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new AutomationProtocolError("invalid_request", "Automation request params must be a plain object.");
  }
  return value as Record<string, unknown>;
}

function bytesToBase64(bytes: Uint8Array): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let result = "";
  for (let index = 0; index < bytes.length; index += 3) {
    const a = bytes[index]!;
    const b = bytes[index + 1];
    const c = bytes[index + 2];
    result += alphabet[a >> 2];
    result += alphabet[((a & 3) << 4) | ((b ?? 0) >> 4)];
    result += b === undefined ? "=" : alphabet[((b & 15) << 2) | ((c ?? 0) >> 6)];
    result += c === undefined ? "=" : alphabet[c & 63];
  }
  return result;
}

/**
 * Opt-in development tracer. It is deliberately in-process: the production
 * package gains no listener, filesystem, shell, path or network authority.
 */
export function createDevelopmentMcpAdapter(
  initialService: ProductAutomationService,
  options: DevelopmentMcpAdapterOptions = {},
): DevelopmentMcpAdapter {
  let service = initialService;
  let enabled = options.enabled === true;
  const issueSessionId = options.issueSessionId ?? defaultSessionId;
  const maximumRequestBytes = positiveLimit(options.maximumRequestBytes, DEFAULT_MAXIMUM_REQUEST_BYTES);
  const maximumRequestsPerSession = positiveLimit(
    options.maximumRequestsPerSession,
    DEFAULT_MAXIMUM_REQUESTS_PER_SESSION,
  );
  const enabledScopes = new Set(options.enabledScopes ?? []);
  const sessions = new Map<string, SessionState>();
  const listeners = new Set<(state: "disconnected" | "connected") => void>();

  const connectionState = () => sessions.size > 0 ? "connected" as const : "disconnected" as const;
  const notify = () => {
    const state = connectionState();
    for (const listener of listeners) listener(state);
  };

  function connect(input: {
    readonly productId: string;
    readonly protocolVersion: number;
    readonly clientId: string;
    readonly requestedScopes?: readonly string[];
  }): DevelopmentMcpSession {
    if (!enabled) throw new AutomationProtocolError("disabled", "Drift development automation is disabled.");
    if (input.productId !== DRIFT_AUTOMATION_PRODUCT_ID) {
      throw new AutomationProtocolError("wrong_product", "Automation client requested the wrong product.");
    }
    if (input.protocolVersion !== DRIFT_AUTOMATION_PROTOCOL_VERSION) {
      throw new AutomationProtocolError("wrong_protocol", "Automation client requested the wrong protocol version.");
    }
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(input.clientId)) {
      throw new AutomationProtocolError("invalid_client", "Automation client id is invalid.");
    }
    const requestedScopes = input.requestedScopes ?? [];
    if (!Array.isArray(requestedScopes)
      || requestedScopes.some((scope) => (
        scope !== DRIFT_AUTOMATION_WRITE_SCOPE && scope !== DRIFT_AUTOMATION_PREVIEW_SCOPE
      ))) {
      throw new AutomationProtocolError("scope_required", "Automation client requested an unknown scope.");
    }
    if (requestedScopes.some((scope) => !enabledScopes.has(scope))) {
      throw new AutomationProtocolError("scope_required", "Automation project-write scope is not enabled.");
    }
    const id = issueSessionId();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(id) || sessions.has(id)) {
      throw new AutomationProtocolError("invalid_session", "Automation session id is invalid or already active.");
    }
    const scopes = Object.freeze([
      "metadata-only-read" as const,
      ...(requestedScopes.includes(DRIFT_AUTOMATION_WRITE_SCOPE)
        ? [DRIFT_AUTOMATION_WRITE_SCOPE] as const
        : []),
      ...(requestedScopes.includes(DRIFT_AUTOMATION_PREVIEW_SCOPE)
        ? [DRIFT_AUTOMATION_PREVIEW_SCOPE] as const
        : []),
    ]);
    sessions.set(id, { count: 0, scopes });
    notify();
    return Object.freeze({
      id,
      productId: DRIFT_AUTOMATION_PRODUCT_ID,
      protocolVersion: DRIFT_AUTOMATION_PROTOCOL_VERSION,
      scope: "metadata-only-read" as const,
      scopes,
    });
  }

  function request(sessionId: string, message: DevelopmentMcpRequest): DevelopmentMcpResponse {
    const session = sessions.get(sessionId);
    if (!session) throw new AutomationProtocolError("invalid_session", "Automation session is not active.");
    let encoded: string;
    try {
      encoded = JSON.stringify(message);
    } catch {
      throw new AutomationProtocolError("invalid_request", "Automation request is not valid JSON.");
    }
    if (new TextEncoder().encode(encoded).byteLength > maximumRequestBytes) {
      throw new AutomationProtocolError("request_size", "Automation request exceeds the configured size limit.");
    }
    session.count += 1;
    if (session.count > maximumRequestsPerSession) {
      sessions.delete(sessionId);
      throw new AutomationProtocolError("request_limit", "Automation session exceeded its request limit.");
    }
    if ((typeof message.id !== "string" && typeof message.id !== "number") || typeof message.method !== "string") {
      throw new AutomationProtocolError("invalid_request", "Automation request requires an id and method.");
    }

    const params = plainRecord(message.params ?? {});
    let result: unknown;
    switch (message.method) {
    case "resources/list":
      result = service.listResources();
      break;
    case "resources/read":
      if (typeof params.uri !== "string") {
        throw new AutomationProtocolError("invalid_request", "resources/read requires a resource URI.");
      }
      result = service.readResource(params.uri);
      break;
    case "tools/list":
      result = [{
        name: "drift.get_manifest",
        description: "Read one generated Drift metadata manifest.",
        inputSchema: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
          additionalProperties: false,
        },
      }, ...(session.scopes.includes(DRIFT_AUTOMATION_WRITE_SCOPE) && service.mutation ? [{
        name: "drift.plan_change",
        description: "Plan one typed Drift Project change without mutating it.",
        inputSchema: {
          type: "object",
          properties: {
            intent: { type: "object" },
            idempotencyKey: { type: "string" },
            expiresInMs: { type: "integer" },
          },
          required: ["intent", "idempotencyKey"],
          additionalProperties: false,
        },
      }, {
        name: "drift.apply_change",
        description: "Apply one current, reviewed Drift change plan exactly once.",
        inputSchema: {
          type: "object",
          properties: { planId: { type: "string" } },
          required: ["planId"],
          additionalProperties: false,
        },
      }, {
        name: "drift.undo_change",
        description: "Undo one still-eligible Drift automation receipt.",
        inputSchema: {
          type: "object",
          properties: { receiptId: { type: "string" } },
          required: ["receiptId"],
          additionalProperties: false,
        },
      }] : []), ...(session.scopes.includes(DRIFT_AUTOMATION_PREVIEW_SCOPE) && service.preview ? [{
        name: "drift.start_preview",
        description: "Start one bounded, expiring PNG preview from canonical renderer truth.",
        inputSchema: {
          type: "object",
          properties: {
            width: { type: "integer" },
            height: { type: "integer" },
            timeSeconds: { type: "number" },
            maximumBytes: { type: "integer" },
            expiresInMs: { type: "integer" },
          },
          required: ["width", "height", "timeSeconds"],
          additionalProperties: false,
        },
      }, {
        name: "drift.get_preview",
        description: "Read status and, when complete, bounded PNG bytes for this session's preview.",
        inputSchema: {
          type: "object",
          properties: { previewId: { type: "string" } },
          required: ["previewId"],
          additionalProperties: false,
        },
      }, {
        name: "drift.cancel_preview",
        description: "Cancel this session's running bounded preview.",
        inputSchema: {
          type: "object",
          properties: { previewId: { type: "string" } },
          required: ["previewId"],
          additionalProperties: false,
        },
      }] : [])];
      break;
    case "tools/call": {
      const args = plainRecord(params.arguments);
      if (params.name === "drift.get_manifest") {
        if (typeof args.id !== "string") {
          throw new AutomationProtocolError("invalid_request", "drift.get_manifest requires a manifest id.");
        }
        result = service.getManifest(args.id);
        break;
      }
      if (!session.scopes.includes(DRIFT_AUTOMATION_WRITE_SCOPE) || !service.mutation) {
        if (!session.scopes.includes(DRIFT_AUTOMATION_PREVIEW_SCOPE) || !service.preview) {
          throw new AutomationProtocolError("read_only", "Drift automation session has metadata-only access.");
        }
      }
      if (params.name === "drift.plan_change" && service.mutation
        && session.scopes.includes(DRIFT_AUTOMATION_WRITE_SCOPE)) {
        if (typeof args.idempotencyKey !== "string" || !args.intent || typeof args.intent !== "object") {
          throw new AutomationProtocolError("invalid_request", "drift.plan_change requires intent and idempotencyKey.");
        }
        if (args.expiresInMs !== undefined && typeof args.expiresInMs !== "number") {
          throw new AutomationProtocolError("invalid_request", "drift.plan_change expiresInMs must be a number.");
        }
        result = service.mutation.plan({
          intent: args.intent as Parameters<typeof service.mutation.plan>[0]["intent"],
          idempotencyKey: args.idempotencyKey,
          ...(args.expiresInMs === undefined ? {} : { expiresInMs: args.expiresInMs }),
          requesterIdentity: sessionId,
        });
        break;
      }
      if (params.name === "drift.apply_change" && service.mutation
        && session.scopes.includes(DRIFT_AUTOMATION_WRITE_SCOPE)) {
        if (typeof args.planId !== "string") {
          throw new AutomationProtocolError("invalid_request", "drift.apply_change requires planId.");
        }
        result = service.mutation.apply(args.planId, sessionId);
        break;
      }
      if (params.name === "drift.undo_change" && service.mutation
        && session.scopes.includes(DRIFT_AUTOMATION_WRITE_SCOPE)) {
        if (typeof args.receiptId !== "string") {
          throw new AutomationProtocolError("invalid_request", "drift.undo_change requires receiptId.");
        }
        result = service.mutation.undo(args.receiptId, sessionId);
        break;
      }
      if (params.name === "drift.start_preview" && service.preview
        && session.scopes.includes(DRIFT_AUTOMATION_PREVIEW_SCOPE)) {
        if (typeof args.width !== "number" || typeof args.height !== "number" || typeof args.timeSeconds !== "number") {
          throw new AutomationProtocolError("invalid_request", "drift.start_preview requires width, height, and timeSeconds.");
        }
        result = service.preview.start({
          requesterIdentity: sessionId,
          width: args.width,
          height: args.height,
          timeSeconds: args.timeSeconds,
          ...(args.maximumBytes === undefined ? {} : { maximumBytes: args.maximumBytes as number }),
          ...(args.expiresInMs === undefined ? {} : { expiresInMs: args.expiresInMs as number }),
        });
        break;
      }
      if (params.name === "drift.get_preview" && service.preview
        && session.scopes.includes(DRIFT_AUTOMATION_PREVIEW_SCOPE)) {
        if (typeof args.previewId !== "string") {
          throw new AutomationProtocolError("invalid_request", "drift.get_preview requires previewId.");
        }
        const preview = service.preview.result(args.previewId, sessionId);
        result = preview ? {
          status: preview.status,
          mimeType: preview.mimeType,
          dataBase64: bytesToBase64(preview.bytes),
        } : { status: service.preview.status(args.previewId, sessionId), mimeType: null, dataBase64: null };
        break;
      }
      if (params.name === "drift.cancel_preview" && service.preview
        && session.scopes.includes(DRIFT_AUTOMATION_PREVIEW_SCOPE)) {
        if (typeof args.previewId !== "string") {
          throw new AutomationProtocolError("invalid_request", "drift.cancel_preview requires previewId.");
        }
        result = service.preview.cancel(args.previewId, sessionId);
        break;
      }
      throw new AutomationProtocolError("read_only", "Drift automation tool is not available.");
    }
    default:
      throw new AutomationProtocolError("read_only", "Drift development automation is read-only.");
    }
    return Object.freeze({ id: message.id, result });
  }

  const adapter: DevelopmentMcpAdapter = {
    isEnabled: () => enabled,
    connectionState,
    connect,
    request,
    disconnect: (sessionId: string) => {
      const removed = sessions.delete(sessionId);
      if (removed) {
        service.preview?.revokeRequester(sessionId);
        notify();
      }
      return removed;
    },
    revokeAll: () => {
      if (sessions.size === 0) return;
      for (const id of sessions.keys()) service.preview?.revokeRequester(id);
      sessions.clear();
      notify();
    },
    activeSessionCount: () => sessions.size,
    setEnabled: (value: boolean) => {
      enabled = value;
      if (!enabled) adapter.revokeAll();
    },
    setWriteScopeEnabled: (value: boolean) => {
      if (value) {
        enabledScopes.add(DRIFT_AUTOMATION_WRITE_SCOPE);
        return;
      }
      enabledScopes.delete(DRIFT_AUTOMATION_WRITE_SCOPE);
      let removed = false;
      for (const [id, session] of sessions) {
        if (!session.scopes.includes(DRIFT_AUTOMATION_WRITE_SCOPE)) continue;
        sessions.delete(id);
        service.preview?.revokeRequester(id);
        removed = true;
      }
      if (removed) notify();
    },
    setPreviewScopeEnabled: (value: boolean) => {
      if (value) {
        enabledScopes.add(DRIFT_AUTOMATION_PREVIEW_SCOPE);
        return;
      }
      enabledScopes.delete(DRIFT_AUTOMATION_PREVIEW_SCOPE);
      let removed = false;
      for (const [id, session] of sessions) {
        if (!session.scopes.includes(DRIFT_AUTOMATION_PREVIEW_SCOPE)) continue;
        sessions.delete(id);
        service.preview?.revokeRequester(id);
        removed = true;
      }
      if (removed) notify();
    },
    replaceService: (next: ProductAutomationService) => {
      service = next;
    },
    subscribe: (listener: (state: "disconnected" | "connected") => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return Object.freeze(adapter);
}
