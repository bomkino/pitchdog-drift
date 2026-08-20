const soundIds = [
  100413, // cloth movement
  555307, // jacket movement
  481856, // vintage coat movement
  669671, // light cloth/body fall
  352914, // paper slide
  730078, // gentle paper slide
  382651, // newspaper page turn
  164421, // paper movement
  458569, // genuine 35mm projector
  843786, // raw mouse and spacebar clicks
  858919, // recorded object button click
  431818, // car button wheel clicks
];

function decodeEntities(value) {
  return value
    .replaceAll("\\/", "/")
    .replaceAll("&amp;", "&")
    .replaceAll("&#x2F;", "/")
    .replaceAll("&#47;", "/")
    .replaceAll("&quot;", '"');
}

for (const soundId of soundIds) {
  const url = `https://freesound.org/s/${soundId}/`;
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": "pitch.dog Drift sonic provenance audit/1.0",
      accept: "text/html,application/xhtml+xml",
    },
  });
  const raw = await response.text();
  const html = decodeEntities(raw);
  const previewCandidates = [...new Set([
    ...[...html.matchAll(/https?:\/\/[^\s"'<>]+/g)].map((match) => match[0]),
    ...[...html.matchAll(/(?:preview|previews|audio)[^"']*["']([^"']+)["']/gi)].map((match) => match[1]),
  ].filter((candidate) => /(?:cdn\.freesound\.org|freesound\.org\/data\/previews).*\.(?:ogg|mp3|wav)(?:\?|$)/i.test(candidate)))];

  const markers = {};
  for (const needle of ["preview-hq-ogg", "preview-lq-ogg", "preview-hq-mp3", "preview-lq-mp3", "cdn.freesound.org", "/data/previews/"]) {
    const index = html.toLowerCase().indexOf(needle.toLowerCase());
    if (index >= 0) markers[needle] = html.slice(Math.max(0, index - 180), index + 520).replace(/\s+/g, " ");
  }

  console.log(JSON.stringify({
    soundId,
    status: response.status,
    finalUrl: response.url,
    bytes: raw.length,
    previewCandidates,
    markers,
  }));
}
