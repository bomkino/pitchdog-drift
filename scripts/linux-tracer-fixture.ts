import { writeFile } from "node:fs/promises";
import { createDefaultDriftProjectV4 } from "../src/core/project/defaults";
import {
  createProjectBundle,
  exportProjectBundle,
} from "../src/lib/projectStore";
import { createDriftProjectPayload } from "../src/lib/studioProjectPayload";

const output = process.argv[2];
if (!output) throw new Error("Provide an output path for the Linux tracer fixture.");
const now = "2026-08-27T00:00:00.000Z";
const project = createDefaultDriftProjectV4("linux-tracer-canonical", now);
const snapshot = await createProjectBundle({
  payload: createDriftProjectPayload(project),
  assets: [],
  engineVersion: "linux-tracer-fixture/1",
  themeVersion: "linux-tracer-fixture/1",
  projectId: project.projectId,
  createdAt: project.createdAt,
  updatedAt: project.updatedAt,
});
const archive = await exportProjectBundle(snapshot);
await writeFile(output, new Uint8Array(await archive.arrayBuffer()), { mode: 0o600 });
