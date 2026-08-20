from pathlib import Path

path = Path("scripts/sonic-export-builder.mjs")
source = path.read_text()
marker = '''  await replaceOnce(
    "src/App.tsx",
    `      announce('''
start = source.find(marker)
if start < 0:
    raise RuntimeError("Could not locate the truncated receipt patch.")

tail = r'''  await replaceOnce(
    "src/App.tsx",
    `  const togglePause = useCallback(() => {
    const next = engineRef.current?.togglePaused() ?? !paused;
    setPaused(next);
  }, [paused]);`,
    `  const togglePause = useCallback(() => {
    const next = engineRef.current?.togglePaused() ?? !paused;
    setPaused(next);
    sonicRef.current?.play("control", { intensity: 0.32 });
  }, [paused]);`,
  );
  await replaceOnce(
    "src/App.tsx",
    `  const onTheme = useCallback((id: ThemeId) => {
    setSettings((current) => applyTheme(current, getTheme(id)));
    announce`,
    `  const onTheme = useCallback((id: ThemeId) => {
    setSettings((current) => applyTheme(current, getTheme(id)));
    sonicRef.current?.play("control", { intensity: 0.38 });
    announce`,
  );
  await replaceOnce(
    "src/App.tsx",
    `  const capabilityLabel = webglError`,
    `  const directSound = useCallback((patch: Partial<StudioSettings["sound"]>) => {
    sonicRef.current?.play("control", { intensity: 0.24 });
    setSettings((current) => ({
      ...current,
      sound: { ...current.sound, ...patch },
    }));
  }, []);

  const auditionSound = useCallback(() => {
    void sonicRef.current?.audition();
  }, []);

  const capabilityLabel = webglError`,
  );
  await replaceOnce(
    "src/App.tsx",
    `          <button type="button" key={panel} onClick={() => setActivePanel(panel)} aria-pressed={activePanel === panel}>`,
    `          <button type="button" key={panel} onClick={() => {
            setActivePanel(panel);
            sonicRef.current?.play("control", { intensity: 0.24 });
          }} aria-pressed={activePanel === panel}>`,
  );
  await replaceOnce(
    "src/App.tsx",
    `          onToggleFocus={() => setFocusMode((value) => !value)}
          onDropImages={addImages}
          onCancelExport={() => abortRef.current?.abort("Canceled by user")}
          busy={interactionBusy}`,
    `          onToggleFocus={() => {
            setFocusMode((value) => !value);
            sonicRef.current?.play("control", { intensity: 0.28 });
          }}
          onDropImages={addImages}
          onCancelExport={() => abortRef.current?.abort("Canceled by user")}
          sound={settings.sound}
          sonicState={sonicState}
          onSound={directSound}
          onAuditionSound={auditionSound}
          busy={interactionBusy}`,
  );
  await replaceOnce(
    "src/App.tsx",
    `        <span>THREE.JS / RAW GLSL / FIXED-STEP OUTPUT</span>`,
    `        <span>THREE.JS / RAW GLSL / FIXED-STEP PICTURE + SOUND</span>`,
  );
}

await patchExportStudio();
await patchApp();
console.log("Application and verified AAC sound integration applied.");
'''

path.write_text(source[:start] + tail)
