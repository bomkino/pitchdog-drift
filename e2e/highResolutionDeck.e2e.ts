import { expect, test } from "@playwright/test";
import { deflateSync } from "node:zlib";

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function highResolutionPng(width: number, height: number, seed: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const template = Buffer.alloc(1 + width * 4);
  for (let x = 0; x < width; x += 1) {
    const offset = 1 + x * 4;
    const band = Math.floor(x / 96);
    template[offset] = (seed * 31 + band * 23) % 256;
    template[offset + 1] = (seed * 67 + band * 11) % 256;
    template[offset + 2] = (seed * 17 + band * 37) % 256;
    template[offset + 3] = 255;
  }
  const rows = Array.from({ length: height }, (_, y) => {
    const row = Buffer.from(template);
    for (let x = 0; x < width; x += 64) row[1 + x * 4] = (row[1 + x * 4] + Math.floor(y / 72) * 7) % 256;
    return row;
  });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

test("scope and portrait source art survive a high-resolution texture pass", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));

  const files = Array.from({ length: 8 }, (_, index) => {
    const portrait = index % 2 === 1;
    const width = portrait ? 1080 : 2576;
    const height = portrait ? 1920 : 1080;
    return {
      name: `hires-${index + 1}-${portrait ? "portrait" : "scope"}.png`,
      mimeType: "image/png",
      buffer: highResolutionPng(width, height, index + 1),
    };
  });

  await page.goto("/");
  await page.locator('input[type="file"]').first().setInputFiles(files);
  const stage = page.locator('[data-testid="webgl-stage"]');
  await expect(stage).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1_500);
  await page.getByRole("button", { name: /Projection Room/i }).click();
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Silver Tide/i }).click();
  await page.waitForTimeout(500);
  await expect(page.locator("canvas")).toHaveCount(1);
  expect((await stage.screenshot()).byteLength).toBeGreaterThan(10_000);
  expect(errors, errors.join("\n")).toEqual([]);
});
