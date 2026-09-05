import { imageHeaderDimensions, assertImagePixelBudget } from "./imageDimensions";
import { mediaSha256 } from "./mediaDigest";
import { abortMedia, waitForVideo } from "./mediaWork";
import type { StudioAsset } from "../model";
import { isBuiltInDemoAssetIdentity } from "./demoAssetIdentity";

export const sha256 = mediaSha256;

export async function imageFileToAsset(file: Blob & { name?: string }, id: string = crypto.randomUUID()): Promise<StudioAsset> {
  if (!file.type.startsWith("image/")) throw new Error("Moving-track media must be an image.");
  const dimensions = imageHeaderDimensions(new Uint8Array(await file.slice(0, 2 * 1024 * 1024).arrayBuffer()));
  if (dimensions) assertImagePixelBudget(dimensions.width, dimensions.height);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image", ...(dimensions ? { resizeWidth: 64, resizeHeight: 64, resizeQuality: "low" as const } : {}) });
  } catch {
    throw new Error(`Could not decode ${file.name ?? "image"}. File may be corrupt or unsupported.`);
  }
  const width = dimensions?.width ?? bitmap.width;
  const height = dimensions?.height ?? bitmap.height;
  bitmap.close();
  assertImagePixelBudget(width, height);
  if (!width || !height) throw new Error(`Could not read dimensions for ${file.name ?? "image"}.`);
  const name = file.name ?? `slide-${id.slice(0, 6)}`;
  const demo = isBuiltInDemoAssetIdentity(id, name);
  return {
    id,
    name,
    kind: "image",
    blob: file,
    mimeType: file.type || "application/octet-stream",
    width,
    height,
    hash: await sha256(file),
    objectUrl: URL.createObjectURL(file),
    ...(demo ? { demo: true } : {}),
  };
}

export async function videoFileToAsset(file: Blob & { name?: string }, id: string = crypto.randomUUID(), signal?: AbortSignal): Promise<StudioAsset> {
  if (!file.type.startsWith("video/")) throw new Error("Presenter media must be a video.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    let metadata: { width: number; height: number; duration: number };
    try {
      const loaded = waitForVideo(video, "loadedmetadata", signal);
      video.src = objectUrl;
      await loaded;
      abortMedia(signal);
      metadata = { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
    } finally {
      video.pause();
      video.removeAttribute("src");
      video.load();
    }
    if (
      !Number.isSafeInteger(metadata.width)
      || !Number.isSafeInteger(metadata.height)
      || metadata.width <= 0
      || metadata.height <= 0
      || !Number.isFinite(metadata.duration)
      || metadata.duration <= 0
      || metadata.duration > 86_400
    ) {
      throw new Error(`${file.name ?? "presenter video"} contains no readable video track or valid finite metadata.`);
    }
    return {
      id,
      name: file.name ?? `presenter-${id.slice(0, 6)}`,
      kind: "video",
      blob: file,
      mimeType: file.type || "application/octet-stream",
      width: metadata.width,
      height: metadata.height,
      duration: metadata.duration,
      hash: await sha256(file),
      objectUrl,
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

export function disposeAsset(asset: StudioAsset): void {
  if (asset.objectUrl.startsWith("blob:")) URL.revokeObjectURL(asset.objectUrl);
}

export function sanitizeFilename(name: string): string {
  const cleaned = name.normalize("NFKC").replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-").replace(/\s+/g, " ").trim();
  return cleaned.slice(0, 120) || "untitled";
}

export async function slideFileToAsset(file: File, signal?: AbortSignal): Promise<StudioAsset> {
  abortMedia(signal);
  const asset = file.type.startsWith("video/")
    ? await videoFileToAsset(file, undefined, signal)
    : await imageFileToAsset(file);
  if (signal?.aborted) { disposeAsset(asset); abortMedia(signal); }
  return asset;
}
