# Native Drift threat model

Assets: original media, named `.pitched` projects, private recovery, rendered output and installation rollback. Entry points are user-selected files, native document opening and exported destinations. The native application has ordinary user-process permissions; it is not claimed to be sandbox-contained.

Archive/media parsers must reject malformed data, traversal, unsafe file kinds and mismatched identity. Original media is copied and hash-verified. Pinned native decoder libraries are shipped with exact provenance. ZIP64 data is streamed rather than buffered as a whole archive. The renderer consumes typed projects and bounded representations.

Document tickets and immutable snapshots prevent stale asynchronous work from taking authority after replace/close. Save and export stage output before publication. Cancellation and failure preserve prior accepted destinations. Private recovery never overwrites a named project. No hidden network download, account, cloud persistence or analytics is required by the runtime.

Distribution verifies exact source, tree, version/build, architecture, signature, mandatory checksums and tested bundle identity. The installer verifies before normal Quit, respects Cancel, stages on the destination volume and retains rollback. It refuses symlink targets, concurrent installation and ambiguous interrupted state. Ad-hoc signing is not Developer ID, notarization or protection against a compromised maintainer account.

Residual risks include native parser vulnerabilities, a compromised user process or build environment, filesystem races outside the application's ownership, disk/device failure and unavailable hardware observations. Hashes bind bytes to an accepted receipt; they do not establish independent trust in the publisher. Report vulnerabilities through the existing private process in `SECURITY.md`; public evidence must use synthetic material.
