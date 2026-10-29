import { describe, expect, it } from "vitest";
import { wikiIntegrityViolations } from "../src/wiki-integrity.js";

const root = "docs/llm-wiki-harness/wiki";
const concept = (resource = "../../raw/source.md") => `---\ntype: Concept\nsources:\n  - id: paper\n    resource: ${resource}\n---\n# Scoped inputs\n\nClaim.[^paper]\n\n[^paper]: Source.\n`;
function check(contents: Record<string, string>, newPaths: string[] = []) {
  return wikiIntegrityViolations({ paths: new Set(Object.keys(contents)), contents, wikiRoot: root, newPaths });
}

describe("wiki integrity", () => {
  it("preserves legacy pages while requiring topic placement for new concepts", () => {
    const legacy = `${root}/legacy.md`, fresh = `${root}/fresh.md`;
    const contents = { [legacy]: "# Existing flat page", [fresh]: concept("https://example.com/paper") };
    expect(check(contents, [fresh])).toEqual([`new wiki concept needs a topic directory: ${fresh}`]);
    expect(check({ [legacy]: contents[legacy] })).toEqual([]);
  });

  it("requires a topic index entry and accepts an indexed concept with local provenance", () => {
    const name = `${root}/context/scoped-inputs.md`;
    const contents = { [name]: concept(), "docs/llm-wiki-harness/raw/source.md": "# Source" };
    expect(check(contents, [name])).toContain(`new wiki concept needs its topic index entry: ${name}`);
    expect(check({ ...contents, [`${root}/index.md`]: "# Topics\n\n[Context](./context/index.md)", [`${root}/context/index.md`]: "# Context\n\n[Inputs](scoped-inputs.md)" }, [name])).toEqual([]);
  });

  it("checks YAML provenance, keyed footnotes, and malformed metadata without echoing it", () => {
    const name = `${root}/context/page.md`;
    expect(check({ [name]: concept("../../raw/missing.md") })).toContain(`missing wiki reference: ${name} -> docs/llm-wiki-harness/raw/missing.md`);
    expect(check({ [name]: concept("https://example.com").replace("[^paper]: Source.", "") })).toContain(`undefined footnote: ${name} [paper]`);
    expect(check({ [name]: "---\nsources: [\n---\n# Broken" })).toEqual([`invalid wiki YAML: ${name}`]);
    expect(check({ [name]: concept("https://example.com").replace("id: paper", "id: uncited") })).toContain(`missing source footnote: ${name} [uncited]`);
  });

  it("validates local, encoded, duplicate, and explicit heading anchors, excluding fenced examples", () => {
    const page = `${root}/topic/page.md`, target = `${root}/topic/with space.md`;
    const contents = { [target]: '# Repeat\n\n# Repeat\n\n<a id="custom"></a>\n\n```md\n# Fake\n```', [page]: "[One](with%20space.md#repeat) [Two](with%20space.md#repeat-1) [Custom](with%20space.md#custom)" };
    expect(check(contents)).toEqual([]);
    expect(check({ ...contents, [page]: "[Bad](with%20space.md#fake)" })).toEqual([`missing heading anchor: ${page} -> ${target}#fake`]);
    expect(check({ [page]: "# Local\n\n[Self](#missing)" })).toEqual([`missing heading anchor: ${page} -> ${page}#missing`]);
  });

  it("keeps moved-page pointers valid and rejects references outside the repository", () => {
    const pointer = `${root}/moved.md`, target = `${root}/topic/new.md`;
    expect(check({ [pointer]: "# Old: moved\n\n[Canonical](topic/new.md)", [target]: "# New" }, [pointer])).toEqual([]);
    expect(check({ [target]: concept("../../../../../outside.md") })).toContain(`reference escapes repository: ${target}`);
  });
});
