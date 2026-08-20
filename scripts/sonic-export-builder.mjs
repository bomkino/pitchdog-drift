import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();

function absolute(relative) {
  return path.join(ROOT, relative);
}

async function text(relative) {
  return await readFile(absolute(relative), "utf8");
}

async function write(relative, content) {
  await writeFile(absolute(relative), content);
}

async function replaceOnce(relative, before, after) {
  const current = await text(relative);
  const count = current.split(before).length - 1;
  if (count !== 1) throw new Error(`${relative}: expected one exact patch target, found ${count}.`);
  await write(relative, current.replace(before, after));
}

async function replaceBetween(relative, start, end, replacement) {
  const current = await text(relative);
  const startIndex = current.indexOf(start);
  const endIndex = current.indexOf(end, startIndex + start.length);
  if (startIndex < 0 || endIndex < 0 || current.indexOf(start, startIndex + 1) >= 0) {
    throw new Error(`${relative}: section boundaries are missing or ambiguous.`);
  }
  await write(relative, current.slice(0, startIndex) + replacement + current.slice(endIndex));
}

async function patchExportStudio() {
  await replaceOnce(
    "src/lib/exportStudio.ts",
    "  ALL_FORMATS,\n  AudioSampleSink,\n",
    "  ALL_FORMATS,\n  AudioSample,\n  AudioSampleSink,\n",
  );
  await replaceOnce(
    "src/lib/exportStudio.ts",
    "import type {\n  AudioSample,\n  InputAudioTrack,\n",
    "import type {\n  InputAudioTrack,\n",
  );
  await replaceOnce(
    "src/lib/exportStudio.ts",
    `} from "mediabunny";

export const AVC_BITRATE`,
    `} from "mediabunny";
import { mixSoundtrackIntoPlanar } from "../sonic/mix";

export const AVC_BITRATE`,
  );
  await replaceOnce(
    "src/lib/exportStudio.ts",
    `  /** Defaults true. Set false when the pinned presenter is muted. */
  includePresenterAudio?: boolean;
  signal?: AbortSignal;`,
    `  /** Defaults true. Set false when the pinned presenter is muted. */
  includePresenterAudio?: boolean;
  /** Exact-length 48 kHz stereo effects bed rendered from saved project state. */
  soundtrack?: AudioBuffer;
  /** Effects gain only when presenter speech shares the track. Defaults 0.5. */
  soundtrackGainWhenMixed?: number;
  signal?: AbortSignal;`,
  );
  await replaceOnce(
    "src/lib/exportStudio.ts",
    `  audio: null | Readonly<{
    codec: "aac";
    bitrate: typeof AAC_BITRATE;
    sampleRate: typeof AUDIO_SAMPLE_RATE;
    channels: typeof AUDIO_CHANNELS;
    duration: number;
  }>;`,
    `  audio: null | Readonly<{
    codec: "aac";
    bitrate: typeof AAC_BITRATE;
    sampleRate: typeof AUDIO_SAMPLE_RATE;
    channels: typeof AUDIO_CHANNELS;
    duration: number;
    source: "presenter" | "sound-design" | "mixed";
  }>;`,
  );
  await replaceOnce(
    "src/lib/exportStudio.ts",
    "  if (!aac) reasons.push(\"Browser has no compatible AAC encoder; presenter audio cannot be exported safely.\");\n",
    "  if (!aac) reasons.push(\"Browser has no compatible AAC encoder; audio-bearing masters cannot be exported safely.\");\n",
  );
  await replaceOnce(
    "src/lib/exportStudio.ts",
    "    reasons.push(\"Presenter audio is limited to 30 fps; mute it for a higher-frame-rate master.\");\n",
    "    reasons.push(\"Audio-bearing masters are limited to 30 fps; disable exported sound for a higher-frame-rate master.\");\n",
  );
  await replaceOnce(
    "src/lib/exportStudio.ts",
    `    "Presenter audio can only be exported at 30 fps or lower. Choose 30 fps, or mute the presenter for a higher-frame-rate master.",`,
    `    "Audio can only be exported at 30 fps or lower. Choose 30 fps, or disable exported effects and mute the presenter for a higher-frame-rate master.",`,
  );
  await replaceOnce(
    "src/lib/exportStudio.ts",
    "export async function exportMp4(options: Mp4ExportOptions): Promise<Mp4ExportResult> {\n",
    `function validateSoundtrackBuffer(
  soundtrack: AudioBuffer,
  duration: number,
  gainWhenMixed: number,
): void {
  if (!Number.isFinite(gainWhenMixed) || gainWhenMixed < 0 || gainWhenMixed > 1) {
    throw invalidSettings("Soundtrack under-voice gain must be between 0 and 1.", { gainWhenMixed });
  }
  if (
    !soundtrack
    || soundtrack.sampleRate !== AUDIO_SAMPLE_RATE
    || soundtrack.numberOfChannels !== AUDIO_CHANNELS
    || !Number.isInteger(soundtrack.length)
    || soundtrack.length <= 0
  ) {
    throw invalidSettings("Soundtrack must be a non-empty 48 kHz stereo AudioBuffer.", {
      sampleRate: soundtrack?.sampleRate,
      channels: soundtrack?.numberOfChannels,
      length: soundtrack?.length,
    });
  }
  const expectedFrames = Math.round(duration * AUDIO_SAMPLE_RATE);
  if (soundtrack.length !== expectedFrames) {
    throw invalidSettings("Soundtrack length must exactly match the fixed-step export timeline.", {
      expectedFrames,
      actualFrames: soundtrack.length,
      duration,
    });
  }
  for (let channel = 0; channel < AUDIO_CHANNELS; channel += 1) {
    const data = soundtrack.getChannelData(channel);
    if (!(data instanceof Float32Array) || data.length !== expectedFrames) {
      throw invalidSettings("Soundtrack channel data is malformed.", { channel, expectedFrames });
    }
  }
}

export async function exportMp4(options: Mp4ExportOptions): Promise<Mp4ExportResult> {
`,
  );
  await replaceOnce(
    "src/lib/exportStudio.ts",
    `  const includePresenterAudio = resolvePresenterAudioEnabled(options.includePresenterAudio);
  const framePlan = buildExportFramePlan(settings);
  const frameCount = framePlan.length;
  const encodedDuration = frameCount / settings.fps;
  const encoderConfigs: {`,
    `  const includePresenterAudio = resolvePresenterAudioEnabled(options.includePresenterAudio);
  const framePlan = buildExportFramePlan(settings);
  const frameCount = framePlan.length;
  const encodedDuration = frameCount / settings.fps;
  const soundtrack = options.soundtrack ?? null;
  const soundtrackGainWhenMixed = options.soundtrackGainWhenMixed ?? 0.5;
  if (soundtrack) validateSoundtrackBuffer(soundtrack, encodedDuration, soundtrackGainWhenMixed);
  let hasPresenterAudio = false;
  let hasOutputAudio = soundtrack !== null;
  const encoderConfigs: {`,
  );
  await replaceOnce(
    "src/lib/exportStudio.ts",
    `    assertPresenterAudioFpsSupported(settings.fps, presenter?.audioTrack != null);
    throwIfAborted(options.signal);

    if (presenter?.audioTrack) {
      // Native WebCodecs AAC does not expose priming delay and can shift real
      // audio while inflating the MP4 duration. The bundled open-source FFmpeg
      // encoder is selected deliberately so this path is testable and stable.
      await ensureSoftwareAacEncoder();`,
    `    hasPresenterAudio = presenter?.audioTrack != null;
    hasOutputAudio = hasPresenterAudio || soundtrack !== null;
    assertPresenterAudioFpsSupported(settings.fps, hasOutputAudio);
    throwIfAborted(options.signal);

    if (hasOutputAudio) {
      // Native WebCodecs AAC does not expose priming delay and can shift real
      // audio while inflating the MP4 duration. The bundled open-source FFmpeg
      // encoder is selected deliberately so this path is testable and stable.
      await ensureSoftwareAacEncoder();`,
  );
  await replaceOnce(
    "src/lib/exportStudio.ts",
    `          "Presenter contains audio, but this browser cannot encode AAC. Audio will not be dropped silently.",`,
    `          "This composition contains audio, but this browser cannot encode AAC. Sound will not be dropped silently.",`,
  );
  await replaceOnce(
    "src/lib/exportStudio.ts",
    `    let audioSource: AudioSampleSource | null = null;
    if (presenter?.audioTrack) {`,
    `    let audioSource: AudioSampleSource | null = null;
    if (hasOutputAudio) {`,
  );
  await replaceOnce(
    "src/lib/exportStudio.ts",
    `      output.addAudioTrack(audioSource, { name: "Presenter audio" });
    }`,
    `      const audioTrackName = hasPresenterAudio
        ? soundtrack ? "Presenter + sound design" : "Presenter audio"
        : "Sound design";
      output.addAudioTrack(audioSource, { name: audioTrackName });
    }`,
  );
  await replaceOnce(
    "src/lib/exportStudio.ts",
    `      progressEnd: presenter?.audioTrack ? 0.78 : 0.94,`,
    `      progressEnd: hasOutputAudio ? 0.78 : 0.94,`,
  );
  await replaceOnce(
    "src/lib/exportStudio.ts",
    `    if (presenter?.audioTrack && audioSource) {
      await encodePresenterAudio(
        presenter,
        audioSource,
        encodedDuration,
        options.signal,
        options.onProgress,
      );
      audioSource.close();
    }

    assertEncoderConfigurations(encoderConfigs, settings, presenter?.audioTrack != null);`,
    `    if (audioSource) {
      if (hasPresenterAudio && presenter) {
        await encodePresenterAudio(
          presenter,
          audioSource,
          encodedDuration,
          soundtrack,
          soundtrackGainWhenMixed,
          options.signal,
          options.onProgress,
        );
      } else if (soundtrack) {
        await encodeSoundtrackAudio(
          soundtrack,
          audioSource,
          encodedDuration,
          options.signal,
          options.onProgress,
        );
      }
      audioSource.close();
    }

    assertEncoderConfigurations(encoderConfigs, settings, hasOutputAudio);`,
  );
  await replaceOnce(
    "src/lib/exportStudio.ts",
    `      presenter?.audioTrack !== null && presenter?.audioTrack !== undefined,
      options.signal,`,
    `      hasOutputAudio,
      options.signal,`,
  );
  await replaceOnce(
    "src/lib/exportStudio.ts",
    `      audio: presenter?.audioTrack
        ? {
          codec: "aac",
          bitrate: AAC_BITRATE,
          sampleRate: AUDIO_SAMPLE_RATE,
          channels: AUDIO_CHANNELS,
          duration: verification.audio!.duration,
        }
        : null,`,
    `      audio: hasOutputAudio
        ? {
          codec: "aac",
          bitrate: AAC_BITRATE,
          sampleRate: AUDIO_SAMPLE_RATE,
          channels: AUDIO_CHANNELS,
          duration: verification.audio!.duration,
          source: hasPresenterAudio ? soundtrack ? "mixed" : "presenter" : "sound-design",
        }
        : null,`,
  );

  await replaceBetween(
    "src/lib/exportStudio.ts",
    "async function encodePresenterAudio(\n",
    "async function canvasToPngBlob(\n",
    `async function encodePresenterAudio(
  presenter: PreparedPresenter,
  source: AudioSampleSource,
  duration: number,
  soundtrack: AudioBuffer | null,
  soundtrackGain: number,
  signal?: AbortSignal,
  onProgress?: ExportProgressHandler,
): Promise<number> {
  const track = presenter.audioTrack;
  if (!track) return 0;
  const sink = new AudioSampleSink(track);
  const rangeStart = presenter.timelineStart;
  const rangeEnd = rangeStart + duration;
  let encodedSamples = 0;
  let lastEnd = 0;

  try {
    for await (const decoded of sink.samples(rangeStart, rangeEnd)) {
      throwIfAborted(signal);
      let trimmedSample: AudioSample = decoded;
      let mixedSample: AudioSample | null = null;
      try {
        const trim = getAudioTrimWindow(
          decoded.timestamp,
          decoded.numberOfFrames,
          decoded.sampleRate,
          rangeStart,
          rangeEnd,
        );
        if (!trim) continue;
        if (trim.startFrame !== 0 || trim.endFrame !== decoded.numberOfFrames) {
          trimmedSample = decoded.trim(trim.startFrame, trim.endFrame);
        }
        trimmedSample.setTimestamp(trim.outputTimestamp);

        let outputSample = trimmedSample;
        if (soundtrack) {
          const planes = Array.from(
            { length: trimmedSample.numberOfChannels },
            () => new Float32Array(trimmedSample.numberOfFrames),
          );
          for (let channel = 0; channel < planes.length; channel += 1) {
            trimmedSample.copyTo(planes[channel]!, { planeIndex: channel, format: "f32-planar" });
          }
          mixSoundtrackIntoPlanar(
            planes,
            trimmedSample.timestamp,
            trimmedSample.sampleRate,
            soundtrack,
            soundtrackGain,
          );
          mixedSample = new AudioSample({
            format: "f32-planar",
            data: planes,
            numberOfChannels: trimmedSample.numberOfChannels,
            sampleRate: trimmedSample.sampleRate,
            timestamp: trimmedSample.timestamp,
          });
          outputSample = mixedSample;
        }

        await source.add(outputSample);
        encodedSamples += outputSample.numberOfFrames;
        lastEnd = Math.max(lastEnd, outputSample.timestamp + outputSample.duration);
        report(
          onProgress,
          "audio",
          Math.min(lastEnd, duration),
          duration,
          0.78 + 0.17 * Math.min(lastEnd / duration, 1),
        );
      } finally {
        mixedSample?.close();
        if (trimmedSample !== decoded) trimmedSample.close();
        decoded.close();
      }
    }
  } catch (error) {
    if (signal?.aborted) throw cancelledError(signal);
    throw wrapError(
      error,
      "PRESENTER_DECODE_FAILED",
      "Presenter audio and tactile sound could not be mixed and encoded without loss.",
    );
  }

  if (encodedSamples === 0) {
    throw new ExportStudioError(
      "PRESENTER_DECODE_FAILED",
      "Presenter declares an audio track, but no audio samples were available for this export.",
    );
  }

  return Math.min(lastEnd, duration);
}

async function encodeSoundtrackAudio(
  soundtrack: AudioBuffer,
  source: AudioSampleSource,
  duration: number,
  signal?: AbortSignal,
  onProgress?: ExportProgressHandler,
): Promise<number> {
  throwIfAborted(signal);
  const sample = AudioSample.fromAudioBuffer(soundtrack, 0);
  try {
    await source.add(sample);
    report(onProgress, "audio", duration, duration, 0.95);
    return duration;
  } catch (error) {
    if (signal?.aborted) throw cancelledError(signal);
    throw wrapError(error, "ENCODE_FAILED", "Tactile sound track could not be encoded without loss.");
  } finally {
    sample.close();
  }
}

`,
  );
}

async function patchApp() {
  await replaceOnce(
    "src/App.tsx",
    `import { CinematicCarousel } from "./engine/CinematicCarousel";`,
    `import { CinematicCarousel, type CarouselSonicEvent } from "./engine/CinematicCarousel";
import { SonicEngine, type SonicRuntimeState } from "./sonic/SonicEngine";`,
  );
  await replaceOnce(
    "src/App.tsx",
    `  const engineRef = useRef<CinematicCarousel | null>(null);
  const importInputRef`,
    `  const engineRef = useRef<CinematicCarousel | null>(null);
  const sonicRef = useRef<SonicEngine | null>(null);
  const importInputRef`,
  );
  await replaceOnce(
    "src/App.tsx",
    `  const [mp4Supported, setMp4Supported] = useState<boolean | null>(null);
`,
    `  const [mp4Supported, setMp4Supported] = useState<boolean | null>(null);
  const [sonicState, setSonicState] = useState<SonicRuntimeState>("idle");
`,
  );
  await replaceOnce(
    "src/App.tsx",
    `    setNotice(message);
    setNoticeKind(kind);
    noticeTimerRef.current`,
    `    setNotice(message);
    setNoticeKind(kind);
    if (kind === "good") sonicRef.current?.play("success", { intensity: 0.55 });
    else if (kind === "error") sonicRef.current?.play("failure", { intensity: 0.62 });
    noticeTimerRef.current`,
  );
  await replaceOnce(
    "src/App.tsx",
    `      : progress.phase === "audio"
        ? "audio"`,
    `      : progress.phase === "audio"
        ? "audio"`,
  );
  await replaceOnce(
    "src/App.tsx",
    `    audio: "Aligning presenter audio",`,
    `    audio: "Mixing and verifying audio",`,
  );
  await replaceOnce(
    "src/App.tsx",
    `  useEffect(() => {
    const canvas = canvasRef.current;`,
    `  useEffect(() => {
    const sonic = new SonicEngine(
      settingsRef.current.sound,
      setSonicState,
      (message) => announce(message, "error"),
    );
    sonicRef.current = sonic;
    let armed = false;
    const arm = () => {
      if (armed) return;
      armed = true;
      void sonic.unlock();
      window.removeEventListener("pointerdown", arm, true);
      window.removeEventListener("keydown", arm, true);
    };
    const onVisibility = () => void sonic.suspendForVisibility(document.hidden);
    window.addEventListener("pointerdown", arm, true);
    window.addEventListener("keydown", arm, true);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointerdown", arm, true);
      window.removeEventListener("keydown", arm, true);
      document.removeEventListener("visibilitychange", onVisibility);
      sonic.dispose();
      if (sonicRef.current === sonic) sonicRef.current = null;
    };
  }, [announce]);

  useEffect(() => {
    sonicRef.current?.setSettings(settings.sound);
  }, [settings.sound]);

  useEffect(() => {
    const canvas = canvasRef.current;`,
  );
  await replaceOnce(
    "src/App.tsx",
    `        onContextState: setContextState,
        onFrame: setFps,
      });`,
    `        onContextState: setContextState,
        onFrame: setFps,
        onSonicEvent: (event: CarouselSonicEvent) => {
          sonicRef.current?.play(event.type, { intensity: event.intensity, pan: event.pan });
        },
      });`,
  );
  await replaceOnce(
    "src/App.tsx",
    `        const isPaused = engineRef.current?.togglePaused() ?? paused;
        setPaused(isPaused);`,
    `        const isPaused = engineRef.current?.togglePaused() ?? paused;
        setPaused(isPaused);
        sonicRef.current?.play("control", { intensity: 0.32 });`,
  );
  await replaceOnce(
    "src/App.tsx",
    `      } else if (event.key.toLowerCase() === "f") {
        setFocusMode((value) => !value);`,
    `      } else if (event.key.toLowerCase() === "f") {
        setFocusMode((value) => !value);
        sonicRef.current?.play("control", { intensity: 0.28 });`,
  );
  await replaceOnce(
    "src/App.tsx",
    `    abortRef.current = controller;
    setExportProgress`,
    `    abortRef.current = controller;
    sonicRef.current?.setSuppressed(true);
    setExportProgress`,
  );
  await replaceOnce(
    "src/App.tsx",
    `    surface.restore();
    abortRef.current = null;`,
    `    surface.restore();
    sonicRef.current?.setSuppressed(false);
    abortRef.current = null;`,
  );
  await replaceOnce(
    "src/App.tsx",
    `      const { createFileSystemMp4Target, exportMp4 } = await import("./lib/exportStudio");
      const target = fileHandle ? await createFileSystemMp4Target(fileHandle, session.controller.signal) : undefined;
      const result = await exportMp4({`,
    `      const [
        { createFileSystemMp4Target, exportMp4, getExportFrameCount },
        { renderSonicSoundtrack },
      ] = await Promise.all([
        import("./lib/exportStudio"),
        import("./sonic/renderSoundtrack"),
      ]);
      const encodedDuration = getExportFrameCount({
        width: session.output.width,
        height: session.output.height,
        fps: session.output.fps,
        duration: session.output.duration,
      }) / session.output.fps;
      const exportProjectSettings: StudioSettings = {
        ...settingsRef.current,
        output: { ...settingsRef.current.output, duration: encodedDuration },
      };
      const soundtrack = await renderSonicSoundtrack(
        exportProjectSettings,
        assetsRef.current.length,
        encodedDuration,
        session.controller.signal,
      );
      const target = fileHandle ? await createFileSystemMp4Target(fileHandle, session.controller.signal) : undefined;
      const result = await exportMp4({`,
  );
  await replaceOnce(
    "src/App.tsx",
    `        includePresenterAudio: !settingsRef.current.presenter.muted,
        signal: session.controller.signal,`,
    `        includePresenterAudio: !settingsRef.current.presenter.muted,
        soundtrack: soundtrack ?? undefined,
        soundtrackGainWhenMixed: settingsRef.current.sound.duckUnderPresenter,
        signal: session.controller.signal,`,
  );
  await replaceOnce(
    "src/App.tsx",
    `      announce(\`${"${result.width}