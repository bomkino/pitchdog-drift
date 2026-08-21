import { expect, test } from "@playwright/test";
import { deflateSync } from "node:zlib";

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
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

function makePng(width: number, height: number, seed: number, transparent = false): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows: Buffer[] = [];
  for (let y = 0; y < height; y += 1) {
    const row = Buffer.alloc(1 + width * 4);
    row[0] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = 1 + x * 4;
      row[offset] = (seed * 37 + x * 3 + y) % 256;
      row[offset + 1] = (seed * 71 + x + y * 2) % 256;
      row[offset + 2] = (seed * 19 + x * 2 + y * 3) % 256;
      row[offset + 3] = transparent && (x + y + seed) % 7 === 0 ? 110 : 255;
    }
    rows.push(row);
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function makeDeck(count: number) {
  const sizes = [
    [320, 180, "16x9"],
    [180, 320, "9x16"],
    [240, 240, "square"],
    [384, 160, "scope"],
    [256, 192, "4x3"],
  ] as const;
  return Array.from({ length: count }, (_, index) => {
    const [width, height, ratio] = sizes[index % sizes.length];
    return {
      name: `deck-${String(index + 1).padStart(3, "0")}-${ratio}.png`,
      mimeType: "image/png",
      buffer: makePng(width, height, index + 1, index % 9 === 0),
    };
  });
}

test.describe("large-deck renderer gauntlet", () => {
  test("a 90-slide mixed-ratio deck remains healthy", async ({ page }) => {
    test.setTimeout(120_000);
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(`console: ${message.text()}`);
    });
    page.on("pageerror", (error) => errors.push(`page: ${error.message}`));

    await page.goto("/");
    const input = page.locator('input[type="file"]').first();
    await expect(input).toHaveCount(1);
    await input.setInputFiles(makeDeck(90));
    await expect.poll(() => input.evaluate((element: HTMLInputElement) => element.files?.length ?? 0), {
      timeout: 30_000,
    }).toBe(90);

    const stage = page.locator('[data-testid="webgl-stage"]');
    await expect(stage).toBeVisible({ timeout: 30_000 });
    await page.waitForTimeout(1_500);
    await expect(page.locator("canvas")).toHaveCount(1);

    await page.getByRole("button", { name: /Night Run/i }).click();
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: /Opal Nocturne/i }).click();
    await page.waitForTimeout(600);
    await expect(stage).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(1);
    expect((await stage.screenshot()).byteLength).toBeGreaterThan(10_000);
    expect(errors, errors.join("\n")).toEqual([]);
  });

  test("replacing a large deck releases the old presentation surface", async ({ page }) => {
    test.setTimeout(120_000);
    const input = page.locator('input[type="file"]').first();
    await page.goto("/");
    await input.setInputFiles(makeDeck(90));
    await expect.poll(() => input.evaluate((element: HTMLInputElement) => element.files?.length ?? 0), {
      timeout: 30_000,
    }).toBe(90);
    await input.setInputFiles(makeDeck(8));
    await expect.poll(() => input.evaluate((element: HTMLInputElement) => element.files?.length ?? 0), {
      timeout: 30_000,
    }).toBe(8);
    await page.waitForTimeout(1_200);
    await expect(page.locator('[data-testid="webgl-stage"]')).toBeVisible();
    await expect(page.locator("canvas")).toHaveCount(1);
  });
});
