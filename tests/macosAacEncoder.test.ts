import { describe, expect, it } from "vitest";
import {
  buildNativeAacPacketTimeline,
  validateNativeAacReceipt,
} from "../src/lib/macosAacEncoder";

const toBase64 = (bytes: readonly number[]): string => (
  btoa(String.fromCharCode(...bytes))
);

function validReceipt() {
  const packets = Array.from({ length: 7 }, (_, index) => {
    const bytes = [index + 1, index + 11, index + 21];
    return {
      dataBase64: toBase64(bytes),
      byteCount: bytes.length,
      frameCount: 1_024,
      variableFrames: 1_024,
    };
  });
  return {
    schemaVersion: 1,
    codec: "aac",
    codecString: "mp4a.40.2",
    encoded: true,
    sampleRate: 48_000,
    numberOfChannels: 2,
    bitRate: 192_000,
    packetFrames: 1_024,
    packetCount: packets.length,
    totalPacketBytes: packets.reduce((sum, packet) => sum + packet.byteCount, 0),
    inputFrames: 4_800,
    leadingFrames: 2_112,
    trailingFrames: 256,
    representedFrames: 7_168,
    frameEquationHolds: true,
    audioSpecificConfigBase64: toBase64([0x11, 0x90]),
    magicCookieBase64: toBase64([0x03, 0x80, 0x80, 0x22]),
    magicCookieBytes: 4,
    firstTimestamp: 0,
    packets,
  };
}

describe("native macOS AAC receipt", () => {
  it("accepts an exact AAC-LC 48 kHz stereo frame equation", () => {
    const receipt = validateNativeAacReceipt(validReceipt());

    expect(receipt.packetCount * receipt.packetFrames).toBe(receipt.representedFrames);
    expect(
      receipt.leadingFrames + receipt.inputFrames + receipt.trailingFrames,
    ).toBe(receipt.representedFrames);
    expect(receipt.totalPacketBytes).toBe(21);
  });

  it("rejects a receipt that hides priming or padding drift", () => {
    const receipt = validReceipt();

    expect(() => validateNativeAacReceipt({
      ...receipt,
      trailingFrames: receipt.trailingFrames + 1,
    })).toThrow(/frame accounting/i);
  });

  it("rejects packet bytes that do not match the native receipt", () => {
    const receipt = validReceipt();
    const packets = [...receipt.packets];
    packets[3] = { ...packets[3]!, byteCount: packets[3]!.byteCount + 1 };

    expect(() => validateNativeAacReceipt({
      ...receipt,
      packets,
    })).toThrow(/packet 4/i);
  });
});

describe("native macOS AAC packet timeline", () => {
  it("represents encoder priming with a negative first timestamp", () => {
    const timeline = buildNativeAacPacketTimeline(0, 2_112, 7);

    expect(timeline).toHaveLength(7);
    expect(timeline[0]?.timestamp).toBe(-2_112 / 48_000);
    expect(timeline[0]?.duration).toBe(1_024 / 48_000);
    expect(timeline[6]?.sequenceNumber).toBe(6);
    const end = timeline[6]!.timestamp + timeline[6]!.duration;
    expect(end).toBeCloseTo((4_800 + 256) / 48_000, 12);
  });

  it("preserves a non-zero source start while subtracting priming", () => {
    const timeline = buildNativeAacPacketTimeline(1.25, 2_112, 2);

    expect(timeline[0]?.timestamp).toBeCloseTo(1.25 - 2_112 / 48_000, 12);
    expect(timeline[1]?.timestamp).toBeCloseTo(
      1.25 - 2_112 / 48_000 + 1_024 / 48_000,
      12,
    );
  });

  it("rejects unsafe timeline inputs", () => {
    expect(() => buildNativeAacPacketTimeline(Number.NaN, 0, 1)).toThrow(TypeError);
    expect(() => buildNativeAacPacketTimeline(0, -1, 1)).toThrow(TypeError);
    expect(() => buildNativeAacPacketTimeline(0, 0, 0)).toThrow(TypeError);
  });
});
