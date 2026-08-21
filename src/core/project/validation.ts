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

function record(value: unknown, path: string, allowed: readonly string[]): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "must be an object");
  }
  const output = value as Record<string, unknown>;
  const unknown = Object.keys(output).filter((key) => !allowed.includes(key));
  if (unknown.length) fail(path, `contains unknown field ${unknown[0]}`);
  return output;
}

function requireFields(value: Record<string, unknown>, path: string, fields: readonly string[]): void {
  for (const field of fields) {
    if (!(field in value)) fail(`${path}.${field}`, "is required");
  }
}

function safeString(value: unknown, path: string, maximum = 256): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || !SAFE_TEXT.test(value)) {
    fail(path, `must be a non-empty safe string no longer than ${maximum} characters`);
  }
  return value;
}

function nullableSafeString(value: unknown, path: string, maximum = 256): string | null {
  return value === null ? null : safeString(value, path, maximum);
}

function finiteNumber(value: unknown, path: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    fail(path, `must be a finite number between ${minimum} and ${maximum}`);
  }
  return value;
}

function wholeNumber(value: unknown, path: string, minimum: number, maximum: number): number {
  const number = finiteNumber(value, path, minimum, maximum);
  if (!Number.isSafeInteger(number)) fail(path, "must be a safe integer");
  return number;
}

function flag(value: unknown, path: string): boolean {
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
  const date = new Date(result);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== result) fail(path, "is not a valid timestamp");
  return result;
}

function stringArray(value: unknown, path: string, maximum: number): string[] {
  if (!Array.isArray(value) || value.length > maximum) fail(path, `must be an array with at most ${maximum} items`);
  const output = value.map((entry, index) => safeString(entry, `${path}[${index}]`, 512));
  if (new Set(output).size !== output.length) fail(path, "must not contain duplicates");
  return output;
}

function validateRecipeReference(value: unknown, path: string): void {
  const item = record(value, path, ["id", "version", "fingerprint"]);
  requireFields(item, path, ["id", "version", "fingerprint"]);
  safeString(item.id, `${path}.id`);
  wholeNumber(item.version, `${path}.version`, 1, 1_000_000);
  safeString(item.fingerprint, `${path}.fingerprint`, 512);
}

function validateAsset(value: unknown, path: string, expectedId: string): void {
  const item = record(value, path, [
    "id", "name", "kind", "mimeType", "hash", "byteLength", "width", "height", "duration",
  ]);
  requireFields(item, path, ["id", "name", "kind", "mimeType", "hash", "byteLength", "width", "height"]);
  const id = safeString(item.id, `${path}.id`, 512);
  if (id !== expectedId) fail(`${path}.id`, "must match its manifest key");
  safeString(item.name, `${path}.name`, 512);
  const kind = oneOf(item.kind, ["image", "video"] as const, `${path}.kind`);
  const mimeType = safeString(item.mimeType, `${path}.mimeType`);
  if (!mimeType.startsWith(`${kind}/`)) fail(`${path}.mimeType`, `must describe ${kind} media`);
  const hash = safeString(item.hash, `${path}.hash`, 64);
  if (!SHA256.test(hash)) fail(`${path}.hash`, "must be a lower-case SHA-256 digest");
  wholeNumber(item.byteLength, `${path}.byteLength`, 0, Number.MAX_SAFE_INTEGER);
  wholeNumber(item.width, `${path}.width`, 1, 131_072);
  wholeNumber(item.height, `${path}.height`, 1, 131_072);
  if (item.duration !== undefined) finiteNumber(item.duration, `${path}.duration`, 0.001, 86_400);
}

function validateMotion(value: unknown): void {
  const motion = record(value, "project.motion", ["transport", "cadence", "performance", "character", "path", "seamless"]);
  requireFields(motion, "project.motion", ["transport", "cadence", "performance", "character", "path", "seamless"]);

  const transport = record(motion.transport, "project.motion.transport", ["axis", "direction", "slidesPerSecond"]);
  requireFields(transport, "project.motion.transport", ["axis", "direction", "slidesPerSecond"]);
  oneOf(transport.axis, ["horizontal", "vertical"] as const, "project.motion.transport.axis");
  oneOf(transport.direction, [1, -1] as const, "project.motion.transport.direction");
  finiteNumber(transport.slidesPerSecond, "project.motion.transport.slidesPerSecond", 0, 1.5);

  const cadence = record(motion.cadence, "project.motion.cadence", [
    "cutId", "read", "anticipation", "carry", "impact", "settle", "land", "poseCadence",
  ]);
  requireFields(cadence, "project.motion.cadence", [
    "cutId", "read", "anticipation", "carry", "impact", "settle", "land", "poseCadence",
  ]);
  safeString(cadence.cutId, "project.motion.cadence.cutId");
  const cadenceParts = ["read", "anticipation", "carry", "impact", "settle", "land"] as const;
  let cadenceTotal = 0;
  for (const key of cadenceParts) cadenceTotal += finiteNumber(cadence[key], `project.motion.cadence.${key}`, 0, 1);
  if (cadenceTotal <= 0.001) fail("project.motion.cadence", "must contain at least one visible phase");
  oneOf(cadence.poseCadence, ["continuous", "24fps", "18fps", "12fps"] as const, "project.motion.cadence.poseCadence");

  const performance = record(motion.performance, "project.motion.performance", [
    "id", "weight", "linger", "release", "runway", "overlap", "imperfection", "take",
  ]);
  requireFields(performance, "project.motion.performance", [
    "id", "weight", "linger", "release", "runway", "overlap", "imperfection", "take",
  ]);
  safeString(performance.id, "project.motion.performance.id");
  for (const key of ["weight", "linger", "release", "runway", "overlap", "imperfection"] as const) {
    finiteNumber(performance[key], `project.motion.performance.${key}`, 0, 1);
  }
  wholeNumber(performance.take, "project.motion.performance.take", 1, 1_000_000);

  const character = record(motion.character, "project.motion.character", ["id", "amount"]);
  requireFields(character, "project.motion.character", ["id", "amount"]);
  oneOf(character.id, ["direct", "weighted", "spring", "drift"] as const, "project.motion.character.id");
  finiteNumber(character.amount, "project.motion.character.amount", 0, 1);

  const path = record(motion.path, "project.motion.path", [
    "id", "gap", "curvature", "depth", "banking", "focusScale", "edgeFade",
  ]);
  requireFields(path, "project.motion.path", [
    "id", "gap", "curvature", "depth", "banking", "focusScale", "edgeFade",
  ]);
  safeString(path.id, "project.motion.path.id");
  finiteNumber(path.gap, "project.motion.path.gap", 0, 1.5);
  finiteNumber(path.curvature, "project.motion.path.curvature", 0, 1);
  finiteNumber(path.depth, "project.motion.path.depth", 0, 1);
  finiteNumber(path.banking, "project.motion.path.banking", -45, 45);
  finiteNumber(path.focusScale, "project.motion.path.focusScale", 0, 0.5);
  finiteNumber(path.edgeFade, "project.motion.path.edgeFade", 0, 1);

  const seamless = record(motion.seamless, "project.motion.seamless", ["enabled", "loops"]);
  requireFields(seamless, "project.motion.seamless", ["enabled", "loops"]);
  flag(seamless.enabled, "project.motion.seamless.enabled");
  wholeNumber(seamless.loops, "project.motion.seamless.loops", 1, 6);
}

export function validateDriftProjectV3(value: unknown): DriftProjectV3 {
  const project = record(value, "project", [
    "schema", "formatVersion", "projectId", "projectSeed", "createdAt", "updatedAt",
    "composition", "media", "slides", "motion", "card", "material", "lighting",
    "atmosphere", "lens", "sound", "presenter", "master", "provenance",
  ]);
  requireFields(project, "project", [
    "schema", "formatVersion", "projectId", "projectSeed", "createdAt", "updatedAt",
    "composition", "media", "slides", "motion", "card", "material", "lighting",
    "atmosphere", "lens", "sound", "presenter", "master", "provenance",
  ]);
  if (project.schema !== DRIFT_PROJECT_SCHEMA) fail("project.schema", `must be ${DRIFT_PROJECT_SCHEMA}`);
  if (project.formatVersion !== DRIFT_PROJECT_VERSION) fail("project.formatVersion", `must be ${DRIFT_PROJECT_VERSION}`);
  safeString(project.projectId, "project.projectId", 512);
  wholeNumber(project.projectSeed, "project.projectSeed", 0, 4_294_967_295);
  const createdAt = isoDate(project.createdAt, "project.createdAt");
  const updatedAt = isoDate(project.updatedAt, "project.updatedAt");
  if (updatedAt < createdAt) fail("project.updatedAt", "must not precede project.createdAt");

  const composition = record(project.composition, "project.composition", ["width", "height", "alphaMode", "colourSpace"]);
  requireFields(composition, "project.composition", ["width", "height", "alphaMode", "colourSpace"]);
  wholeNumber(composition.width, "project.composition.width", 1, 16_384);
  wholeNumber(composition.height, "project.composition.height", 1, 16_384);
  oneOf(composition.alphaMode, ["opaque", "transparent"] as const, "project.composition.alphaMode");
  oneOf(composition.colourSpace, ["srgb-rec709"] as const, "project.composition.colourSpace");

  const media = record(project.media, "project.media", ["order", "presenterAssetId", "assets"]);
  requireFields(media, "project.media", ["order", "presenterAssetId", "assets"]);
  const order = stringArray(media.order, "project.media.order", 200);
  const presenterAssetId = nullableSafeString(media.presenterAssetId, "project.media.presenterAssetId", 512);
  const assets = record(media.assets, "project.media.assets", []);
  const assetIds = Object.keys(assets);
  if (assetIds.length > 201) fail("project.media.assets", "contains more than 201 assets");
  for (const id of assetIds) validateAsset(assets[id], `project.media.assets.${id}`, id);
  for (const id of order) {
    const asset = assets[id] as Record<string, unknown> | undefined;
    if (!asset) fail("project.media.order", `references missing asset ${id}`);
    if (asset.kind !== "image") fail("project.media.order", `references non-image asset ${id}`);
  }
  if (presenterAssetId !== null) {
    const presenter = assets[presenterAssetId] as Record<string, unknown> | undefined;
    if (!presenter) fail("project.media.presenterAssetId", "references missing media");
    if (presenter.kind !== "video") fail("project.media.presenterAssetId", "must reference video media");
  }
  const consumed = new Set([...order, ...(presenterAssetId ? [presenterAssetId] : [])]);
  if (consumed.size !== assetIds.length || assetIds.some((id) => !consumed.has(id))) {
    fail("project.media.assets", "contains unreferenced media");
  }

  const slides = record(project.slides, "project.slides", []);
  if (Object.keys(slides).length !== order.length) fail("project.slides", "must contain one directive per ordered slide");
  for (const id of order) {
    const directive = record(slides[id], `project.slides.${id}`, ["assetId", "fit", "focalX", "focalY", "scaleOffset"]);
    requireFields(directive, `project.slides.${id}`, ["assetId", "fit", "focalX", "focalY", "scaleOffset"]);
    if (directive.assetId !== id) fail(`project.slides.${id}.assetId`, "must match the slide key");
    oneOf(directive.fit, ["cover", "contain"] as const, `project.slides.${id}.fit`);
    finiteNumber(directive.focalX, `project.slides.${id}.focalX`, 0, 1);
    finiteNumber(directive.focalY, `project.slides.${id}.focalY`, 0, 1);
    finiteNumber(directive.scaleOffset, `project.slides.${id}.scaleOffset`, -0.75, 0.75);
  }
  for (const id of Object.keys(slides)) if (!order.includes(id)) fail(`project.slides.${id}`, "does not belong to the ordered deck");

  validateMotion(project.motion);

  const card = record(project.card, "project.card", [
    "aspectWidth", "aspectHeight", "scale", "defaultFit", "radius", "smoothing",
    "borderWidth", "borderColor", "borderOpacity",
  ]);
  requireFields(card, "project.card", [
    "aspectWidth", "aspectHeight", "scale", "defaultFit", "radius", "smoothing",
    "borderWidth", "borderColor", "borderOpacity",
  ]);
  finiteNumber(card.aspectWidth, "project.card.aspectWidth", 0.01, 100);
  finiteNumber(card.aspectHeight, "project.card.aspectHeight", 0.01, 100);
  finiteNumber(card.scale, "project.card.scale", 0.2, 1.25);
  oneOf(card.defaultFit, ["cover", "contain"] as const, "project.card.defaultFit");
  finiteNumber(card.radius, "project.card.radius", 0, 512);
  finiteNumber(card.smoothing, "project.card.smoothing", 0, 1);
  finiteNumber(card.borderWidth, "project.card.borderWidth", 0, 32);
  colour(card.borderColor, "project.card.borderColor");
  finiteNumber(card.borderOpacity, "project.card.borderOpacity", 0, 1);

  const material = record(project.material, "project.material", ["surface", "flex", "thickness", "roughness", "sheen", "finish"]);
  requireFields(material, "project.material", ["surface", "flex", "thickness", "roughness", "sheen", "finish"]);
  oneOf(material.surface, ["card", "paper", "silk", "gel"] as const, "project.material.surface");
  for (const key of ["flex", "roughness", "sheen"] as const) finiteNumber(material[key], `project.material.${key}`, 0, 1);
  finiteNumber(material.thickness, "project.material.thickness", 0, 128);
  const finish = record(material.finish, "project.material.finish", ["id", "registration", "localSoftness", "localSmear", "microtexture"]);
  requireFields(finish, "project.material.finish", ["id", "registration", "localSoftness", "localSmear", "microtexture"]);
  safeString(finish.id, "project.material.finish.id");
  for (const key of ["registration", "localSoftness", "localSmear", "microtexture"] as const) {
    finiteNumber(finish[key], `project.material.finish.${key}`, 0, 1);
  }

  const lighting = record(project.lighting, "project.lighting", [
    "enabled", "presetId", "space", "motionMode", "motionSpeed", "keyColor", "fillColor", "shadowColor",
    "azimuth", "elevation", "keyIntensity", "fillIntensity", "rimIntensity", "artworkProtection",
    "heroProtection", "shadowOpacity", "shadowSoftness", "shadowDistance", "contactStrength",
    "backgroundSpill", "spillFocus", "gobo", "goboStrength", "breath",
  ]);
  requireFields(lighting, "project.lighting", [
    "enabled", "presetId", "space", "motionMode", "motionSpeed", "keyColor", "fillColor", "shadowColor",
    "azimuth", "elevation", "keyIntensity", "fillIntensity", "rimIntensity", "artworkProtection",
    "heroProtection", "shadowOpacity", "shadowSoftness", "shadowDistance", "contactStrength",
    "backgroundSpill", "spillFocus", "gobo", "goboStrength", "breath",
  ]);
  flag(lighting.enabled, "project.lighting.enabled");
  safeString(lighting.presetId, "project.lighting.presetId");
  oneOf(lighting.space, ["stage", "card"] as const, "project.lighting.space");
  oneOf(lighting.motionMode, ["static", "breathe", "sweep", "flicker", "orbit"] as const, "project.lighting.motionMode");
  finiteNumber(lighting.motionSpeed, "project.lighting.motionSpeed", 0, 8);
  colour(lighting.keyColor, "project.lighting.keyColor");
  colour(lighting.fillColor, "project.lighting.fillColor");
  colour(lighting.shadowColor, "project.lighting.shadowColor");
  finiteNumber(lighting.azimuth, "project.lighting.azimuth", -180, 180);
  finiteNumber(lighting.elevation, "project.lighting.elevation", 0, 90);
  for (const key of [
    "keyIntensity", "fillIntensity", "rimIntensity", "artworkProtection", "heroProtection",
    "shadowOpacity", "contactStrength", "backgroundSpill", "goboStrength", "breath",
  ] as const) finiteNumber(lighting[key], `project.lighting.${key}`, 0, key.endsWith("Intensity") ? 2 : 1);
  finiteNumber(lighting.shadowSoftness, "project.lighting.shadowSoftness", 0, 256);
  finiteNumber(lighting.shadowDistance, "project.lighting.shadowDistance", 0, 512);
  finiteNumber(lighting.spillFocus, "project.lighting.spillFocus", 0.1, 2);
  safeString(lighting.gobo, "project.lighting.gobo");

  const atmosphere = record(project.atmosphere, "project.atmosphere", [
    "enabled", "family", "composition", "paletteId", "treatment", "recut", "seedOffset", "presence",
    "intensity", "motion", "grain", "vignette", "colourA", "colourB", "accent",
  ]);
  requireFields(atmosphere, "project.atmosphere", [
    "enabled", "family", "composition", "paletteId", "treatment", "recut", "seedOffset", "presence",
    "intensity", "motion", "grain", "vignette", "colourA", "colourB", "accent",
  ]);
  flag(atmosphere.enabled, "project.atmosphere.enabled");
  safeString(atmosphere.family, "project.atmosphere.family");
  safeString(atmosphere.composition, "project.atmosphere.composition");
  nullableSafeString(atmosphere.paletteId, "project.atmosphere.paletteId");
  oneOf(atmosphere.treatment, ["quiet", "cinema", "graphic", "weathered"] as const, "project.atmosphere.treatment");
  wholeNumber(atmosphere.recut, "project.atmosphere.recut", 0, 1_000_000);
  wholeNumber(atmosphere.seedOffset, "project.atmosphere.seedOffset", 0, 4_294_967_295);
  oneOf(atmosphere.presence, ["whisper", "balanced", "statement"] as const, "project.atmosphere.presence");
  for (const key of ["intensity", "motion", "grain", "vignette"] as const) finiteNumber(atmosphere[key], `project.atmosphere.${key}`, 0, 1);
  colour(atmosphere.colourA, "project.atmosphere.colourA");
  colour(atmosphere.colourB, "project.atmosphere.colourB");
  colour(atmosphere.accent, "project.atmosphere.accent");

  const lens = record(project.lens, "project.lens", [
    "enabled", "characterId", "presence", "focus", "directionalSmear", "chromaticSeparation",
    "bloom", "halation", "flare", "curvature", "gateWeave", "cameraGrain", "vignette", "presenterTreatment",
  ]);
  requireFields(lens, "project.lens", [
    "enabled", "characterId", "presence", "focus", "directionalSmear", "chromaticSeparation",
    "bloom", "halation", "flare", "curvature", "gateWeave", "cameraGrain", "vignette", "presenterTreatment",
  ]);
  flag(lens.enabled, "project.lens.enabled");
  safeString(lens.characterId, "project.lens.characterId");
  for (const key of [
    "presence", "focus", "directionalSmear", "chromaticSeparation", "bloom", "halation",
    "flare", "gateWeave", "cameraGrain", "vignette",
  ] as const) finiteNumber(lens[key], `project.lens.${key}`, 0, 1);
  finiteNumber(lens.curvature, "project.lens.curvature", -1, 1);
  oneOf(lens.presenterTreatment, ["protected", "through-lens"] as const, "project.lens.presenterTreatment");

  const sound = record(project.sound, "project.sound", [
    "source", "material", "grammar", "density", "texture", "take", "masterLevel", "motionLevel",
    "interfaceLevel", "underVoice", "previewEnabled", "exportEnabled",
  ]);
  requireFields(sound, "project.sound", [
    "source", "material", "grammar", "density", "texture", "take", "masterLevel", "motionLevel",
    "interfaceLevel", "underVoice", "previewEnabled", "exportEnabled",
  ]);
  oneOf(sound.source, ["recorded", "procedural"] as const, "project.sound.source");
  safeString(sound.material, "project.sound.material");
  oneOf(sound.grammar, ["dry", "editorial", "organic"] as const, "project.sound.grammar");
  for (const key of ["density", "texture", "masterLevel", "motionLevel", "interfaceLevel", "underVoice"] as const) {
    finiteNumber(sound[key], `project.sound.${key}`, 0, 1);
  }
  wholeNumber(sound.take, "project.sound.take", 1, 1_000_000);
  flag(sound.previewEnabled, "project.sound.previewEnabled");
  flag(sound.exportEnabled, "project.sound.exportEnabled");

  const presenter = record(project.presenter, "project.presenter", [
    "enabled", "x", "y", "width", "aspectWidth", "aspectHeight", "fit", "radius", "smoothing",
    "borderWidth", "borderColor", "borderOpacity", "muted", "gain", "trimStart", "startAt",
  ]);
  requireFields(presenter, "project.presenter", [
    "enabled", "x", "y", "width", "aspectWidth", "aspectHeight", "fit", "radius", "smoothing",
    "borderWidth", "borderColor", "borderOpacity", "muted", "gain", "trimStart", "startAt",
  ]);
  flag(presenter.enabled, "project.presenter.enabled");
  finiteNumber(presenter.x, "project.presenter.x", 0, 1);
  finiteNumber(presenter.y, "project.presenter.y", 0, 1);
  finiteNumber(presenter.width, "project.presenter.width", 0.05, 1);
  finiteNumber(presenter.aspectWidth, "project.presenter.aspectWidth", 0.01, 100);
  finiteNumber(presenter.aspectHeight, "project.presenter.aspectHeight", 0.01, 100);
  oneOf(presenter.fit, ["cover", "contain"] as const, "project.presenter.fit");
  finiteNumber(presenter.radius, "project.presenter.radius", 0, 512);
  finiteNumber(presenter.smoothing, "project.presenter.smoothing", 0, 1);
  finiteNumber(presenter.borderWidth, "project.presenter.borderWidth", 0, 32);
  colour(presenter.borderColor, "project.presenter.borderColor");
  finiteNumber(presenter.borderOpacity, "project.presenter.borderOpacity", 0, 1);
  flag(presenter.muted, "project.presenter.muted");
  finiteNumber(presenter.gain, "project.presenter.gain", 0, 4);
  finiteNumber(presenter.trimStart, "project.presenter.trimStart", 0, 86_400);
  finiteNumber(presenter.startAt, "project.presenter.startAt", 0, 86_400);
  if (presenter.enabled && presenterAssetId === null) fail("project.presenter.enabled", "requires presenter media");

  const master = record(project.master, "project.master", ["fps", "duration", "reducedMotion", "video", "audio"]);
  requireFields(master, "project.master", ["fps", "duration", "reducedMotion", "video", "audio"]);
  oneOf(master.fps, [24, 25, 30, 50, 60] as const, "project.master.fps");
  finiteNumber(master.duration, "project.master.duration", 3, 30);
  flag(master.reducedMotion, "project.master.reducedMotion");
  const video = record(master.video, "project.master.video", ["format", "bitrate"]);
  requireFields(video, "project.master.video", ["format", "bitrate"]);
  oneOf(video.format, ["h264"] as const, "project.master.video.format");
  wholeNumber(video.bitrate, "project.master.video.bitrate", 100_000, 200_000_000);
  const audio = record(master.audio, "project.master.audio", ["enabled", "bitrate"]);
  requireFields(audio, "project.master.audio", ["enabled", "bitrate"]);
  flag(audio.enabled, "project.master.audio.enabled");
  wholeNumber(audio.bitrate, "project.master.audio.bitrate", 32_000, 512_000);
  if (audio.enabled && !sound.exportEnabled && (presenterAssetId === null || presenter.muted === true)) {
    fail("project.master.audio.enabled", "requires presenter audio or exported sound");
  }

  const provenance = record(project.provenance, "project.provenance", ["world", "worldVariant", "recipes", "lockedDomains"]);
  requireFields(provenance, "project.provenance", ["world", "worldVariant", "recipes", "lockedDomains"]);
  if (provenance.world !== null) validateRecipeReference(provenance.world, "project.provenance.world");
  oneOf(provenance.worldVariant, ["restrained", "directed", "fever", "custom"] as const, "project.provenance.worldVariant");
  const recipes = record(provenance.recipes, "project.provenance.recipes", PROJECT_DOMAINS);
  for (const domain of PROJECT_DOMAINS) {
    if (!(domain in recipes)) fail(`project.provenance.recipes.${domain}`, "is required");
    if (recipes[domain] !== null) validateRecipeReference(recipes[domain], `project.provenance.recipes.${domain}`);
  }
  const lockedDomains = stringArray(provenance.lockedDomains, "project.provenance.lockedDomains", PROJECT_DOMAINS.length);
  for (const [index, domain] of lockedDomains.entries()) {
    if (!PROJECT_DOMAINS.includes(domain as ProjectDomain)) fail(`project.provenance.lockedDomains[${index}]`, "is not a project domain");
  }

  return structuredClone(value) as DriftProjectV3;
}
