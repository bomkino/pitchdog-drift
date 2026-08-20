const sounds = [
  { id: 742832, user: "Sadiquecat" },
  { id: 802463, user: "Sadiquecat" },
  { id: 320144, user: "OwlStorm" },
  { id: 476017, user: "Rvgerxini" },
];

for (const sound of sounds) {
  const url = `https://freesound.org/people/${sound.user}/sounds/${sound.id}/`;
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "pitch.dog Drift sonic provenance probe" },
  });
  const html = await response.text();
  console.log(`\n=== ${sound.id} ${response.status} ${html.length} bytes ${response.url} ===`);

  const normalized = html
    .replaceAll("\\/", "/")
    .replaceAll("\\u002F", "/")
    .replaceAll("&amp;", "&");
  const urls = [...new Set(
    [...normalized.matchAll(/https?:\/\/[^\s"'<>]+/g)]
      .map((match) => match[0])
      .filter((candidate) => /(?:freesound|sndcdn|cdn).*\.(?:ogg|mp3|wav)(?:\?|$)/i.test(candidate)),
  )];
  console.log("audio urls", urls);

  for (const needle of ["preview-hq", "previews", "cdn.freesound", ".ogg", ".mp3", "sound_url", "waveform"]) {
    const index = normalized.toLowerCase().indexOf(needle.toLowerCase());
    if (index >= 0) console.log(`around ${needle}:`, normalized.slice(Math.max(0, index - 300), index + 900));
  }
}

throw new Error("Intentional provenance probe stop.");
