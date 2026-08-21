/**
 * Parses JSON while rejecting duplicate object keys.
 *
 * JSON.parse accepts duplicate names and silently keeps the last value, which
 * is unsafe for provenance and treatment ledgers. This lightweight structural
 * pass validates the complete JSON grammar and checks key uniqueness at every
 * object depth before delegating value construction to the native parser.
 */
export function parseJsonStrict(source, label = "JSON") {
  if (typeof source !== "string") {
    throw new TypeError(`${label} source must be text.`);
  }

  let cursor = 0;
  const fail = (message) => {
    throw new SyntaxError(`${label}: ${message} at byte ${cursor}.`);
  };
  const skipWhitespace = () => {
    while (/\s/.test(source[cursor] ?? "")) cursor += 1;
  };

  const parseString = () => {
    if (source[cursor] !== '"') fail("expected a string");
    const start = cursor;
    cursor += 1;
    while (cursor < source.length) {
      const character = source[cursor];
      if (character === '"') {
        cursor += 1;
        try {
          return JSON.parse(source.slice(start, cursor));
        } catch {
          fail("invalid string escape");
        }
      }
      if (character === "\\") {
        cursor += 2;
        continue;
      }
      if ((character?.charCodeAt(0) ?? 0) < 0x20) {
        fail("unescaped control character in string");
      }
      cursor += 1;
    }
    fail("unterminated string");
  };

  const parsePrimitive = () => {
    const start = cursor;
    while (
      cursor < source.length
      && !/[\s,}\]]/.test(source[cursor] ?? "")
    ) cursor += 1;
    if (cursor === start) fail("expected a value");
    try {
      JSON.parse(source.slice(start, cursor));
    } catch {
      fail("invalid primitive value");
    }
  };

  const parseValue = () => {
    skipWhitespace();
    const character = source[cursor];
    if (character === "{") {
      parseObject();
      return;
    }
    if (character === "[") {
      parseArray();
      return;
    }
    if (character === '"') {
      parseString();
      return;
    }
    parsePrimitive();
  };

  const parseArray = () => {
    cursor += 1;
    skipWhitespace();
    if (source[cursor] === "]") {
      cursor += 1;
      return;
    }
    while (cursor < source.length) {
      parseValue();
      skipWhitespace();
      if (source[cursor] === "]") {
        cursor += 1;
        return;
      }
      if (source[cursor] !== ",") fail("expected ',' or ']' in array");
      cursor += 1;
      skipWhitespace();
      if (source[cursor] === "]") fail("trailing comma in array");
    }
    fail("unterminated array");
  };

  const parseObject = () => {
    cursor += 1;
    skipWhitespace();
    const keys = new Set();
    if (source[cursor] === "}") {
      cursor += 1;
      return;
    }
    while (cursor < source.length) {
      const key = parseString();
      if (keys.has(key)) fail(`duplicate object key ${JSON.stringify(key)}`);
      keys.add(key);
      skipWhitespace();
      if (source[cursor] !== ":") fail("expected ':' after object key");
      cursor += 1;
      parseValue();
      skipWhitespace();
      if (source[cursor] === "}") {
        cursor += 1;
        return;
      }
      if (source[cursor] !== ",") fail("expected ',' or '}' in object");
      cursor += 1;
      skipWhitespace();
      if (source[cursor] === "}") fail("trailing comma in object");
    }
    fail("unterminated object");
  };

  parseValue();
  skipWhitespace();
  if (cursor !== source.length) fail("unexpected trailing content");
  return JSON.parse(source);
}
