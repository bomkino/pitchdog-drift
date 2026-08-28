"use strict";

const MAX_PROJECT_BYTES = 512 * 1024 * 1024;
const PROJECT_MIME = "application/vnd.pitchdog.pitched+zip";

class LinuxDocumentAuthorityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "LinuxDocumentAuthorityError";
    this.code = code;
  }
}

module.exports = Object.freeze({
  LinuxDocumentAuthorityError,
  MAX_PROJECT_BYTES,
  PROJECT_MIME,
});
