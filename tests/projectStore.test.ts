import { describe, expect, it } from "vitest";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  PROJECT_BUNDLE_MIME,
  PROJECT_MANIFEST_SCHEMA,
  ProjectIntegrityError,
  ProjectStore,
  createProjectBundle,
  exportProjectBundle,
  importProjectBundle,
  sanitizeAssetFilename,
  type ProjectManifest,
} from "../src/lib/projectStore";

const textBlob = (value: string, type = "image/png") => new Blob([value], { type });

async function archiveEntries(archive: Blob): Promise<Record<string, Uint8Array>> {
  return unzipSync(new Uint8Array(await archive.arrayBuffer()));
}

function manifestFrom(entries: Record<string, Uint8Array>): ProjectManifest<unknown> {
  const bytes = entries["manifest.json"];
  if (bytes === undefined) throw new Error("Test archive has no manifest.");
  return JSON.parse(strFromU8(bytes)) as ProjectManifest<unknown>;
}

function replaceManifest(
  entries: Record<string, Uint8Array>,
  change: (manifest: ProjectManifest<unknown>) => void,
): Blob {
  const manifest = manifestFrom(entries);
  change(manifest);
  return new Blob([
    zipSync({ ...entries, "manifest.json": strToU8(JSON.stringify(manifest)) }, { level: 0 }).buffer,
  ]);
}

async function expectIntegrityCode(promise: Promise<unknown>, code: string): Promise<void> {
  try {
    await promise;
    throw new Error(`Expected ProjectIntegrityError(${code}).`);
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectIntegrityError);
    expect((error as ProjectIntegrityError).code).toBe(code);
  }
}

describe("projectStore portable bundles", () => {
  it("creates a versioned, ordered manifest and round-trips payload plus original Blobs", async () => {
    const payload = {
      stage: { ratio: "9:16", transparent: true },
      slideOrder: ["cover", "frame-2"],
    };
    const snapshot = await createProjectBundle({
      payload,
      projectId: "project-one",
      createdAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
      engineVersion: "0.1.0",
      themeVersion: "1",
      assets: [
        { id: "cover", name: "../../Sïena cover.PNG", blob: textBlob("first") },
        { id: "frame-2", name: "deck: frame 2.JPEG", blob: textBlob("second", "image/jpeg") },
      ],
    });

    expect(snapshot.manifest.schema).toBe(PROJECT_MANIFEST_SCHEMA);
    expect(snapshot.manifest.version).toBe(1);
    expect(snapshot.manifest.assets.map(({ id, order }) => ({ id, order }))).toEqual([
      { id: "cover", order: 0 },
      { id: "frame-2", order: 1 },
    ]);
    expect(snapshot.manifest.assets[0]?.path).toBe("assets/0000-cover-Siena-cover.png");
    expect(snapshot.manifest.assets[0]?.sha256).toMatch(/^[a-f0-9]{64}$/u);

    const archive = await exportProjectBundle(snapshot);
    expect(archive.type).toBe(PROJECT_BUNDLE_MIME);
    const imported = await importProjectBundle<typeof payload>(archive);

    expect(imported.payload).toEqual(payload);
    expect(imported.assets.map((asset) => asset.id)).toEqual(["cover", "frame-2"]);
    expect(await Promise.all(imported.assets.map((asset) => asset.blob.text()))).toEqual([
      "first",
      "second",
    ]);
    expect(imported.assets.map((asset) => asset.blob.type)).toEqual(["image/png", "image/jpeg"]);
  });

  it("uses traversal-safe, stable filenames", () => {
    expect(sanitizeAssetFilename("../A Film / deck:one..FINAL.PnG")).toBe("deck-one.FINAL.png");
    expect(sanitizeAssetFilename("...///")).toBe("asset");
    expect(sanitizeAssetFilename("same name.png")).toBe(sanitizeAssetFilename("same name.png"));
  });

  it("rejects duplicate asset IDs before saving or exporting", async () => {
    await expectIntegrityCode(
      createProjectBundle({
        payload: {},
        engineVersion: "1",
        themeVersion: "1",
        assets: [
          { id: "same", name: "one.png", blob: textBlob("one") },
          { id: "same", name: "two.png", blob: textBlob("two") },
        ],
      }),
      "duplicate-asset-id",
    );
  });

  it("rejects a corrupt asset hash without returning a partial project", async () => {
    const snapshot = await createProjectBundle({
      payload: { speed: 1 },
      engineVersion: "1",
      themeVersion: "1",
      assets: [{ id: "one", name: "one.png", blob: textBlob("authentic") }],
    });
    const entries = await archiveEntries(await exportProjectBundle(snapshot));
    const path = snapshot.manifest.assets[0]?.path;
    if (path === undefined) throw new Error("Test snapshot has no asset.");
    entries[path] = strToU8("corrupted");
    const corrupt = new Blob([zipSync(entries, { level: 0 }).buffer]);

    await expectIntegrityCode(importProjectBundle(corrupt), "hash-mismatch");
  });

  it("rejects missing files, size changes, invalid order, and duplicate manifest IDs", async () => {
    const snapshot = await createProjectBundle({
      payload: { flow: "horizontal" },
      engineVersion: "1",
      themeVersion: "1",
      assets: [
        { id: "one", name: "one.png", blob: textBlob("one") },
        { id: "two", name: "two.png", blob: textBlob("two") },
      ],
    });
    const original = await archiveEntries(await exportProjectBundle(snapshot));
    const firstPath = snapshot.manifest.assets[0]?.path;
    if (firstPath === undefined) throw new Error("Test snapshot has no first asset.");

    const missingEntries = { ...original };
    delete missingEntries[firstPath];
    await expectIntegrityCode(
      importProjectBundle(new Blob([zipSync(missingEntries, { level: 0 }).buffer])),
      "missing-asset",
    );

    await expectIntegrityCode(
      importProjectBundle(
        replaceManifest(original, (manifest) => {
          const first = manifest.assets[0];
          if (first !== undefined) first.size += 1;
        }),
      ),
      "size-mismatch",
    );

    await expectIntegrityCode(
      importProjectBundle(
        replaceManifest(original, (manifest) => {
          const first = manifest.assets[0];
          if (first !== undefined) first.order = 1;
        }),
      ),
      "invalid-manifest",
    );

    await expectIntegrityCode(
      importProjectBundle(
        replaceManifest(original, (manifest) => {
          const second = manifest.assets[1];
          const first = manifest.assets[0];
          if (second !== undefined && first !== undefined) {
            second.id = first.id;
            second.path = "assets/0001-one-two.png";
          }
        }),
      ),
      "duplicate-asset-id",
    );
  });

  it("rejects wrong schemas and unsupported manifest versions", async () => {
    const snapshot = await createProjectBundle({
      payload: {},
      engineVersion: "1",
      themeVersion: "1",
      assets: [],
    });
    const original = await archiveEntries(await exportProjectBundle(snapshot));

    await expectIntegrityCode(
      importProjectBundle(
        replaceManifest(original, (manifest) => {
          Object.assign(manifest, { schema: "someone-else/project" });
        }),
      ),
      "invalid-manifest",
    );
    await expectIntegrityCode(
      importProjectBundle(
        replaceManifest(original, (manifest) => {
          Object.assign(manifest, { version: 999 });
        }),
      ),
      "unsupported-version",
    );
  });

  it("verifies imports without opening or mutating IndexedDB", async () => {
    let openCalls = 0;
    const poisonFactory = {
      open: () => {
        openCalls += 1;
        throw new Error("Import touched IndexedDB.");
      },
    } as unknown as IDBFactory;
    const store = new ProjectStore({ indexedDB: poisonFactory });
    const snapshot = await createProjectBundle({
      payload: { local: true },
      engineVersion: "1",
      themeVersion: "1",
      assets: [],
    });

    const imported = await store.import<{ local: boolean }>(await exportProjectBundle(snapshot));
    expect(imported.payload).toEqual({ local: true });
    expect(openCalls).toBe(0);
  });

  it("fails visibly when native IndexedDB is unavailable", async () => {
    const store = new ProjectStore({ indexedDB: null });
    await expectIntegrityCode(store.load(), "indexeddb-unavailable");
  });
});
