import type { ProductAutomationService } from "../core/automation/productAutomationService";
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
}

export interface DevelopmentMcpSession {
  readonly id: string;
  readonly productId: typeof DRIFT_AUTOMATION_PRODUCT_ID;
  readonly protocolVersion: typeof DRIFT_AUTOMATION_PROTOCOL_VERSION;
  readonly scope: "metadata-only-read";
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
}

export interface DevelopmentMcpAdapter {
  isEnabled(): boolean;
  connectionState(): "disconnected" | "connected";
  connect(input: {
    readonly productId: string;
    readonly protocolVersion: number;
    readonly clientId: string;
  }): DevelopmentMcpSession;
  request(sessionId: string, message: DevelopmentMcpRequest): DevelopmentMcpResponse;
  disconnect(sessionId: string): boolean;
  revokeAll(): void;
  activeSessionCount(): number;
  setEnabled(value: boolean): void;
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
    const id = issueSessionId();
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(id) || sessions.has(id)) {
      throw new AutomationProtocolError("invalid_session", "Automation session id is invalid or already active.");
    }
    sessions.set(id, { count: 0 });
    notify();
    return Object.freeze({
      id,
      productId: DRIFT_AUTOMATION_PRODUCT_ID,
      protocolVersion: DRIFT_AUTOMATION_PROTOCOL_VERSION,
      scope: "metadata-only-read" as const,
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
      }];
      break;
    case "tools/call": {
      if (params.name !== "drift.get_manifest") {
        throw new AutomationProtocolError("read_only", "Drift automation exposes read-only manifest tools only.");
      }
      const args = plainRecord(params.arguments);
      if (typeof args.id !== "string") {
        throw new AutomationProtocolError("invalid_request", "drift.get_manifest requires a manifest id.");
      }
      result = service.getManifest(args.id);
      break;
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
      if (removed) notify();
      return removed;
    },
    revokeAll: () => {
      if (sessions.size === 0) return;
      sessions.clear();
      notify();
    },
    activeSessionCount: () => sessions.size,
    setEnabled: (value: boolean) => {
      enabled = value;
      if (!enabled) adapter.revokeAll();
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
