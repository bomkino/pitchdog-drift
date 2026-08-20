import type { StudioAsset } from "../model";
import { sha256 } from "./assets";

const SLIDES = [
  { kicker: "A PITCH IS A MOVEMENT", lines: ["LET THE", "DECK", "BREATHE"], bg: "#e5d5bd", fg: "#211b17", accent: "#a7442f", mark: "01" },
  { kicker: "BEGIN WITH PRESSURE", lines: ["MAKE", "THEM", "LEAN IN"], bg: "#151111", fg: "#f1e6d4", accent: "#b82f27", mark: "02" },
  { kicker: "ONE FRAME. ONE IDEA.", lines: ["SILENCE", "HAS", "WEIGHT"], bg: "#32433f", fg: "#f5ead5", accent: "#d4a05c", mark: "03" },
  { kicker: "THE WORLD ARRIVES", lines: ["WIDE", "OPEN", "ROAD"], bg: "#ba603c", fg: "#f7e0bd", accent: "#223d4a", mark: "04" },
  { kicker: "THEN TURN THE KNIFE", lines: ["SOMETHING", "IS", "WRONG"], bg: "#070707", fg: "#ded8ca", accent: "#7f1016", mark: "05" },
  { kicker: "CHANGE THE TEMPERATURE", lines: ["A SOFTER", "KIND OF", "BRAVE"], bg: "#68434c", fg: "#f6dfd4", accent: "#e5a38a", mark: "06" },
  { kicker: "EVIDENCE, NOT NOISE", lines: ["SHOW", "THE", "PROOF"], bg: "#d7d4ca", fg: "#151515", accent: "#57544c", mark: "07" },
  { kicker: "PITCH.DOG / DRIFT", lines: ["END", "ON A", "DOOR"], bg: "#17213a", fg: "#eee5d4", accent: "#6bb0be", mark: "08" },
] as const;

function seededNoise(ctx: CanvasRenderingContext2D, seed: number): void {
  const image = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  let value = seed * 2654435761;
  for (let i = 0; i < image.data.length; i += 4) {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    const noise = ((value >>> 0) % 19) - 9;
    image.data[i] = Math.max(0, Math.min(255, image.data[i]! + noise));
    image.data[i + 1] = Math.max(0, Math.min(255, image.data[i + 1]! + noise));
    image.data[i + 2] = Math.max(0, Math.min(255, image.data[i + 2]! + noise));
  }
  ctx.putImageData(image, 0, 0);
}

async function createSlide(index: number): Promise<StudioAsset> {
  const data = SLIDES[index]!;
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 900;
  const ctx = canvas.getContext("2d", { alpha: false })!;
  ctx.fillStyle = data.bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.globalAlpha = 0.94;
  ctx.fillStyle = data.accent;
  const offset = index % 2 === 0 ? 1030 : 90;
  ctx.fillRect(offset, 0, index % 3 === 0 ? 470 : 330, 900);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = data.fg;
  ctx.globalAlpha = 0.32;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(88, 88);
  ctx.lineTo(1512, 88);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.fillStyle = data.fg;
  ctx.font = "600 22px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.letterSpacing = "4px";
  ctx.fillText(data.kicker, 92, 62);
  ctx.textAlign = "right";
  ctx.fillText(data.mark, 1508, 62);
  ctx.textAlign = "left";

  const baseY = 284;
  ctx.font = "800 132px Arial, Helvetica, sans-serif";
  ctx.letterSpacing = "-6px";
  data.lines.forEach((line, lineIndex) => ctx.fillText(line, 92, baseY + lineIndex * 150));

  ctx.font = "500 18px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.letterSpacing = "3px";
  ctx.fillText("CINEMATIC SLIDE STUDY / LOCAL ONLY", 92, 842);
  seededNoise(ctx, 41 + index * 17);

  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("Demo slide encoding failed."))), "image/png"),
  );
  const id = `demo-${String(index + 1).padStart(2, "0")}`;
  return {
    id,
    name: `Drift study ${String(index + 1).padStart(2, "0")}.png`,
    kind: "image",
    blob,
    mimeType: "image/png",
    width: canvas.width,
    height: canvas.height,
    hash: await sha256(blob),
    objectUrl: URL.createObjectURL(blob),
    demo: true,
  };
}

export async function createDemoSlides(): Promise<StudioAsset[]> {
  return Promise.all(SLIDES.map((_, index) => createSlide(index)));
}

