import {
  applyProjectV4Command,
  projectV4ChangePaths,
  undoProjectV4Command,
  type AppliedProjectV4Command,
  type ProjectV4Command,
  type ProjectV4CommandDomain,
} from "../commands/projectCommand";
import type { DriftProjectV4 } from "../project/schema";
import type { ProjectRevisionState } from "../project/revisions";
import {
  applyOutcomeRecipeCommand,
  getOutcomeRecipe,
  type OutcomeRecipeId,
} from "../recipes/outcomeRecipes";
import {
  DRIFT_AUTOMATION_PRODUCT_ID,
  DRIFT_AUTOMATION_PROTOCOL_VERSION,
  automationIdentity,
  type DriftAutomationManifests,
} from "./selfDescription";

export const DRIFT_AUTOMATION_WRITE_SCOPE = "project-write" as const;

export interface AutomationOutcomeRecipeIntent {
  readonly kind: "apply-outcome-recipe";
  readonly recipeId: OutcomeRecipeId;
}

export type DriftAutomationMutationIntent = AutomationOutcomeRecipeIntent;

export interface AutomationMutationSnapshot {
  readonly project: DriftProjectV4;
  readonly revisions: ProjectRevisionState;
  readonly documentId: string;
  readonly scopes: readonly string[];
}

export interface AutomationMutationCommit {
  readonly project: DriftProjectV4;
  readonly revisions: ProjectRevisionState;
  readonly commandReceipt: AppliedProjectV4Command["receipt"];
  readonly message: string;
}

export interface AutomationMutationAuthority {
  read(): AutomationMutationSnapshot;
  commit(change: AutomationMutationCommit): void;
}

export interface AutomationMutationServiceOptions {
  readonly authority: AutomationMutationAuthority;
  readonly now?: () => string;
  readonly issueId?: (kind: "plan" | "apply" | "undo") => string;
  readonly maximumPlanLifetimeMs?: number;
}

export type AutomationMutationErrorCode =
  | "scope_required"
  | "invalid_intent"
  | "invalid_idempotency_key"
  | "invalid_expiry"
  | "plan_limit"
  | "receipt_limit"
  | "no_change"
  | "unknown_plan"
  | "expired_plan"
  | "replayed_plan"
  | "requester_changed"
  | "stale_plan"
  | "service_changed"
  | "capability_changed"
  | "unknown_receipt"
  | "undo_ineligible"
  | "stale_undo";

export class AutomationMutationError extends Error {
  readonly code: AutomationMutationErrorCode;

  constructor(code: AutomationMutationErrorCode, message: string) {
    super(message);
    this.name = "AutomationMutationError";
    this.code = code;
  }
}

export interface AutomationMutationBinding {
  readonly productId: typeof DRIFT_AUTOMATION_PRODUCT_ID;
  readonly protocolVersion: typeof DRIFT_AUTOMATION_PROTOCOL_VERSION;
  readonly buildIdentity: string;
  readonly manifestIdentity: string;
  readonly capabilityIdentity: string;
  readonly requesterIdentity: string;
  readonly documentId: string;
  readonly projectHash: string;
  readonly revision: number;
}

export interface AutomationMutationImpact {
  readonly summary: string;
  readonly ownedDomains: readonly ProjectV4CommandDomain[];
  readonly changedPaths: readonly string[];
  readonly changes: readonly {
    readonly path: string;
    readonly beforeIdentity: string;
    readonly afterIdentity: string;
  }[];
  readonly resultProjectHash: string;
}

export interface AutomationMutationPlan {
  readonly id: string;
  readonly idempotencyKey: string;
  readonly intent: DriftAutomationMutationIntent;
  readonly requiredScopes: readonly [typeof DRIFT_AUTOMATION_WRITE_SCOPE];
  readonly binding: AutomationMutationBinding;
  readonly targetIds: readonly string[];
  readonly impact: AutomationMutationImpact;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface AutomationApplyReceipt {
  readonly id: string;
  readonly planId: string;
  readonly idempotencyKey: string;
  readonly intent: DriftAutomationMutationIntent;
  readonly documentId: string;
  readonly beforeProjectHash: string;
  readonly afterProjectHash: string;
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly changedPaths: readonly string[];
  readonly appliedAt: string;
  readonly undoEligible: boolean;
}

export interface AutomationUndoReceipt {
  readonly id: string;
  readonly applyReceiptId: string;
  readonly documentId: string;
  readonly beforeProjectHash: string;
  readonly afterProjectHash: string;
  readonly fromRevision: number;
  readonly toRevision: number;
  readonly changedPaths: readonly string[];
  readonly undoneAt: string;
}

export interface ProductAutomationMutationService {
  plan(input: {
    readonly intent: DriftAutomationMutationIntent;
    readonly idempotencyKey: string;
    readonly expiresInMs?: number;
    readonly requesterIdentity?: string;
  }): AutomationMutationPlan;
  apply(planId: string, requesterIdentity?: string): AutomationApplyReceipt;
  undo(applyReceiptId: string, requesterIdentity?: string): AutomationUndoReceipt;
  getApplyReceipt(id: string): AutomationApplyReceipt | null;
  listApplyReceipts(): readonly AutomationApplyReceipt[];
  replaceManifests(manifests: DriftAutomationManifests): void;
}

interface StoredPlan {
  readonly publicPlan: AutomationMutationPlan;
  readonly previousProject: DriftProjectV4;
  readonly command: ProjectV4Command;
  consumed: boolean;
}

interface StoredApply {
  readonly receipt: AutomationApplyReceipt;
  readonly previousProject: DriftProjectV4;
  readonly command: ProjectV4Command;
  undone: boolean;
}

const DEFAULT_PLAN_LIFETIME_MS = 5 * 60 * 1000;
const MAXIMUM_PLAN_LIFETIME_MS = 15 * 60 * 1000;
const MAXIMUM_RETAINED_PLANS = 64;
const MAXIMUM_RETAINED_APPLIES = 32;

function defaultId(kind: "plan" | "apply" | "undo"): string {
  const suffix = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${kind}-${suffix}`;
}

function plainIntent(value: DriftAutomationMutationIntent): AutomationOutcomeRecipeIntent {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AutomationMutationError("invalid_intent", "Automation mutation intent must be an object.");
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new AutomationMutationError("invalid_intent", "Automation mutation intent must be a plain object.");
  }
  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== "kind" || keys[1] !== "recipeId" || value.kind !== "apply-outcome-recipe") {
    throw new AutomationMutationError("invalid_intent", "Automation mutation intent is not supported.");
  }
  try {
    return Object.freeze({ kind: value.kind, recipeId: getOutcomeRecipe(value.recipeId).id });
  } catch {
    throw new AutomationMutationError("invalid_intent", "Automation outcome recipe is not recognized.");
  }
}

function validMachineValue(value: string, label: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(value)) {
    throw new AutomationMutationError("invalid_idempotency_key", `${label} is invalid.`);
  }
  return value;
}

function timestamp(value: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new TypeError("Automation clock must return a valid timestamp.");
  return parsed;
}

function requireWriteScope(snapshot: AutomationMutationSnapshot): void {
  if (!snapshot.scopes.includes(DRIFT_AUTOMATION_WRITE_SCOPE)) {
    throw new AutomationMutationError("scope_required", "Automation project-write scope is not enabled.");
  }
}

function pathValue(project: DriftProjectV4, path: string): unknown {
  const tokens = path.replace(/\[(\d+)\]/gu, ".$1").split(".");
  let current: unknown = project;
  for (const token of tokens) {
    if (!current || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[token];
  }
  return current;
}

function clonePlan(plan: AutomationMutationPlan): AutomationMutationPlan {
  return structuredClone(plan);
}

function cloneApply(receipt: AutomationApplyReceipt): AutomationApplyReceipt {
  return structuredClone(receipt);
}

export function createProductAutomationMutationService(
  manifests: DriftAutomationManifests,
  options: AutomationMutationServiceOptions,
): ProductAutomationMutationService {
  const now = options.now ?? (() => new Date().toISOString());
  const issueId = options.issueId ?? defaultId;
  const maximumPlanLifetimeMs = options.maximumPlanLifetimeMs ?? MAXIMUM_PLAN_LIFETIME_MS;
  if (!Number.isSafeInteger(maximumPlanLifetimeMs) || maximumPlanLifetimeMs <= 0) {
    throw new TypeError("Automation maximum plan lifetime must be a positive safe integer.");
  }

  let buildIdentity = "";
  let manifestIdentity = "";
  let capabilityIdentity = "";
  const plans = new Map<string, StoredPlan>();
  const planByIdempotencyKey = new Map<string, string>();
  const applies = new Map<string, StoredApply>();

  function replaceManifests(next: DriftAutomationManifests): void {
    buildIdentity = automationIdentity(next.protocol.build);
    manifestIdentity = automationIdentity({
      protocol: next.protocol,
      vocabulary: next.vocabulary,
      defaults: next.defaults,
    });
    capabilityIdentity = automationIdentity(next.capabilities);
  }
  replaceManifests(manifests);

  function currentBinding(
    snapshot: AutomationMutationSnapshot,
    requesterIdentity: string,
  ): AutomationMutationBinding {
    return Object.freeze({
      productId: DRIFT_AUTOMATION_PRODUCT_ID,
      protocolVersion: DRIFT_AUTOMATION_PROTOCOL_VERSION,
      buildIdentity,
      manifestIdentity,
      capabilityIdentity,
      requesterIdentity,
      documentId: snapshot.documentId,
      projectHash: automationIdentity(snapshot.project),
      revision: snapshot.revisions.currentRevision,
    });
  }

  function plan(input: {
    readonly intent: DriftAutomationMutationIntent;
    readonly idempotencyKey: string;
    readonly expiresInMs?: number;
    readonly requesterIdentity?: string;
  }): AutomationMutationPlan {
    const idempotencyKey = validMachineValue(input.idempotencyKey, "Automation idempotency key");
    const intent = plainIntent(input.intent);
    const requesterIdentity = validMachineValue(
      input.requesterIdentity ?? "local-product-ui",
      "Automation requester identity",
    );
    const existingId = planByIdempotencyKey.get(idempotencyKey);
    if (existingId) {
      const existing = plans.get(existingId)!.publicPlan;
      if (automationIdentity(existing.intent) !== automationIdentity(intent)
        || existing.binding.requesterIdentity !== requesterIdentity) {
        throw new AutomationMutationError(
          "invalid_idempotency_key",
          "Automation idempotency key is already bound to a different intent.",
        );
      }
      return clonePlan(existing);
    }

    const expiresInMs = input.expiresInMs ?? DEFAULT_PLAN_LIFETIME_MS;
    if (!Number.isSafeInteger(expiresInMs) || expiresInMs <= 0 || expiresInMs > maximumPlanLifetimeMs) {
      throw new AutomationMutationError("invalid_expiry", "Automation plan expiry is outside the allowed range.");
    }
    const snapshot = options.authority.read();
    requireWriteScope(snapshot);
    if (plans.size >= MAXIMUM_RETAINED_PLANS) {
      const currentTime = timestamp(now());
      for (const [id, stored] of plans) {
        if (!stored.consumed && currentTime < timestamp(stored.publicPlan.expiresAt)) continue;
        plans.delete(id);
        planByIdempotencyKey.delete(stored.publicPlan.idempotencyKey);
      }
      if (plans.size >= MAXIMUM_RETAINED_PLANS) {
        throw new AutomationMutationError("plan_limit", "Automation retained-plan limit is reached.");
      }
    }
    const previousProject = structuredClone(snapshot.project);
    const command = applyOutcomeRecipeCommand(intent.recipeId);
    const createdAt = now();
    const applied = applyProjectV4Command(
      previousProject,
      snapshot.revisions,
      command,
      createdAt,
    );
    const changedPaths = projectV4ChangePaths(previousProject, applied.project);
    if (changedPaths.length === 0) {
      throw new AutomationMutationError("no_change", "Automation intent would not change the current Project.");
    }
    const expiresAt = new Date(timestamp(createdAt) + expiresInMs).toISOString();
    const id = validMachineValue(issueId("plan"), "Automation plan id");
    const binding = currentBinding(snapshot, requesterIdentity);
    const recipe = getOutcomeRecipe(intent.recipeId);
    const publicPlan: AutomationMutationPlan = Object.freeze({
      id,
      idempotencyKey,
      intent,
      requiredScopes: [DRIFT_AUTOMATION_WRITE_SCOPE] as const,
      binding,
      targetIds: [`outcome-recipe:${intent.recipeId}`],
      impact: {
        summary: recipe.changesSummary,
        ownedDomains: [...command.ownedDomains],
        changedPaths,
        changes: changedPaths.map((path) => ({
          path,
          beforeIdentity: automationIdentity({ value: pathValue(previousProject, path) ?? null }),
          afterIdentity: automationIdentity({ value: pathValue(applied.project, path) ?? null }),
        })),
        resultProjectHash: automationIdentity(applied.project),
      },
      createdAt,
      expiresAt,
    });
    plans.set(id, { publicPlan, previousProject, command, consumed: false });
    planByIdempotencyKey.set(idempotencyKey, id);
    return clonePlan(publicPlan);
  }

  function assertPlanCurrent(
    stored: StoredPlan,
    snapshot: AutomationMutationSnapshot,
    requesterIdentity: string,
  ): void {
    const binding = currentBinding(snapshot, requesterIdentity);
    if (binding.requesterIdentity !== stored.publicPlan.binding.requesterIdentity) {
      throw new AutomationMutationError("requester_changed", "Automation plan belongs to another client session; re-plan.");
    }
    if (binding.buildIdentity !== stored.publicPlan.binding.buildIdentity
      || binding.manifestIdentity !== stored.publicPlan.binding.manifestIdentity) {
      throw new AutomationMutationError("service_changed", "Automation service identity changed; re-plan.");
    }
    if (binding.capabilityIdentity !== stored.publicPlan.binding.capabilityIdentity) {
      throw new AutomationMutationError("capability_changed", "Automation capabilities changed; re-plan.");
    }
    if (binding.documentId !== stored.publicPlan.binding.documentId
      || binding.projectHash !== stored.publicPlan.binding.projectHash
      || binding.revision !== stored.publicPlan.binding.revision) {
      throw new AutomationMutationError("stale_plan", "Automation plan no longer matches the current document; re-plan.");
    }
  }

  function apply(planId: string, requestedBy = "local-product-ui"): AutomationApplyReceipt {
    const stored = plans.get(planId);
    if (!stored) throw new AutomationMutationError("unknown_plan", "Automation plan is unknown.");
    if (stored.consumed) throw new AutomationMutationError("replayed_plan", "Automation plan has already been applied.");
    if (timestamp(now()) >= timestamp(stored.publicPlan.expiresAt)) {
      throw new AutomationMutationError("expired_plan", "Automation plan has expired; re-plan.");
    }
    const snapshot = options.authority.read();
    requireWriteScope(snapshot);
    const requesterIdentity = validMachineValue(requestedBy, "Automation requester identity");
    assertPlanCurrent(stored, snapshot, requesterIdentity);
    const applied = applyProjectV4Command(
      snapshot.project,
      snapshot.revisions,
      stored.command,
      stored.publicPlan.createdAt,
    );
    if (automationIdentity(applied.project) !== stored.publicPlan.impact.resultProjectHash) {
      throw new AutomationMutationError("stale_plan", "Automation result differs from the reviewed plan; re-plan.");
    }
    if (applies.size >= MAXIMUM_RETAINED_APPLIES) {
      for (const [id, candidate] of applies) {
        if (!candidate.undone) continue;
        applies.delete(id);
      }
      if (applies.size >= MAXIMUM_RETAINED_APPLIES) {
        throw new AutomationMutationError("receipt_limit", "Automation eligible-receipt limit is reached.");
      }
    }
    const id = validMachineValue(issueId("apply"), "Automation apply receipt id");
    const receipt: AutomationApplyReceipt = Object.freeze({
      id,
      planId: stored.publicPlan.id,
      idempotencyKey: stored.publicPlan.idempotencyKey,
      intent: stored.publicPlan.intent,
      documentId: stored.publicPlan.binding.documentId,
      beforeProjectHash: stored.publicPlan.binding.projectHash,
      afterProjectHash: stored.publicPlan.impact.resultProjectHash,
      fromRevision: snapshot.revisions.currentRevision,
      toRevision: applied.revision.currentRevision,
      changedPaths: [...applied.receipt.changedPaths],
      appliedAt: now(),
      undoEligible: true,
    });
    options.authority.commit({
      project: applied.project,
      revisions: applied.revision,
      commandReceipt: applied.receipt,
      message: `Codex applied ${getOutcomeRecipe(stored.publicPlan.intent.recipeId).label}.`,
    });
    stored.consumed = true;
    applies.set(id, {
      receipt,
      previousProject: stored.previousProject,
      command: stored.command,
      undone: false,
    });
    return cloneApply(receipt);
  }

  function undo(applyReceiptId: string, requestedBy?: string): AutomationUndoReceipt {
    const stored = applies.get(applyReceiptId);
    if (!stored) throw new AutomationMutationError("unknown_receipt", "Automation apply receipt is unknown.");
    if (stored.undone) throw new AutomationMutationError("undo_ineligible", "Automation apply receipt was already undone.");
    const snapshot = options.authority.read();
    requireWriteScope(snapshot);
    if (requestedBy !== undefined) {
      const requesterIdentity = validMachineValue(requestedBy, "Automation requester identity");
      const plan = plans.get(stored.receipt.planId);
      if (!plan || plan.publicPlan.binding.requesterIdentity !== requesterIdentity) {
        throw new AutomationMutationError("requester_changed", "Automation receipt belongs to another client session.");
      }
    }
    if (snapshot.documentId !== stored.receipt.documentId
      || snapshot.revisions.currentRevision !== stored.receipt.toRevision
      || automationIdentity(snapshot.project) !== stored.receipt.afterProjectHash) {
      throw new AutomationMutationError("stale_undo", "Automation undo is no longer eligible after another edit.");
    }
    const undone = undoProjectV4Command(
      snapshot.project,
      snapshot.revisions,
      stored.previousProject,
      stored.command,
    );
    if (automationIdentity(undone.project) !== stored.receipt.beforeProjectHash) {
      throw new AutomationMutationError("stale_undo", "Automation undo did not restore the reviewed Project.");
    }
    const id = validMachineValue(issueId("undo"), "Automation undo receipt id");
    const receipt: AutomationUndoReceipt = Object.freeze({
      id,
      applyReceiptId,
      documentId: stored.receipt.documentId,
      beforeProjectHash: stored.receipt.afterProjectHash,
      afterProjectHash: stored.receipt.beforeProjectHash,
      fromRevision: snapshot.revisions.currentRevision,
      toRevision: undone.revision.currentRevision,
      changedPaths: [...undone.receipt.changedPaths],
      undoneAt: now(),
    });
    options.authority.commit({
      project: undone.project,
      revisions: undone.revision,
      commandReceipt: undone.receipt,
      message: `Codex change undone: ${getOutcomeRecipe(stored.receipt.intent.recipeId).label}.`,
    });
    stored.undone = true;
    return structuredClone(receipt);
  }

  return Object.freeze({
    plan,
    apply,
    undo,
    getApplyReceipt: (id: string) => {
      const stored = applies.get(id);
      if (!stored) return null;
      return cloneApply({ ...stored.receipt, undoEligible: !stored.undone });
    },
    listApplyReceipts: () => [...applies.values()].slice(-32).reverse().map((stored) => (
      cloneApply({ ...stored.receipt, undoEligible: !stored.undone })
    )),
    replaceManifests,
  });
}
