import type { StudioAsset } from "../model";
import { isBuiltInDemoAssetIdentity } from "./demoAssetIdentity";

export async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function imageFileToAsset(file: Blob & { name?: string }, id: string = crypto.randomUUID()): Promise<StudioAsset> {
  if (!file.type.startsWith("image/")) throw new Error("Moving-track media must be an image.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error(`Could not decode ${file.name ?? "image"}. File may be corrupt or unsupported.`);
  }
  const width = bitmap.width;
  const height = bitmap.height;
  bitmap.close();
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

export async function videoFileToAsset(file: Blob & { name?: string }, id: string = crypto.randomUUID()): Promise<StudioAsset> {
  if (!file.type.startsWith("video/")) throw new Error("Presenter media must be a video.");
  const objectUrl = URL.createObjectURL(file);
  try {
    const metadata = await new Promise<{ width: number; height: number; duration: number }>((resolve, reject) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      const done = () => {
        video.removeAttribute("src");
        video.load();
      };
      video.onloadedmetadata = () => {
        const result = { width: video.videoWidth, height: video.videoHeight, duration: video.duration };
        done();
        resolve(result);
      };
      video.onerror = () => {
        done();
        reject(new Error(`Could not decode ${file.name ?? "presenter video"}. Codec may be unsupported.`));
      };
      video.src = objectUrl;
    });
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
