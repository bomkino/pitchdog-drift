import { describe, expect, it } from "vitest";
import { parseJsonStrict } from "../scripts/strict-json.mjs";

describe("strict JSON ledger parser", () => {
  it("parses nested valid JSON without changing its values", () => {
    expect(parseJsonStrict('{"a":1,"nested":{"b":[true,null,"x"]}}')).toEqual({
      a: 1,
      nested: { b: [true, null, "x"] },
    });
  });

  it("rejects duplicate keys at any object depth", () => {
    expect(() => parseJsonStrict('{"a":1,"a":2}', "ledger")).toThrow(
      /duplicate object key "a"/,
    );
    expect(() => parseJsonStrict(
      '{"outer":{"trimStart":0.1,"trimStart":0.2}}',
      "ledger",
    )).toThrow(/duplicate object key "trimStart"/);
  });

  it("rejects malformed JSON rather than repairing it", () => {
    expect(() => parseJsonStrict('{"a":1,}')).toThrow(SyntaxError);
    expect(() => parseJsonStrict('[1,,2]')).toThrow(SyntaxError);
    expect(() => parseJsonStrict('{"a":"unterminated}')).toThrow(SyntaxError);
  });
});
