import { expect, test } from "@playwright/test";

test("protected slide pixels stay source-faithful while the world grain and physical card move", async ({ page }, testInfo) => {
  await page.goto("/");
  const receipt = await page.evaluate(async () => {
    const [
      { CinematicCarousel },
      { createDefaultDriftProjectV4 },
      { DRIFT_V2_RENDER_CONTRACT },
    ] = await Promise.all([
      import("/src/engine/CinematicCarousel.ts"),
      import("/src/core/project/defaults.ts"),
      import("/src/core/project/schema.ts"),
    ]);

    const width = 384;
    const height = 384;
    const source = document.createElement("canvas");
    source.width = 256;
    source.height = 256;
    const sourceContext = source.getContext("2d", { willReadFrequently: true })!;
    sourceContext.fillStyle = "#e53d73";
    sourceContext.fillRect(0, 0, source.width, source.height);
    const sourceRgb = Array.from(sourceContext.getImageData(128, 128, 1, 1).data.slice(0, 3));
    const blob = await new Promise<Blob>((resolve, reject) => source.toBlob(
      (value) => value ? resolve(value) : reject(new Error("Proof fixture could not encode.")),
      "image/png",
    ));
    const asset = {
      id: "proof-safe-calibration",
      name: "proof-safe-calibration.png",
      kind: "image" as const,
      blob,
      mimeType: "image/png",
      width: source.width,
      height: source.height,
      hash: "a".repeat(64),
      objectUrl: URL.createObjectURL(blob),
    };

    const projectFor = (speed: number) => {
      const project = createDefaultDriftProjectV4(
        `proof-safe-${speed}`,
        "2026-08-24T00:00:00.000Z",
        91,
        DRIFT_V2_RENDER_CONTRACT,
      );
      project.composition = { ...project.composition, width, height, alphaMode: "opaque" };
      project.media.order = [asset.id];
      project.media.assets = {
        [asset.id]: {
          id: asset.id,
          name: asset.name,
          kind: asset.kind,
          mimeType: asset.mimeType,
          hash: asset.hash,
          byteLength: asset.blob.size,
          width: asset.width,
          height: asset.height,
        },
      };
      project.slides = {
        [asset.id]: { assetId: asset.id, fit: "cover", focalX: 0.5, focalY: 0.5, scaleOffset: 0 },
      };
      project.motion.transport = { axis: "horizontal", direction: -1, slidesPerSecond: speed };
      project.motion.path = {
        ...project.motion.path,
        id: "ribbon",
        gap: 0.24,
        curvature: 0.52,
        depth: 0.32,
        banking: 8,
        focusScale: 0.06,
        edgeFade: 0.2,
      };
      project.card = {
        ...project.card,
        aspectWidth: 1,
        aspectHeight: 1,
        scale: 0.58,
        radius: 22,
        borderWidth: 0,
        borderOpacity: 0,
      };
      project.material = {
        ...project.material,
        surface: "silk",
        flex: 1,
        thickness: 0.07,
        roughness: 0.15,
        sheen: 1,
        finish: { ...project.material.finish, id: "custom", microtexture: 1 },
      };
      project.lighting = {
        ...project.lighting,
        enabled: true,
        motionMode: "sweep",
        keyColor: "#40a9ff",
        fillColor: "#ffe041",
        keyIntensity: 2,
        fillIntensity: 2,
        rimIntensity: 2,
        artworkProtection: 1,
        heroProtection: 1,
        shadowOpacity: 0.42,
        shadowSoftness: 56,
        shadowDistance: 44,
      };
      project.atmosphere = {
        ...project.atmosphere,
        enabled: true,
        family: "solid",
        composition: "pure-field",
        intensity: 0,
        motion: 0,
        grain: 0.32,
        vignette: 0,
        colourA: "#111a28",
        colourB: "#111a28",
        accent: "#111a28",
      };
      // Camera-stock grain remains meaningful, but is now folded into the
      // background plate. Every other optical treatment is exact identity.
      project.lens = {
        ...project.lens,
        enabled: true,
        presence: 1,
        focus: 0,
        directionalSmear: 0,
        chromaticSeparation: 0,
        bloom: 0,
        halation: 0,
        flare: 0,
        curvature: 0,
        gateWeave: 0,
        cameraGrain: 0.28,
        vignette: 0,
      };
      project.performance = {
        transitionPreset: "quiet-lift",
        entry: { enabled: false },
        body: { durationSeconds: 4, tempo: { kind: "preset", preset: "even" } },
        exit: { enabled: false },
        repeat: { mode: "off" },
        reducedMotion: false,
      };
      project.master = { ...project.master, duration: 4, fps: 30 };
      return project;
    };

    const canvas = document.createElement("canvas");
    document.body.append(canvas);
    const stationaryProject = projectFor(0);
    const engine = new CinematicCarousel(canvas, { kind: "project-v4", project: stationaryProject });
    engine.stop();
    engine.resize(width, height);

    const snapshot = async (includePng = false) => {
      const capture = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("Proof frame could not encode.")),
        "image/png",
      ));
      const bitmap = await createImageBitmap(capture, { premultiplyAlpha: "none" });
      const decoded = document.createElement("canvas");
      decoded.width = bitmap.width;
      decoded.height = bitmap.height;
      const context = decoded.getContext("2d", { willReadFrequently: true })!;
      context.drawImage(bitmap, 0, 0);
      bitmap.close();
      const rgba = context.getImageData(0, 0, decoded.width, decoded.height).data;
      const protectedChannels: number[][] = [];
      let minX = decoded.width;
      let minY = decoded.height;
      let maxX = -1;
      let maxY = -1;
      let backgroundLuminance = 0;
      let backgroundCount = 0;
      for (let pixel = 0; pixel < rgba.length; pixel += 4) {
        const red = rgba[pixel]!;
        const green = rgba[pixel + 1]!;
        const blue = rgba[pixel + 2]!;
        const sourceDistance = Math.max(
          Math.abs(red - sourceRgb[0]!),
          Math.abs(green - sourceRgb[1]!),
          Math.abs(blue - sourceRgb[2]!),
        );
        if (sourceDistance <= 2) {
          protectedChannels.push([red, green, blue]);
          const address = pixel / 4;
          const x = address % decoded.width;
          const y = Math.floor(address / decoded.width);
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        } else if (sourceDistance > 32) {
          backgroundLuminance += red * 0.2126 + green * 0.7152 + blue * 0.0722;
          backgroundCount += 1;
        }
      }
      const protectedMean = [0, 1, 2].map((channel) => protectedChannels.reduce(
        (sum, values) => sum + values[channel]!,
        0,
      ) / Math.max(1, protectedChannels.length));
      const digest = Array.from(
        new Uint8Array(await crypto.subtle.digest("SHA-256", await capture.arrayBuffer())),
        (byte) => byte.toString(16).padStart(2, "0"),
      ).join("");
      return {
        digest,
        protectedCount: protectedChannels.length,
        protectedMean,
        bounds: maxX >= minX ? { minX, minY, maxX, maxY } : null,
        backgroundMean: backgroundLuminance / Math.max(1, backgroundCount),
        pngBase64: includePng
          ? await new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.addEventListener("load", () => resolve(String(reader.result).split(",")[1] ?? ""), { once: true });
              reader.addEventListener("error", () => reject(reader.error ?? new Error("Proof frame readback failed.")), { once: true });
              reader.readAsDataURL(capture);
            })
          : null,
      };
    };

    const internal = engine as unknown as { elapsed: number; renderPreview(): void };
    try {
      await engine.setV2ProjectState(stationaryProject, [asset]);
      internal.elapsed = 1;
      internal.renderPreview();
      const preview = await snapshot();

      const exportSurface = engine.beginExport(width, height);
      await engine.renderAtAsync(1, 30);
      const exported = await snapshot();
      exportSurface.restore();

      const stationaryFrames = [];
      for (const frameIndex of [30, 45, 60]) {
        const surface = engine.beginExport(width, height);
        await engine.renderAtAsync(frameIndex / 30, frameIndex);
        stationaryFrames.push(await snapshot());
        surface.restore();
      }

      const movingProject = projectFor(0.82);
      movingProject.atmosphere.grain = 0;
      movingProject.lens.enabled = false;
      await engine.setV2ProjectState(movingProject, [asset]);
      const movingFrames = [];
      for (const frameIndex of [26, 38, 50, 62, 74, 86]) {
        const surface = engine.beginExport(width, height);
        await engine.renderAtAsync(frameIndex / 30, frameIndex);
        movingFrames.push(await snapshot());
        surface.restore();
      }

      const protectedReferenceProject = projectFor(0);
      protectedReferenceProject.atmosphere.grain = 0;
      protectedReferenceProject.lens.enabled = false;
      await engine.setV2ProjectState(protectedReferenceProject, [asset]);
      const protectedSurface = engine.beginExport(width, height);
      await engine.renderAtAsync(1, 30);
      const protectedReference = await snapshot(true);
      protectedSurface.restore();

      const treatedProject = structuredClone(protectedReferenceProject);
      treatedProject.lighting.presetId = "custom";
      treatedProject.lighting.artworkProtection = 0;
      await engine.setV2ProjectState(treatedProject, [asset]);
      const treatedSurface = engine.beginExport(width, height);
      await engine.renderAtAsync(1, 30);
      const explicitArtworkTreatment = await snapshot(true);
      treatedSurface.restore();

      return {
        sourceRgb,
        preview,
        exported,
        stationaryFrames,
        movingFrames,
        protectedReference,
        explicitArtworkTreatment,
      };
    } finally {
      engine.dispose();
      URL.revokeObjectURL(asset.objectUrl);
      canvas.remove();
    }
  });

  expect(receipt.preview.digest).toBe(receipt.exported.digest);
  expect(receipt.stationaryFrames.every((frame) => frame.protectedCount > 20_000)).toBe(true);
  for (const frame of [...receipt.stationaryFrames, ...receipt.movingFrames]) {
    expect(frame.protectedCount).toBeGreaterThan(500);
    for (let channel = 0; channel < 3; channel += 1) {
      expect(Math.abs(frame.protectedMean[channel]! - receipt.sourceRgb[channel]!)).toBeLessThanOrEqual(1);
    }
  }
  const stationaryProtectedMeans = receipt.stationaryFrames.map((frame) => frame.protectedMean);
  for (let channel = 0; channel < 3; channel += 1) {
    const values = stationaryProtectedMeans.map((mean) => mean[channel]!);
    expect(Math.max(...values) - Math.min(...values)).toBeLessThanOrEqual(1 / 255);
  }
  expect(new Set(receipt.stationaryFrames.map((frame) => frame.digest)).size).toBeGreaterThan(1);
  const backgroundMeans = receipt.stationaryFrames.map((frame) => frame.backgroundMean);
  expect(Math.max(...backgroundMeans) - Math.min(...backgroundMeans)).toBeLessThanOrEqual(0.5);
  expect(Math.max(...backgroundMeans.map((mean) => Math.abs(mean - receipt.protectedReference.backgroundMean))))
    .toBeLessThanOrEqual(0.75);
  expect(new Set(receipt.movingFrames.map((frame) => frame.digest)).size).toBeGreaterThan(2);
  expect(new Set(receipt.movingFrames.map((frame) => JSON.stringify(frame.bounds))).size).toBeGreaterThan(2);
  expect(receipt.explicitArtworkTreatment.digest).not.toBe(receipt.protectedReference.digest);
  expect(receipt.explicitArtworkTreatment.protectedCount)
    .toBeLessThan(receipt.protectedReference.protectedCount * 0.25);
  await testInfo.attach("proof-safe-source-face.png", {
    body: Buffer.from(receipt.protectedReference.pngBase64!, "base64"),
    contentType: "image/png",
  });
  await testInfo.attach("explicit-artwork-treatment.png", {
    body: Buffer.from(receipt.explicitArtworkTreatment.pngBase64!, "base64"),
    contentType: "image/png",
  });
});
