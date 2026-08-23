export async function loadEmbeddedRecordingBase64(name: string): Promise<string> {
  switch (name) {
    case "book-close.wav": return (await import("./assets/recordings/book-close.wav.b64?raw")).default;
    case "book-flip-1.wav": return (await import("./assets/recordings/book-flip-1.wav.b64?raw")).default;
    case "book-flip-2.wav": return (await import("./assets/recordings/book-flip-2.wav.b64?raw")).default;
    case "book-place-1.wav": return (await import("./assets/recordings/book-place-1.wav.b64?raw")).default;
    case "book-place-3.wav": return (await import("./assets/recordings/book-place-3.wav.b64?raw")).default;
    case "card-place-2.wav": return (await import("./assets/recordings/card-place-2.wav.b64?raw")).default;
    case "card-place-3.wav": return (await import("./assets/recordings/card-place-3.wav.b64?raw")).default;
    case "card-shove-1.wav": return (await import("./assets/recordings/card-shove-1.wav.b64?raw")).default;
    case "card-shove-2.wav": return (await import("./assets/recordings/card-shove-2.wav.b64?raw")).default;
    case "card-slide-1.wav": return (await import("./assets/recordings/card-slide-1.wav.b64?raw")).default;
    case "card-slide-2.wav": return (await import("./assets/recordings/card-slide-2.wav.b64?raw")).default;
    case "cloth-2.wav": return (await import("./assets/recordings/cloth-2.wav.b64?raw")).default;
    case "cloth-4.wav": return (await import("./assets/recordings/cloth-4.wav.b64?raw")).default;
    case "generic-impact-1.wav": return (await import("./assets/recordings/generic-impact-1.wav.b64?raw")).default;
    case "generic-impact-2.wav": return (await import("./assets/recordings/generic-impact-2.wav.b64?raw")).default;
    case "leather-drop.wav": return (await import("./assets/recordings/leather-drop.wav.b64?raw")).default;
    case "leather-handle-1.wav": return (await import("./assets/recordings/leather-handle-1.wav.b64?raw")).default;
    case "leather-handle-2.wav": return (await import("./assets/recordings/leather-handle-2.wav.b64?raw")).default;
    case "metal-click.wav": return (await import("./assets/recordings/metal-click.wav.b64?raw")).default;
    case "metal-latch.wav": return (await import("./assets/recordings/metal-latch.wav.b64?raw")).default;
    case "soft-impact-1.wav": return (await import("./assets/recordings/soft-impact-1.wav.b64?raw")).default;
    case "soft-impact-2.wav": return (await import("./assets/recordings/soft-impact-2.wav.b64?raw")).default;
    case "wood-impact-1.wav": return (await import("./assets/recordings/wood-impact-1.wav.b64?raw")).default;
    default: throw new Error(`Unknown embedded tactile recording: ${name}`);
  }
}
