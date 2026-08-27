import type { ProductAutomationService } from "../core/automation/productAutomationService";
import { stableAutomationJson } from "../core/automation/selfDescription";

export interface AutomationAccessViewProps {
  readonly enabled: boolean;
  readonly writeEnabled?: boolean;
  readonly connectionState: "disconnected" | "connected";
  readonly service: ProductAutomationService;
  readonly onEnabledChange: (enabled: boolean) => void;
  readonly onWriteEnabledChange?: (enabled: boolean) => void;
  readonly onUndoReceipt?: (receiptId: string) => void;
  readonly onDisconnect?: () => void;
}

/** Exact human-readable projection of the resources offered to MCP clients. */
export function AutomationAccessView({
  enabled,
  writeEnabled = false,
  connectionState,
  service,
  onEnabledChange,
  onWriteEnabledChange,
  onUndoReceipt,
  onDisconnect,
}: AutomationAccessViewProps) {
  return (
    <details className="automation-access">
      <summary>Show what Codex can see</summary>
      <div className="automation-access__body">
        <div className="automation-access__status">
          <strong>{writeEnabled ? "Metadata + typed Project changes" : "Metadata only"}</strong>
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
        {service.mutation ? (
          <label>
            <input
              type="checkbox"
              checked={writeEnabled}
              disabled={!enabled}
              onChange={(event) => onWriteEnabledChange?.(event.currentTarget.checked)}
            />
            Allow typed Project changes with plan, apply, and receipt
          </label>
        ) : null}
        <p>Drift grants only this local app session. Your configured client or model provider has separate privacy terms.</p>
        <button
          type="button"
          disabled={connectionState === "disconnected" && !enabled}
          onClick={() => {
            onDisconnect?.();
            onEnabledChange(false);
          }}
        >Disconnect and revoke</button>
        <p>Snapshot {service.snapshotIdentity}</p>
        {service.mutation && service.mutation.listApplyReceipts().length > 0 ? (
          <div className="automation-access__receipts" aria-label="Automation change receipts">
            <strong>Change receipts</strong>
            {service.mutation.listApplyReceipts().map((receipt) => (
              <div key={receipt.id}>
                <span>{receipt.intent.recipeId} · revision {receipt.fromRevision} → {receipt.toRevision}</span>
                <button
                  type="button"
                  disabled={!receipt.undoEligible}
                  onClick={() => onUndoReceipt?.(receipt.id)}
                >{receipt.undoEligible ? "Undo" : "Undone"}</button>
              </div>
            ))}
          </div>
        ) : null}
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
