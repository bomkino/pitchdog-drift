import {
  DRIFT_PROJECT_SCHEMA,
  DRIFT_PROJECT_VERSION,
  PROJECT_DOMAINS,
  type DriftProjectV3,
  type ProjectDomain,
} from "./schema";

const HEX_COLOUR = /^#[a-f0-9]{6}$/iu;
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_TEXT = /^[^\u0000-\u001f\u007f]+$/u;

type UnknownRecord = Record<string, unknown>;
type NumberRule = readonly [minimum: number, maximum: number, integer?: boolean];

export class ProjectValidationError extends Error {
  readonly path: string;

  constructor(path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "ProjectValidationError";
    this.path = path;
  }
}

function fail(path: string, message: string): never {
  throw new ProjectValidationError(path, message);
}

function dictionary(value: unknown, path: string): UnknownRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(path, "must be an object");
  return value as UnknownRecord;
}

function object(value: unknown, path: string, fields: readonly string[]): UnknownRecord {
  const output = dictionary(value, path);
  const unknown = Object.keys(output).find((key) => !fields.includes(key));
  if (unknown) fail(path, `contains unknown field ${unknown}`);
  for (const field of fields) if (!(field in output)) fail(`${path}.${field}`, "is required");
  return output;
}

function safeString(value: unknown, path: string, maximum = 256): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || !SAFE_TEXT.test(value)) {
    fail(path, `must be a non-empty safe string no longer than ${maximum} characters`);
  }
  return value;
}

function optionalSafeString(value: unknown, path: string, maximum = 256): string | null {
  return value === null ? null : safeString(value, path, maximum);
}

function finiteNumber(value: unknown, path: string, minimum: number, maximum: number, integer = false): number {
  if (
    typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum
    || (integer && !Number.isSafeInteger(value))
  ) {
    fail(path, `must be ${integer ? "a safe integer" : "a finite number"} between ${minimum} and ${maximum}`);
  }
  return value;
}

function numbers(value: UnknownRecord, path: string, rules: Readonly<Record<string, NumberRule>>): void {
  for (const [key, [minimum, maximum, integer = false]] of Object.entries(rules)) {
    finiteNumber(value[key], `${path}.${key}`, minimum, maximum, integer);
  }
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") fail(path, "must be a boolean");
  return value;
}

function oneOf<const T extends readonly unknown[]>(value: unknown, options: T, path: string): T[number] {
  if (!options.includes(value)) fail(path, `must be one of ${options.join(", ")}`);
  return value as T[number];
}

function colour(value: unknown, path: string): string {
  const result = safeString(value, path, 7);
  if (!HEX_COLOUR.test(result)) fail(path, "must be a six-digit hexadecimal colour");
  return result;
}

function isoDate(value: unknown, path: string): string {
  const result = safeString(value, path, 64);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(result)) {
    fail(path, "must be a canonical UTC ISO timestamp");
  }
  const parsed = new Date(result);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== result) fail(path, "is not a valid timestamp");
  return result;
}

function uniqueStrings(value: unknown, path: string, maximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum) fail(path, `must contain at most ${maximum} items`);
  const output = value.map((item, index) => safeString(item, `${path}[${index}]`, 512));
  if (new Set(output).size !== output.length) fail(path, "must not contain duplicates");
  return output;
}

function recipe(value: unknown, path: string): void {
  const item = object(value, path, ["id", "version", "fingerprint"]);
  safeString(item.id, `${path}.id`);
  finiteNumber(item.version, `${path}.version`, 1, 1_000_000, true);
  safeString(item.fingerprint, `${path}.fingerprint`, 512);
}

function asset(value: unknown, path: string, expectedId: string): void {
  const item = dictionary(value, path);
  const allowed = ["id", "name", "kind", "mimeType", "hash", "byteLength", "width", "height", "duration"];
  const unknown = Object.keys(item).find((key) => !allowed.includes(key));
  if (unknown) fail(path, `contains unknown field ${unknown}`);
  for (const field of allowed.slice(0, 8)) if (!(field in item)) fail(`${path}.${field}`, "is required");
  if (safeString(item.id, `${path}.id`, 512) !== expectedId) fail(`${path}.id`, "must match its manifest key");
  safeString(item.name, `${path}.name`, 512);
  const kind = oneOf(item.kind, ["image", "video"] as const, `${path}.kind`);
  const mime = safeString(item.mimeType, `${path}.mimeType`);
  if (!mime.startsWith(`${kind}/`)) fail(`${path}.mimeType`, `must describe ${kind} media`);
  const digest = safeString(item.hash, `${path}.hash`, 64);
  if (!SHA256.test(digest)) fail(`${path}.hash`, "must be a lower-case SHA-256 digest");
  numbers(item, path, {
    byteLength: [0, Number.MAX_SAFE_INTEGER, true],
    width: [1, 131_072, true],
    height: [1, 131_072, true],
  });
  if (item.duration !== undefined) finiteNumber(item.duration, `${path}.duration`, 0.001, 86_400);
}

function motion(value: unknown): void {
  const root = object(value, "project.motion", ["transport", "cadence", "performance", "character", "path", "seamless"]);
  const transport = object(root.transport, "project.motion.transport", ["axis", "direction", "slidesPerSecond"]);
  oneOf(transport.axis, ["horizontal", "vertical"] as const, "project.motion.transport.axis");
  oneOf(transport.direction, [1, -1] as const, "project.motion.transport.direction");
  finiteNumber(transport.slidesPerSecond, "project.motion.transport.slidesPerSecond", 0, 1.5);

  const cadence = object(root.cadence, "project.motion.cadence", [
    "cutId", "read", "anticipation", "carry", "impact", "settle", "land", "poseCadence",
  ]);
  safeString(cadence.cutId, "project.motion.cadence.cutId");
  const cadenceKeys = ["read", "anticipation", "carry", "impact", "settle", "land"] as const;
  let total = 0;
  for (const key of cadenceKeys) total += finiteNumber(cadence[key], `project.motion.cadence.${key}`, 0, 1);
  if (total <= 0.001) fail("project.motion.cadence", "must contain at least one visible phase");
  oneOf(cadence.poseCadence, ["continuous", "24fps", "18fps", "12fps"] as const, "project.motion.cadence.poseCadence");

  const performance = object(root.performance, "project.motion.performance", [
    "id", "weight", "linger", "release", "runway", "overlap", "imperfection", "take",
  ]);
  safeString(performance.id, "project.motion.performance.id");
  numbers(performance, "project.motion.performance", {
    weight: [0, 1], linger: [0, 1], release: [0, 1], runway: [0, 1],
    overlap: [0, 1], imperfection: [0, 1], take: [1, 1_000_000, true],
  });

  const character = object(root.character, "project.motion.character", ["id", "amount"]);
  oneOf(character.id, ["direct", "weighted", "spring", "drift"] as const, "project.motion.character.id");
  finiteNumber(character.amount, "project.motion.character.amount", 0, 1);

  const path = object(root.path, "project.motion.path", ["id", "gap", "curvature", "depth", "banking", "focusScale", "edgeFade"]);
  safeString(path.id, "project.motion.path.id");
  numbers(path, "project.motion.path", {
    gap: [0, 1.5], curvature: [0, 1], depth: [0, 1], banking: [-45, 45],
    focusScale: [0, 0.5], edgeFade: [0, 1],
  });

  const seamless = object(root.seamless, "project.motion.seamless", ["enabled", "loops"]);
  boolean(seamless.enabled, "project.motion.seamless.enabled");
  finiteNumber(seamless.loops, "project.motion.seamless.loops", 1, 6, true);
}

function unitFields(value: UnknownRecord, path: string, fields: readonly string[]): void {
  for (const key of fields) finiteNumber(value[key], `${path}.${key}`, 0, 1);
}

export function validateDriftProjectV3(value: unknown): DriftProjectV3 {
  const project = object(value, "project", [
    "schema", "formatVersion", "projectId", "projectSeed", "createdAt", "updatedAt",
    "composition", "media", "slides", "motion", "card", "material", "lighting",
    "atmosphere", "lens", "sound", "presenter", "master", "provenance",
  ]);
  if (project.schema !== DRIFT_PROJECT_SCHEMA) fail("project.schema", `must be ${DRIFT_PROJECT_SCHEMA}`);
  if (project.formatVersion !== DRIFT_PROJECT_VERSION) fail("project.formatVersion", `must be ${DRIFT_PROJECT_VERSION}`);
  safeString(project.projectId, "project.projectId", 512);
  finiteNumber(project.projectSeed, "project.projectSeed", 0, 4_294_967_295, true);
  const created = isoDate(project.createdAt, "project.createdAt");
  const updated = isoDate(project.updatedAt, "project.updatedAt");
  if (updated < created) fail("project.updatedAt", "must not precede project.createdAt");

  const composition = object(project.composition, "project.composition", ["width", "height", "alphaMode", "colourSpace"]);
  numbers(composition, "project.composition", { width: [1, 16_384, true], height: [1, 16_384, true] });
  oneOf(composition.alphaMode, ["opaque", "transparent"] as const, "project.composition.alphaMode");
  oneOf(composition.colourSpace, ["srgb-rec709"] as const, "project.composition.colourSpace");

  const media = object(project.media, "project.media", ["order", "presenterAssetId", "assets"]);
  const order = uniqueStrings(media.order, "project.media.order", 200);
  const presenterId = optionalSafeString(media.presenterAssetId, "project.media.presenterAssetId", 512);
  const assets = dictionary(media.assets, "project.media.assets");
  const assetIds = Object.keys(assets);
  if (assetIds.length > 201) fail("project.media.assets", "contains more than 201 assets");
  for (const id of assetIds) asset(assets[id], `project.media.assets.${id}`, id);
  for (const id of order) {
    const descriptor = assets[id] as UnknownRecord | undefined;
    if (!descriptor) fail("project.media.order", `references missing asset ${id}`);
    if (descriptor.kind !== "image") fail("project.media.order", `references non-image asset ${id}`);
  }
  if (presenterId !== null) {
    const descriptor = assets[presenterId] as UnknownRecord | undefined;
    if (!descriptor) fail("project.media.presenterAssetId", "references missing media");
    if (descriptor.kind !== "video") fail("project.media.presenterAssetId", "must reference video media");
  }
  const referenced = new Set([...order, ...(presenterId ? [presenterId] : [])]);
  if (assetIds.some((id) => !referenced.has(id)) || referenced.size !== assetIds.length) {
    fail("project.media.assets", "contains unreferenced media");
  }

  const slides = dictionary(project.slides, "project.slides");
  if (Object.keys(slides).length !== order.length) fail("project.slides", "must contain one directive per ordered slide");
  for (const id of order) {
    const directive = object(slides[id], `project.slides.${id}`, ["assetId", "fit", "focalX", "focalY", "scaleOffset"]);
    if (directive.assetId !== id) fail(`project.slides.${id}.assetId`, "must match the slide key");
    oneOf(directive.fit, ["cover", "contain"] as const, `project.slides.${id}.fit`);
    numbers(directive, `project.slides.${id}`, { focalX: [0, 1], focalY: [0, 1], scaleOffset: [-0.75, 0.75] });
  }
  for (const id of Object.keys(slides)) if (!order.includes(id)) fail(`project.slides.${id}`, "does not belong to the ordered deck");

  motion(project.motion);

  const card = object(project.card, "project.card", [
    "aspectWidth", "aspectHeight", "scale", "defaultFit", "radius", "smoothing", "borderWidth", "borderColor", "borderOpacity",
  ]);
  numbers(card, "project.card", {
    aspectWidth: [0.01, 100], aspectHeight: [0.01, 100], scale: [0.2, 1.25],
    radius: [0, 512], smoothing: [0, 1], borderWidth: [0, 32], borderOpacity: [0, 1],
  });
  oneOf(card.defaultFit, ["cover", "contain"] as const, "project.card.defaultFit");
  colour(card.borderColor, "project.card.borderColor");

  const material = object(project.material, "project.material", ["surface", "flex", "thickness", "roughness", "sheen", "finish"]);
  oneOf(material.surface, ["card", "paper", "silk", "gel"] as const, "project.material.surface");
  numbers(material, "project.material", { flex: [0, 1], thickness: [0, 128], roughness: [0, 1], sheen: [0, 1] });
  const finish = object(material.finish, "project.material.finish", ["id", "registration", "localSoftness", "localSmear", "microtexture"]);
  safeString(finish.id, "project.material.finish.id");
  unitFields(finish, "project.material.finish", ["registration", "localSoftness", "localSmear", "microtexture"]);

  const lighting = object(project.lighting, "project.lighting", [
    "enabled", "presetId", "space", "motionMode", "motionSpeed", "keyColor", "fillColor", "shadowColor", "azimuth",
    "elevation", "keyIntensity", "fillIntensity", "rimIntensity", "artworkProtection", "heroProtection", "shadowOpacity",
    "shadowSoftness", "shadowDistance", "contactStrength", "backgroundSpill", "spillFocus", "gobo", "goboStrength", "breath",
  ]);
  boolean(lighting.enabled, "project.lighting.enabled");
  safeString(lighting.presetId, "project.lighting.presetId");
  oneOf(lighting.space, ["stage", "card"] as const, "project.lighting.space");
  oneOf(lighting.motionMode, ["static", "breathe", "sweep", "flicker", "orbit"] as const, "project.lighting.motionMode");
  colour(lighting.keyColor, "project.lighting.keyColor");
  colour(lighting.fillColor, "project.lighting.fillColor");
  colour(lighting.shadowColor, "project.lighting.shadowColor");
  numbers(lighting, "project.lighting", {
    motionSpeed: [0, 8], azimuth: [-180, 180], elevation: [0, 90], keyIntensity: [0, 2], fillIntensity: [0, 2],
    rimIntensity: [0, 2], artworkProtection: [0, 1], heroProtection: [0, 1], shadowOpacity: [0, 1],
    shadowSoftness: [0, 256], shadowDistance: [0, 512], contactStrength: [0, 1], backgroundSpill: [0, 1],
    spillFocus: [0.1, 2], goboStrength: [0, 1], breath: [0, 1],
  });
  safeString(lighting.gobo, "project.lighting.gobo");

  const atmosphere = object(project.atmosphere, "project.atmosphere", [
    "enabled", "family", "composition", "paletteId", "treatment", "recut", "seedOffset", "presence",
    "intensity", "motion", "grain", "vignette", "colourA", "colourB", "accent",
  ]);
  boolean(atmosphere.enabled, "project.atmosphere.enabled");
  safeString(atmosphere.family, "project.atmosphere.family");
  safeString(atmosphere.composition, "project.atmosphere.composition");
  optionalSafeString(atmosphere.paletteId, "project.atmosphere.paletteId");
  oneOf(atmosphere.treatment, ["quiet", "cinema", "graphic", "weathered"] as const, "project.atmosphere.treatment");
  oneOf(atmosphere.presence, ["whisper", "balanced", "statement"] as const, "project.atmosphere.presence");
  numbers(atmosphere, "project.atmosphere", {
    recut: [0, 1_000_000, true], seedOffset: [0, 4_294_967_295, true], intensity: [0, 1], motion: [0, 1], grain: [0, 1], vignette: [0, 1],
  });
  colour(atmosphere.colourA, "project.atmosphere.colourA");
  colour(atmosphere.colourB, "project.atmosphere.colourB");
  colour(atmosphere.accent, "project.atmosphere.accent");

  const lens = object(project.lens, "project.lens", [
    "enabled", "characterId", "presence", "focus", "directionalSmear", "chromaticSeparation", "bloom", "halation",
    "flare", "curvature", "gateWeave", "cameraGrain", "vignette", "presenterTreatment",
  ]);
  boolean(lens.enabled, "project.lens.enabled");
  safeString(lens.characterId, "project.lens.characterId");
  unitFields(lens, "project.lens", [
    "presence", "focus", "directionalSmear", "chromaticSeparation", "bloom", "halation", "flare", "gateWeave", "cameraGrain", "vignette",
  ]);
  finiteNumber(lens.curvature, "project.lens.curvature", -1, 1);
  oneOf(lens.presenterTreatment, ["protected", "through-lens"] as const, "project.lens.presenterTreatment");

  const sound = object(project.sound, "project.sound", [
    "source", "material", "grammar", "density", "texture", "take", "masterLevel", "motionLevel",
    "interfaceLevel", "underVoice", "previewEnabled", "exportEnabled",
  ]);
  oneOf(sound.source, ["recorded", "procedural"] as const, "project.sound.source");
  safeString(sound.material, "project.sound.material");
  oneOf(sound.grammar, ["dry", "editorial", "organic"] as const, "project.sound.grammar");
  unitFields(sound, "project.sound", ["density", "texture", "masterLevel", "motionLevel", "interfaceLevel", "underVoice"]);
  finiteNumber(sound.take, "project.sound.take", 1, 1_000_000, true);
  boolean(sound.previewEnabled, "project.sound.previewEnabled");
  boolean(sound.exportEnabled, "project.sound.exportEnabled");

  const presenter = object(project.presenter, "project.presenter", [
    "enabled", "x", "y", "width", "aspectWidth", "aspectHeight", "fit", "radius", "smoothing",
    "borderWidth", "borderColor", "borderOpacity", "muted", "gain", "trimStart", "startAt",
  ]);
  boolean(presenter.enabled, "project.presenter.enabled");
  oneOf(presenter.fit, ["cover", "contain"] as const, "project.presenter.fit");
  boolean(presenter.muted, "project.presenter.muted");
  colour(presenter.borderColor, "project.presenter.borderColor");
  numbers(presenter, "project.presenter", {
    x: [0, 1], y: [0, 1], width: [0.05, 1], aspectWidth: [0.01, 100], aspectHeight: [0.01, 100],
    radius: [0, 512], smoothing: [0, 1], borderWidth: [0, 32], borderOpacity: [0, 1],
    gain: [0, 4], trimStart: [0, 86_400], startAt: [0, 86_400],
  });
  if (presenter.enabled && presenterId === null) fail("project.presenter.enabled", "requires presenter media");

  const master = object(project.master, "project.master", ["fps", "duration", "reducedMotion", "video", "audio"]);
  oneOf(master.fps, [24, 25, 30, 50, 60] as const, "project.master.fps");
  finiteNumber(master.duration, "project.master.duration", 3, 30);
  boolean(master.reducedMotion, "project.master.reducedMotion");
  const video = object(master.video, "project.master.video", ["format", "bitrate"]);
  oneOf(video.format, ["h264"] as const, "project.master.video.format");
  finiteNumber(video.bitrate, "project.master.video.bitrate", 100_000, 200_000_000, true);
  const audio = object(master.audio, "project.master.audio", ["enabled", "bitrate"]);
  boolean(audio.enabled, "project.master.audio.enabled");
  finiteNumber(audio.bitrate, "project.master.audio.bitrate", 32_000, 512_000, true);
  if (audio.enabled && !sound.exportEnabled && (presenterId === null || presenter.muted === true)) {
    fail("project.master.audio.enabled", "requires presenter audio or exported sound");
  }

  const provenance = object(project.provenance, "project.provenance", ["world", "worldVariant", "recipes", "lockedDomains"]);
  if (provenance.world !== null) recipe(provenance.world, "project.provenance.world");
  oneOf(provenance.worldVariant, ["restrained", "directed", "fever", "custom"] as const, "project.provenance.worldVariant");
  const recipes = object(provenance.recipes, "project.provenance.recipes", PROJECT_DOMAINS);
  for (const domain of PROJECT_DOMAINS) if (recipes[domain] !== null) recipe(recipes[domain], `project.provenance.recipes.${domain}`);
  const locked = uniqueStrings(provenance.lockedDomains, "project.provenance.lockedDomains", PROJECT_DOMAINS.length);
  for (const [index, domain] of locked.entries()) oneOf(domain, PROJECT_DOMAINS, `project.provenance.lockedDomains[${index}]`);

  return structuredClone(value) as DriftProjectV3;
}
