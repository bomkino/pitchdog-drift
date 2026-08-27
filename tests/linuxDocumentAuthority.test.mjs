import { mkdtemp, readdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import authorityModule from "../linux/documentAuthority.cjs";
import ipcModule from "../linux/ipcContract.cjs";

const { LinuxDocumentAuthorityError, createLinuxDocumentAuthority } = authorityModule;
const {
  IPC_PROTOCOL,
  safeDesktopFailure,
  validateDesktopReply,
  validateDesktopRequest,
} = ipcModule;
const roots = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "drift-linux-authority-"));
  roots.push(root);
  const source = join(root, "fixture.pitched");
  const destination = join(root, "saved.pitched");
  const bytes = Buffer.from("canonical drift project fixture", "utf8");
  await writeFile(source, bytes, { mode: 0o600 });
  return { root, source, destination, bytes };
}

afterEach(async () => {
  const { rm } = await import("node:fs/promises");
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Linux document authority", () => {
  /**
   * Promise: a chosen project crosses the host boundary by opaque grant and verified bytes, never path.
   * Failure: a guessed grant works, a path leaks, or Save/relaunch changes canonical bytes.
   * Public seam: createLinuxDocumentAuthority.
   * Cheapest loop: real temporary filesystem round trip.
   */
  it("opens, atomically saves, and reopens exact bytes through opaque grants", async () => {
    const sample = await fixture();
    const authority = createLinuxDocumentAuthority();
    const selected = await authority.admitOpenPath(sample.source);

    expect(selected.grantId).toMatch(/^drift-grant-[a-f0-9-]{36}$/u);
    expect(JSON.stringify(selected)).not.toContain(sample.root);
    await expect(authority.finalizeOpen("drift-grant-00000000-0000-4000-8000-000000000000"))
      .rejects.toMatchObject({ code: "grant_expired" });
    const opened = await authority.finalizeOpen(selected.grantId);
    expect(opened).toMatchObject({ bound: true, readbackVerified: true, byteLength: sample.bytes.length });

    const saved = await authority.saveToPath(sample.destination, {
      operation: "save-as",
      transactionId: "linux-authority-round-trip",
      ticket: { sequence: 1, revision: 7 },
      bytes: selected.bytes,
      suggestedName: "saved.pitched",
    });
    expect(saved).toMatchObject({
      sequence: 1,
      revision: 7,
      bound: true,
      readbackVerified: true,
      sha256: opened.sha256,
    });
    expect(await readFile(sample.destination)).toEqual(sample.bytes);
    expect((await readdir(sample.root)).filter((name) => /drift-(?:stage|backup)/u.test(name))).toEqual([]);

    const relaunched = createLinuxDocumentAuthority();
    const reopenedSelection = await relaunched.admitOpenPath(sample.destination);
    const reopened = await relaunched.finalizeOpen(reopenedSelection.grantId);
    expect(reopened).toEqual(opened);
  });

  /**
   * Promise: grants are one-session, revocable, regular-file-only authority.
   * Failure: abandoned, stale, or symlink authority remains usable.
   * Public seam: createLinuxDocumentAuthority.
   * Cheapest loop: grant transitions and a real symlink.
   */
  it("rejects abandoned, stale, and symlink grants with zero binding", async () => {
    const sample = await fixture();
    const authority = createLinuxDocumentAuthority();
    const selected = await authority.admitOpenPath(sample.source);
    authority.abandonOpen(selected.grantId);
    await expect(authority.finalizeOpen(selected.grantId)).rejects.toMatchObject({ code: "grant_expired" });
    expect(authority.inspect()).toMatchObject({ activeGrantCount: 0, documentBound: false });

    const stale = await authority.admitOpenPath(sample.source);
    authority.revokeAll();
    await expect(authority.finalizeOpen(stale.grantId)).rejects.toMatchObject({ code: "grant_expired" });

    const linked = join(sample.root, "linked.pitched");
    await symlink(sample.source, linked);
    await expect(authority.admitOpenPath(linked)).rejects.toMatchObject({ code: "invalid_request" });
    expect(authority.inspect()).toMatchObject({ activeGrantCount: 0, documentBound: false });
  });

  it("preserves an existing destination when replacement validation fails", async () => {
    const sample = await fixture();
    const authority = createLinuxDocumentAuthority();
    const original = Buffer.from("existing valid destination", "utf8");
    await writeFile(sample.destination, original, { mode: 0o600 });
    await expect(authority.saveToPath(sample.destination, {
      operation: "save-as",
      transactionId: "invalid-replacement",
      ticket: { sequence: 1, revision: 0 },
      bytes: new Uint8Array(),
      suggestedName: "saved.pitched",
    })).rejects.toMatchObject({ code: "resource_limit" });
    expect(await readFile(sample.destination)).toEqual(original);
    expect((await readdir(sample.root)).filter((name) => /drift-(?:stage|backup)/u.test(name))).toEqual([]);
  });

  /**
   * Promise: IPC admits only the exact protocol, generation, method, shape, and bounded payload.
   * Failure: stale/unknown/oversized input reaches host mutation or raw diagnostics escape.
   * Public seam: validateDesktopRequest + safeDesktopFailure.
   * Cheapest loop: hostile literal envelopes.
   */
  it("fails closed on stale, unknown, oversized, and path-bearing hostile messages", () => {
    const generation = "1481fdab-7fcc-4ddd-a63e-a1b666ca35f7";
    const base = {
      protocol: IPC_PROTOCOL,
      requestId: "request-1",
      generation,
      method: "documents.choose",
      payload: {},
    };
    expect(validateDesktopRequest(base, generation)).toMatchObject({ method: "documents.choose", payload: {} });
    expect(() => validateDesktopRequest({ ...base, generation: "stale" }, generation)).toThrowError(/generation expired/iu);
    expect(() => validateDesktopRequest({ ...base, method: "filesystem.read" }, generation)).toThrowError(/unavailable/iu);
    expect(() => validateDesktopRequest({ ...base, payload: { path: "/home/ada/private.pitched" } }, generation)).toThrowError(/shape/iu);
    expect(() => validateDesktopRequest({ ...base, requestId: "x".repeat(97) }, generation)).toThrowError(/identity/iu);

    expect(validateDesktopReply({ requestId: "request-1", status: "cancelled" }, "request-1"))
      .toEqual({ requestId: "request-1", status: "cancelled" });
    expect(() => validateDesktopReply({ requestId: "replayed", status: "cancelled" }, "request-1"))
      .toThrowError(/did not match/iu);
    expect(() => validateDesktopReply({ requestId: "request-1", status: "failed", failure: null }, "request-1"))
      .toThrowError(/failure/iu);

    const failure = safeDesktopFailure(new Error("/home/ada/private.pitched token=secret"));
    expect(failure).toEqual({ code: "internal_error", message: "Linux document authority failed." });
    expect(JSON.stringify(failure)).not.toMatch(/ada|private|secret/iu);
  });
});
