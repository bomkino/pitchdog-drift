const REQUIRED_SANDBOX_MODE = 0o4755;

function octalMode(mode) {
  return `0${(mode & 0o7777).toString(8).padStart(4, "0")}`;
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'"'"'`)}'`;
}

export function assertLinuxSandboxMetadata(metadata) {
  const mode = metadata.mode & 0o7777;
  if (metadata.uid !== 0 || metadata.gid !== 0 || mode !== REQUIRED_SANDBOX_MODE) {
    throw new Error(
      "Electron chrome-sandbox must be owned by UID 0 and GID 0 with exact mode 04755 "
      + `(observed uid=${String(metadata.uid)}, gid=${String(metadata.gid)}, mode=${octalMode(mode)}).`,
    );
  }
  return Object.freeze({ uid: 0, gid: 0, mode: REQUIRED_SANDBOX_MODE });
}

export function linuxSandboxSetupInstructions(artifact, sandboxPath) {
  const quotedSandbox = shellQuote(sandboxPath);
  const quotedArtifact = shellQuote(artifact);
  return [
    "Finish the sandbox setup from a trusted administrator account, then verify as the desktop user:",
    `sudo chown root:root -- ${quotedSandbox}`,
    `sudo chmod 4755 -- ${quotedSandbox}`,
    `DRIFT_LINUX_TRACER_DIR=${quotedArtifact} npm run verify:linux:tracer`,
  ].join("\n");
}
