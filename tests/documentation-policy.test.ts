import { describe, expect, it } from "vitest";
import { documentationGaps, documentationViolations, legacyDocumentationPaths } from "../src/documentation-policy.js";

describe("documentation policy", () => {
  it("reports missing required surfaces", () => {
    expect(documentationGaps(["AGENTS.md"])).toContain("CONTEXT.md");
  });

  it("reports legacy root wiki surfaces", () => {
    expect(legacyDocumentationPaths(["llm-wiki-harness/docs/page.md", "docs/llm-wiki-harness/wiki"])).toEqual(["llm-wiki-harness"]);
    expect(legacyDocumentationPaths(["old-wiki/page.md", "wiki/index.md"])).toEqual(["old-wiki", "wiki"]);
    expect(legacyDocumentationPaths(["docs/old-wiki/page.md", "docs/llm-wiki-harness/wiki/index.md"])).toEqual(["docs/old-wiki"]);
    expect(legacyDocumentationPaths(["archive/page.md"])).toEqual(["archive"]);
    expect(legacyDocumentationPaths(["docs/retired", "docs/retired/page.md"])).toEqual(["docs/retired"]);
    expect(legacyDocumentationPaths(["docs/retired/nested/page.md"])).toEqual(["docs/retired"]);
  });

  it("reports missing required links", () => {
    expect(documentationViolations({ paths: ["AGENTS.md", "CONTEXT.md", "docs/agents/README.md"], contents: { "AGENTS.md": "# rules" } })).toContain("missing documentation link: AGENTS.md -> docs/agents/README.md");
    expect(documentationViolations({ paths: ["AGENTS.md", "CONTEXT.md", "docs/agents/README.md"], contents: { "AGENTS.md": "" } })).toContain("missing documentation link: AGENTS.md -> CONTEXT.md");
  });

  it("reports misplaced decision files", () => {
    expect(documentationViolations({ paths: ["AGENTS.md", "CONTEXT.md", "docs/agents", "docs/adr", "docs/llm-wiki-harness/wiki/index.md", "docs/llm-wiki-harness/wiki/log.md", "architecture.md"] })).toContain("decision-bearing file in unsupported location: architecture.md");
    expect(documentationViolations({ paths: ["AGENTS.md", "CONTEXT.md", "docs/agents", "docs/adr", "docs/llm-wiki-harness/wiki/index.md", "docs/llm-wiki-harness/wiki/log.md", "docs/notes.md"], contents: { "docs/notes.md": "# Decision record" } })).toContain("decision-bearing file in unsupported location: docs/notes.md");
    expect(documentationViolations({ paths: ["AGENTS.md", "CONTEXT.md", "docs/agents", "docs/adr", "docs/llm-wiki-harness/wiki/index.md", "docs/llm-wiki-harness/wiki/log.md", "notes.md"], contents: { "notes.md": "# Project Decision Log" } })).toContain("decision-bearing file in unsupported location: notes.md");
    expect(documentationViolations({ paths: ["AGENTS.md", "CONTEXT.md", "docs/agents", "docs/adr", "docs/llm-wiki-harness/wiki/index.md", "docs/llm-wiki-harness/wiki/log.md", "docs/notes.md"], contents: { "docs/notes.md": "# Project notes" } })).not.toContain(expect.stringContaining("decision-bearing file"));
    expect(documentationViolations({ paths: ["AGENTS.md", "CONTEXT.md", "docs/notes.md"] })).not.toContain(expect.stringContaining("legacy surface"));
  });

  it("reports duplicate policy content and allows explicit exceptions", () => {
    const contents = { "docs/agents/a-policy.md": "policy ".repeat(30), "docs/agents/b-policy.md": "policy ".repeat(30) };
    const input = { paths: Object.keys(contents), contents };
    expect(documentationViolations(input)).toContain("duplicate documentation surfaces: docs/agents/a-policy.md, docs/agents/b-policy.md");
    expect(documentationViolations({ ...input, duplicateAllowlist: new Set(["docs/agents/a-policy.md|docs/agents/b-policy.md"]) })).not.toContain(expect.stringContaining("duplicate documentation surfaces"));
    const section = "This policy section explains how agents must keep decisions in one authoritative documentation surface and link related material instead of copying policy text across files.";
    expect(documentationViolations({ paths: ["docs/agents/a.md", "docs/agents/b.md"], contents: { "docs/agents/a.md": section, "docs/agents/b.md": `# Other\n\n${section}` } })).toContain("duplicate documentation section: docs/agents/a.md, docs/agents/b.md");
    expect(documentationViolations({ paths: ["docs/agents/a.md", "docs/agents/b.md"], contents: { "docs/agents/a.md": section, "docs/agents/b.md": `# Other\n\n${section}` }, duplicateAllowlist: new Set(["docs/agents/a.md|docs/agents/b.md"]) })).not.toContain(expect.stringContaining("duplicate documentation section"));
  });

  it("accepts valid documentation layout and links", () => {
    const paths = ["AGENTS.md", "README.md", "CONTEXT.md", "docs/agents", "docs/agents/README.md", ...["architecture", "project-configuration", "infrastructure", "session-lifecycle", "issue-tracker", "triage-labels", "domain", "tooling", "agent-roles", "documentation-strategy", "contributing", "data-safety"].map((name) => `docs/agents/${name}.md`), "docs/adr", "docs/llm-wiki-harness/wiki/index.md", "docs/llm-wiki-harness/wiki/log.md"];
    const contents = { "AGENTS.md": "[CONTEXT](CONTEXT.md) [docs](docs/agents/README.md)", "README.md": "[rules](AGENTS.md) [context](CONTEXT.md) [docs](docs/agents/)", "docs/agents/README.md": paths.slice(4).map((path) => `[x](${path.split("/").pop()})`).join(" ") };
    expect(documentationViolations({ paths, contents })).toEqual([]);
  });

  it("accepts standard public repository policy files at the root", () => {
    const paths = ["AGENTS.md", "README.md", "CONTEXT.md", "CONTRIBUTING.md", "SECURITY.md", "docs/agents", "docs/agents/README.md", "docs/adr", "docs/llm-wiki-harness/wiki/index.md", "docs/llm-wiki-harness/wiki/log.md"];
    expect(documentationViolations({ paths })).not.toContain(expect.stringContaining("CONTRIBUTING.md"));
    expect(documentationViolations({ paths })).not.toContain(expect.stringContaining("SECURITY.md"));
  });

  it("reports broken local wiki links and ignores external links and anchors", () => {
    const paths = ["AGENTS.md", "CONTEXT.md", "docs/agents", "docs/adr", "docs/llm-wiki-harness/wiki/index.md", "docs/llm-wiki-harness/wiki/log.md"];
    const contents = {
      "docs/llm-wiki-harness/wiki/index.md": "[log](log.md#history) [external](https://example.com) [anchor](#top)",
    };
    expect(documentationViolations({ paths, contents })).not.toContain(expect.stringContaining("broken documentation link"));
    expect(documentationViolations({ paths, contents: { ...contents, "docs/llm-wiki-harness/wiki/log.md": "[missing](missing.md)" } })).toContain(
      "broken documentation link: docs/llm-wiki-harness/wiki/log.md -> docs/llm-wiki-harness/wiki/missing.md",
    );
  });

  it("reports orphan wiki pages and supports explicit allowlisting", () => {
    const paths = ["AGENTS.md", "CONTEXT.md", "docs/agents", "docs/adr", "docs/llm-wiki-harness/wiki/index.md", "docs/llm-wiki-harness/wiki/log.md", "docs/llm-wiki-harness/wiki/standalone.md"];
    const contents = { "docs/llm-wiki-harness/wiki/index.md": "[[log]]" };
    expect(documentationViolations({ paths, contents })).toContain("orphan wiki page: docs/llm-wiki-harness/wiki/standalone.md");
    expect(documentationViolations({ paths, contents, wikiOrphanAllowlist: new Set(["docs/llm-wiki-harness/wiki/standalone.md"]) })).not.toContain(
      "orphan wiki page: docs/llm-wiki-harness/wiki/standalone.md",
    );
  });
});
