const soundIds = [742832, 802463, 320144, 476017];

for (const soundId of soundIds) {
  const url = `https://freesound.org/people/x/sounds/${soundId}/`;
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "pitch.dog Drift sonic provenance probe" },
  });
  const html = await response.text();
  console.log(`\n=== ${soundId} ${response.status} ${html.length} bytes ${response.url} ===`);

  const normalized = html.replaceAll("\\/", "/").replaceAll("&amp;", "&");
  const urls = [...new Set(
    [...normalized.matchAll(/https?:\/\/[^\s"'<>]+/g)]
      .map((match) => match[0])
      .filter((candidate) => /(?:freesound|sndcdn|cdn).*\.(?:ogg|mp3|wav)(?:\?|$)/i.test(candidate)),
  )];
  console.log("audio urls", urls);

  for (const needle of ["preview-hq", "previews", "cdn.freesound", ".ogg", ".mp3", "sound_url"]) {
    const index = normalized.toLowerCase().indexOf(needle.toLowerCase());
    if (index >= 0) console.log(`around ${needle}:`, normalized.slice(Math.max(0, index - 240), index + 640));
  }
}

throw new Error("Intentional provenance probe stop.");
