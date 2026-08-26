import type { ProductAutomationService } from "../core/automation/productAutomationService";
import { stableAutomationJson } from "../core/automation/selfDescription";

export interface AutomationAccessViewProps {
  readonly enabled: boolean;
  readonly connectionState: "disconnected" | "connected";
  readonly service: ProductAutomationService;
  readonly onEnabledChange: (enabled: boolean) => void;
  readonly onDisconnect?: () => void;
}

/** Exact human-readable projection of the resources offered to MCP clients. */
export function AutomationAccessView({
  enabled,
  connectionState,
  service,
  onEnabledChange,
  onDisconnect,
}: AutomationAccessViewProps) {
  return (
    <details className="automation-access">
      <summary>Show what Codex can see</summary>
      <div className="automation-access__body">
        <div className="automation-access__status">
          <strong>Metadata only</strong>
          <span>{enabled ? "Enabled for local development" : "Disabled"}</span>
          <span>{connectionState}</span>
        </div>
        <label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => onEnabledChange(event.currentTarget.checked)}
          />
          Allow read-only local development access
        </label>
        <button
          type="button"
          disabled={connectionState === "disconnected" && !enabled}
          onClick={() => {
            onDisconnect?.();
            onEnabledChange(false);
          }}
        >Disconnect and revoke</button>
        <p>Snapshot {service.snapshotIdentity}</p>
        <div className="automation-access__resources">
          {service.listResources().map((resource) => (
            <details key={resource.uri}>
              <summary>{resource.name}</summary>
              <pre>{stableAutomationJson(service.readResource(resource.uri))}</pre>
            </details>
          ))}
        </div>
      </div>
    </details>
  );
}
