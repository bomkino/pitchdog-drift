import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AutomationAccessView } from "../src/components/AutomationAccessView";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import { createInitialDriftProjectV4 } from "../src/core/project/initialProject";
import {
  DRIFT_AUTOMATION_PRODUCT_ID,
  DRIFT_AUTOMATION_PROTOCOL_VERSION,
  createDriftSelfDescription,
} from "../src/core/automation/selfDescription";
import { createProductAutomationService } from "../src/core/automation/productAutomationService";
import {
  AutomationProtocolError,
  createDevelopmentMcpAdapter,
} from "../src/lib/developmentMcpAdapter";

const NOW = "2026-08-27T12:00:00.000Z";

function fixture() {
  const project = createDefaultDriftProjectV4("automation-project", NOW, 41);
  project.media.order = ["private-slide"];
  project.media.assets["private-slide"] = {
    id: "private-slide",
    name: "/Users/manali/Client Secret/launch.png",
    kind: "image",
    mimeType: "image/png",
    hash: "b".repeat(64),
    byteLength: 1234,
    width: 1600,
    height: 900,
  };
  project.slides["private-slide"] = {
    assetId: "private-slide",
    fit: "contain",
    focalX: 0.4,
    focalY: 0.6,
    scaleOffset: 0,
  };
  return createDriftSelfDescription({
    project,
    documentRevision: 7,
    selectedAssetId: "private-slide",
    presentation: {
      interfaceScale: 125,
      workspace: "motion",
      panel: "director",
      focusMode: false,
      playheadSeconds: 1.25,
    },
    platform: {
      target: "browser-development",
      buildChannel: "v2-dev",
      packaged: false,
    },
    exportCapabilities: null,
    jobs: [],
  });
}

/*
 * Promise: visible and protocol self-description share bounded metadata-only truth.
 * Failure: defaults drift, Project mutates, or private names/paths/media enter resources.
 * Public seam: self-description generator and ProductAutomationService resources.
 * Cheapest loop: deterministic manifest equality and redaction around canonical state.
 */
describe("Drift automation self-description", () => {
  it("generates deterministic, revision-bound, metadata-only resources", () => {
    const first = fixture();
    const second = fixture();
    const serialized = JSON.stringify(first);

    expect(first).toEqual(second);
    expect(first.document.revision).toBe(7);
    expect(first.document.projectHash).toMatch(/^fnv1a64:[a-f0-9]{16}$/);
    expect(first.document.media).toEqual([{
      id: "private-slide",
      kind: "image",
      mimeType: "image/png",
      contentHash: "b".repeat(64),
      byteLength: 1234,
      width: 1600,
      height: 900,
    }]);
    expect(serialized).not.toContain("Client Secret");
    expect(serialized).not.toContain("/Users/");
    expect(serialized).not.toContain("blob:");
    expect(first.presentation.interfaceScale).toBe(125);
    expect(first.presentation.portableProjectIntent).toBe(false);
  });

  it("derives defaults, commands, and complete outcome recipes from canonical sources", () => {
    const manifests = fixture();

    expect(manifests.protocol).toMatchObject({
      productId: DRIFT_AUTOMATION_PRODUCT_ID,
      protocolVersion: DRIFT_AUTOMATION_PROTOCOL_VERSION,
      metadataScope: "metadata-only",
    });
    expect(manifests.vocabulary.commands.some(({ id }) => id === "workspace.slides")).toBe(true);
    expect(manifests.defaults.factoryProject.schema).toBe("dog.pitch.drift/project");
    expect(manifests.defaults.factoryProject).toEqual(
      createInitialDriftProjectV4("automation-factory", "2000-01-01T00:00:00.000Z"),
    );
    expect(manifests.defaults.resets.every((reset) => (
      reset.changedPaths.length > 0 && reset.completeResult.schema === "dog.pitch.drift/project"
    ))).toBe(true);
    expect(manifests.defaults.outcomeRecipes.map(({ id }) => id)).toEqual([
      "smooth-carousel",
      "slow-cinema",
      "editorial-holds",
      "casino-reveal",
    ]);
    expect(manifests.defaults.outcomeRecipes.every((recipe) => (
      recipe.ownedPaths.length > 0 && recipe.completeDelta.motion !== undefined
    ))).toBe(true);
  });

  it("renders exact service payloads in Show what Codex can see", () => {
    const service = createProductAutomationService(fixture());
    const markup = renderToStaticMarkup(createElement(AutomationAccessView, {
      enabled: true,
      connectionState: "disconnected",
      service,
      onEnabledChange: () => undefined,
    }));

    expect(markup).toContain("Show what Codex can see");
    expect(markup).toContain(service.snapshotIdentity);
    expect(markup).toContain("Metadata only");
    expect(markup).not.toContain("Client Secret");
  });
});

/*
 * Promise: development MCP starts disabled and only reads bounded Drift resources.
 * Failure: wrong identity, hostile size, disconnect, or reads mutate Project state.
 * Public seam: DevelopmentMcpAdapter connect/request/disconnect.
 * Cheapest loop: fresh in-process client transcript against real service resources.
 */
describe("read-only development MCP adapter", () => {
  it("completes disabled, connected, resource, tool, and revoked states", () => {
    const manifests = fixture();
    const service = createProductAutomationService(manifests);
    const disabled = createDevelopmentMcpAdapter(service);
    expect(() => disabled.connect({
      productId: DRIFT_AUTOMATION_PRODUCT_ID,
      protocolVersion: DRIFT_AUTOMATION_PROTOCOL_VERSION,
      clientId: "fresh-client",
    })).toThrowError(AutomationProtocolError);

    const adapter = createDevelopmentMcpAdapter(service, {
      enabled: true,
      issueSessionId: () => "session-1",
    });
    const connectionStates: string[] = [];
    adapter.subscribe((state) => connectionStates.push(state));
    const session = adapter.connect({
      productId: DRIFT_AUTOMATION_PRODUCT_ID,
      protocolVersion: DRIFT_AUTOMATION_PROTOCOL_VERSION,
      clientId: "fresh-client",
    });
    const before = JSON.stringify(manifests.document);
    const listed = adapter.request(session.id, { id: 1, method: "resources/list", params: {} });
    const read = adapter.request(session.id, {
      id: 2,
      method: "resources/read",
      params: { uri: "drift://manifest/document" },
    });
    const tool = adapter.request(session.id, {
      id: 3,
      method: "tools/call",
      params: { name: "drift.get_manifest", arguments: { id: "presentation" } },
    });

    expect(listed.result).toEqual(service.listResources());
    expect(read.result).toEqual(service.readResource("drift://manifest/document"));
    expect(tool.result).toEqual(service.readResource("drift://manifest/presentation"));
    expect(JSON.stringify(manifests.document)).toBe(before);
    adapter.disconnect(session.id);
    expect(connectionStates).toEqual(["connected", "disconnected"]);
    expect(() => adapter.request(session.id, { id: 4, method: "resources/list", params: {} }))
      .toThrowError(/session/i);
  });

  it("fails closed for wrong identity, unknown methods, and oversized requests", () => {
    const service = createProductAutomationService(fixture());
    const adapter = createDevelopmentMcpAdapter(service, {
      enabled: true,
      issueSessionId: () => "session-hostile",
      maximumRequestBytes: 512,
    });
    expect(() => adapter.connect({
      productId: "wrong.product",
      protocolVersion: DRIFT_AUTOMATION_PROTOCOL_VERSION,
      clientId: "wrong-product",
    })).toThrowError(/product/i);
    expect(() => adapter.connect({
      productId: DRIFT_AUTOMATION_PRODUCT_ID,
      protocolVersion: 99,
      clientId: "wrong-protocol",
    })).toThrowError(/protocol/i);

    const session = adapter.connect({
      productId: DRIFT_AUTOMATION_PRODUCT_ID,
      protocolVersion: DRIFT_AUTOMATION_PROTOCOL_VERSION,
      clientId: "hostile-client",
    });
    expect(() => adapter.request(session.id, {
      id: 1,
      method: "project.patch",
      params: {},
    })).toThrowError(/read-only/i);
    expect(() => adapter.request(session.id, {
      id: 2,
      method: "resources/read",
      params: { uri: `drift://manifest/${"x".repeat(600)}` },
    })).toThrowError(/size/i);
  });
});
