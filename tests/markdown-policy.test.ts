import { describe, expect, it } from "vitest";
import { markdownViolations } from "../src/markdown-policy.js";

describe("markdown publication policy", () => {
  it("accepts ordinary headings, lists, links, and fenced code", () => {
    expect(markdownViolations("# Title\n\n- item\n\n*emphasis*\n\n[link](https://example.com)\n\n```ts\nconst value = 1;\n```\n")).toEqual([]);
  });

  it("reports malformed headings and list markers", () => {
    expect(markdownViolations("#Title\n- item\n+item\n1.item")).toEqual([
      { line: 1, message: "heading marker must be followed by a space" },
      { line: 3, message: "list marker must be followed by a space" },
      { line: 4, message: "list marker must be followed by a space" },
    ]);
  });

  it("reports unclosed fences and links outside code blocks", () => {
    expect(markdownViolations("```\n[not a link](https://example.com\n")).toEqual([
      { line: 1, message: "unclosed ``` code fence" },
    ]);
    expect(markdownViolations("[broken](https://example.com\n")).toEqual([
      { line: 1, message: "link or image is missing a closing parenthesis" },
    ]);
    expect(markdownViolations("[broken](https://example.com [valid](https://example.com)")).toEqual([
      { line: 1, message: "link or image is missing a closing parenthesis" },
    ]);
  });
});
