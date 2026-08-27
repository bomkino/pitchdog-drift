import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AutomationAccessView } from "../src/components/AutomationAccessView";
import {
  AutomationMutationError,
  DRIFT_AUTOMATION_WRITE_SCOPE,
  type AutomationMutationCommit,
  type AutomationMutationSnapshot,
} from "../src/core/automation/productAutomationMutation";
import { createProductAutomationService } from "../src/core/automation/productAutomationService";
import { createDriftSelfDescription } from "../src/core/automation/selfDescription";
import { applyProjectV4Command } from "../src/core/commands/projectCommand";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { createProjectRevisionState } from "../src/core/project/revisions";
import { applyOutcomeRecipeCommand } from "../src/core/recipes/outcomeRecipes";
import {
  AutomationProtocolError,
  createDevelopmentMcpAdapter,
} from "../src/lib/developmentMcpAdapter";

const START = "2026-08-27T12:00:00.000Z";
const PLAN_TIME = "2026-08-27T12:01:00.000Z";

function harness(scopes: readonly string[] = [DRIFT_AUTOMATION_WRITE_SCOPE]) {
  const project = createDefaultDriftProjectV4("automation-write-project", START, 47);
  project.media.assets.private = {
    id: "private",
    name: "/Users/manali/Secret/launch.png",
    kind: "image",
    mimeType: "image/png",
    hash: "a".repeat(64),
    byteLength: 512,
    width: 1600,
    height: 900,
  };
  project.media.order = ["private"];
  project.slides.private = {
    assetId: "private",
    fit: "contain",
    focalX: 0.5,
    focalY: 0.5,
    scaleOffset: 0,
  };
  let state: AutomationMutationSnapshot = {
    project,
    revisions: createProjectRevisionState(4),
    documentId: project.projectId,
    scopes,
  };
  const commits: AutomationMutationCommit[] = [];
  let sequence = 0;
  let clock = PLAN_TIME;
  const manifests = createDriftSelfDescription({
    project,
    documentRevision: state.revisions.currentRevision,
    selectedAssetId: null,
    presentation: {
      interfaceScale: 100,
      workspace: "motion",
      panel: "director",
      focusMode: false,
      playheadSeconds: 0,
    },
    platform: {
      target: "browser-development",
      buildChannel: "v2-dev",
      packaged: false,
    },
    exportCapabilities: null,
    mutationAccess: scopes.includes(DRIFT_AUTOMATION_WRITE_SCOPE),
    jobs: [],
  });
  const service = createProductAutomationService(manifests, {
    authority: {
      read: () => structuredClone(state),
      commit: (change) => {
        commits.push(structuredClone(change));
        state = {
          ...state,
          project: structuredClone(change.project),
          revisions: structuredClone(change.revisions),
        };
      },
    },
    now: () => clock,
    issueId: (kind) => `${kind}-${++sequence}`,
  });
  if (!service.mutation) throw new Error("Mutation service missing from test harness.");
  return {
    service: service.mutation,
    productService: service,
    initial: structuredClone(state),
    current: () => structuredClone(state),
    commits,
    manifests,
    replaceState: (next: AutomationMutationSnapshot) => { state = structuredClone(next); },
    setClock: (next: string) => { clock = next; },
  };
}

/*
 * Promise: an automation plan is a complete, redacted preview of the same canonical
 * command the UI uses, and apply commits exactly that reviewed result once.
 * Failure: mutation bypasses the reducer, leaks media paths, or diverges from the plan.
 * Public seam: ProductAutomationService.mutation plan/apply.
 * Cheapest loop: exact Project/revision equality against applyProjectV4Command.
 */
describe("Drift automation plan and apply", () => {
  it("binds and applies one outcome recipe through canonical command truth", () => {
    const host = harness();
    const plan = host.service.plan({
      intent: { kind: "apply-outcome-recipe", recipeId: "casino-reveal" },
      idempotencyKey: "request-casino-1",
    });
    const manual = applyProjectV4Command(
      host.initial.project,
      host.initial.revisions,
      applyOutcomeRecipeCommand("casino-reveal"),
      PLAN_TIME,
    );

    expect(plan.binding).toMatchObject({
      productId: "dog.pitch.drift",
      protocolVersion: 1,
      documentId: "automation-write-project",
      revision: 4,
    });
    expect(plan.requiredScopes).toEqual(["project-write"]);
    expect(plan.targetIds).toEqual(["outcome-recipe:casino-reveal"]);
    expect(plan.impact.changedPaths).toEqual(manual.receipt.changedPaths);
    expect(plan.impact.changes).toHaveLength(plan.impact.changedPaths.length);
    expect(JSON.stringify(plan)).not.toContain("/Users/");
    expect(JSON.stringify(plan)).not.toContain("Secret");

    const receipt = host.service.apply(plan.id);
    expect(host.current().project).toEqual(manual.project);
    expect(host.current().revisions).toEqual(manual.revision);
    expect(host.commits).toHaveLength(1);
    expect(receipt).toMatchObject({
      planId: plan.id,
      beforeProjectHash: plan.binding.projectHash,
      afterProjectHash: plan.impact.resultProjectHash,
      fromRevision: 4,
      toRevision: 5,
      undoEligible: true,
    });
    expect(receipt.changedPaths).toEqual(manual.receipt.changedPaths);
  });

  it("makes planning idempotent, apply one-use, and receipt undo exact", () => {
    const host = harness();
    const request = {
      intent: { kind: "apply-outcome-recipe", recipeId: "slow-cinema" } as const,
      idempotencyKey: "request-slow-1",
    };
    const first = host.service.plan(request);
    expect(host.service.plan(request)).toEqual(first);

    const applied = host.service.apply(first.id);
    expect(() => host.service.apply(first.id)).toThrowError(AutomationMutationError);
    try {
      host.service.apply(first.id);
    } catch (error) {
      expect((error as AutomationMutationError).code).toBe("replayed_plan");
    }

    const undo = host.service.undo(applied.id);
    expect(host.current().project).toEqual(host.initial.project);
    expect(host.current().revisions.currentRevision).toBe(6);
    expect(undo).toMatchObject({
      applyReceiptId: applied.id,
      beforeProjectHash: applied.afterProjectHash,
      afterProjectHash: applied.beforeProjectHash,
      fromRevision: 5,
      toRevision: 6,
    });
    expect(host.service.getApplyReceipt(applied.id)?.undoEligible).toBe(false);
    expect(() => host.service.undo(applied.id)).toThrowError(/already undone/u);
  });
});

describe("Drift development mutation adapter", () => {
  it("keeps metadata-only default and completes scoped plan, apply, and undo", () => {
    const deniedHost = harness();
    const metadataOnly = createDevelopmentMcpAdapter(deniedHost.productService, {
      enabled: true,
      issueSessionId: () => "metadata-session",
    });
    expect(() => metadataOnly.connect({
      productId: "dog.pitch.drift",
      protocolVersion: 1,
      clientId: "write-client",
      requestedScopes: ["project-write"],
    })).toThrowError(AutomationProtocolError);

    const host = harness();
    const adapter = createDevelopmentMcpAdapter(host.productService, {
      enabled: true,
      enabledScopes: [DRIFT_AUTOMATION_WRITE_SCOPE],
      issueSessionId: () => "write-session",
    });
    const session = adapter.connect({
      productId: "dog.pitch.drift",
      protocolVersion: 1,
      clientId: "write-client",
      requestedScopes: ["project-write"],
    });
    expect(session.scopes).toEqual(["metadata-only-read", "project-write"]);
    const tools = adapter.request(session.id, {
      id: 1,
      method: "tools/list",
      params: {},
    }).result as { name: string }[];
    expect(tools.map(({ name }) => name)).toEqual([
      "drift.get_manifest",
      "drift.plan_change",
      "drift.apply_change",
      "drift.undo_change",
    ]);

    const plan = adapter.request(session.id, {
      id: 2,
      method: "tools/call",
      params: {
        name: "drift.plan_change",
        arguments: {
          intent: { kind: "apply-outcome-recipe", recipeId: "casino-reveal" },
          idempotencyKey: "adapter-plan-1",
        },
      },
    }).result as { id: string };
    const applied = adapter.request(session.id, {
      id: 3,
      method: "tools/call",
      params: { name: "drift.apply_change", arguments: { planId: plan.id } },
    }).result as { id: string };
    const receiptMarkup = renderToStaticMarkup(createElement(AutomationAccessView, {
      enabled: true,
      writeEnabled: true,
      connectionState: "connected",
      service: host.productService,
      onEnabledChange: () => undefined,
    }));
    expect(receiptMarkup).toContain("Change receipts");
    expect(receiptMarkup).toContain("casino-reveal");
    expect(receiptMarkup).toContain("Undo");
    adapter.request(session.id, {
      id: 4,
      method: "tools/call",
      params: { name: "drift.undo_change", arguments: { receiptId: applied.id } },
    });

    expect(host.current().project).toEqual(host.initial.project);
    expect(host.commits).toHaveLength(2);
    adapter.setWriteScopeEnabled(false);
    expect(() => adapter.request(session.id, { id: 5, method: "tools/list", params: {} }))
      .toThrowError(/session/u);
  });

  it("makes a disconnected session's unapplied plan unusable after reconnect", () => {
    const host = harness();
    let sessionSequence = 0;
    const adapter = createDevelopmentMcpAdapter(host.productService, {
      enabled: true,
      enabledScopes: [DRIFT_AUTOMATION_WRITE_SCOPE],
      issueSessionId: () => `write-session-${++sessionSequence}`,
    });
    const first = adapter.connect({
      productId: "dog.pitch.drift",
      protocolVersion: 1,
      clientId: "write-client",
      requestedScopes: ["project-write"],
    });
    const plan = adapter.request(first.id, {
      id: 1,
      method: "tools/call",
      params: {
        name: "drift.plan_change",
        arguments: {
          intent: { kind: "apply-outcome-recipe", recipeId: "casino-reveal" },
          idempotencyKey: "disconnected-plan-1",
        },
      },
    }).result as { id: string };
    adapter.disconnect(first.id);
    const second = adapter.connect({
      productId: "dog.pitch.drift",
      protocolVersion: 1,
      clientId: "write-client",
      requestedScopes: ["project-write"],
    });

    expect(() => adapter.request(second.id, {
      id: 2,
      method: "tools/call",
      params: { name: "drift.apply_change", arguments: { planId: plan.id } },
    })).toThrowError(/another client session/u);
    expect(host.commits).toHaveLength(0);
  });
});

/*
 * Promise: human edits, revoked scope, and expiry win without partial mutation.
 * Failure: a stale reviewed plan silently overwrites current Project truth.
 * Public seam: ProductAutomationService.mutation validation before commit.
 * Cheapest loop: mutate one bound input and assert zero commit calls.
 */
describe("Drift automation mutation refusal", () => {
  it("rejects a plan after a concurrent human edit without mutation", () => {
    const host = harness();
    const plan = host.service.plan({
      intent: { kind: "apply-outcome-recipe", recipeId: "editorial-holds" },
      idempotencyKey: "request-editorial-1",
    });
    const human = applyProjectV4Command(
      host.initial.project,
      host.initial.revisions,
      applyOutcomeRecipeCommand("slow-cinema"),
      "2026-08-27T12:00:30.000Z",
    );
    host.replaceState({
      ...host.initial,
      project: human.project,
      revisions: human.revision,
    });
    const before = host.current();

    expect(() => host.service.apply(plan.id)).toThrowError(/re-plan/u);
    expect(host.current()).toEqual(before);
    expect(host.commits).toHaveLength(0);
  });

  it("rejects missing or revoked write scope and expired plans", () => {
    const denied = harness([]);
    expect(() => denied.service.plan({
      intent: { kind: "apply-outcome-recipe", recipeId: "casino-reveal" },
      idempotencyKey: "request-denied-1",
    })).toThrowError(/scope/u);
    expect(denied.commits).toHaveLength(0);

    const host = harness();
    const plan = host.service.plan({
      intent: { kind: "apply-outcome-recipe", recipeId: "casino-reveal" },
      idempotencyKey: "request-expired-1",
      expiresInMs: 1_000,
    });
    host.setClock("2026-08-27T12:01:01.001Z");
    expect(() => host.service.apply(plan.id)).toThrowError(/expired/u);
    expect(host.commits).toHaveLength(0);
  });

  it("binds idempotency keys to one intent and invalidates capability drift", () => {
    const host = harness();
    host.service.plan({
      intent: { kind: "apply-outcome-recipe", recipeId: "casino-reveal" },
      idempotencyKey: "request-collision-1",
    });
    expect(() => host.service.plan({
      intent: { kind: "apply-outcome-recipe", recipeId: "slow-cinema" },
      idempotencyKey: "request-collision-1",
    })).toThrowError(/different intent/u);

    const capabilityHost = harness();
    const plan = capabilityHost.service.plan({
      intent: { kind: "apply-outcome-recipe", recipeId: "casino-reveal" },
      idempotencyKey: "request-capability-1",
    });
    const changed = structuredClone(capabilityHost.manifests);
    changed.capabilities = { ...changed.capabilities, evidenceState: "runtime-reported" };
    capabilityHost.service.replaceManifests(changed);
    expect(() => capabilityHost.service.apply(plan.id)).toThrowError(/capabilities changed/u);
    expect(capabilityHost.commits).toHaveLength(0);
  });

  it("refuses undo after any later human edit", () => {
    const host = harness();
    const plan = host.service.plan({
      intent: { kind: "apply-outcome-recipe", recipeId: "casino-reveal" },
      idempotencyKey: "request-undo-stale-1",
    });
    const applied = host.service.apply(plan.id);
    const current = host.current();
    const human = applyProjectV4Command(
      current.project,
      current.revisions,
      applyOutcomeRecipeCommand("slow-cinema"),
      "2026-08-27T12:02:00.000Z",
    );
    host.replaceState({ ...current, project: human.project, revisions: human.revision });
    const before = host.current();

    expect(() => host.service.undo(applied.id)).toThrowError(/no longer eligible/u);
    expect(host.current()).toEqual(before);
    expect(host.commits).toHaveLength(1);
  });
});
