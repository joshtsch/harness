import { posix } from "node:path";

export const requiredDocumentationPaths = [
  "AGENTS.md",
  "README.md",
  "CONTEXT.md",
  "docs/agents",
  "docs/agents/README.md",
  "docs/adr",
  "docs/llm-wiki-harness/wiki/index.md",
  "docs/llm-wiki-harness/wiki/log.md",
] as const;

export const forbiddenDocumentationPaths = [
  "llm-wiki-harness",
  "llm-wiki-harness/docs",
  "docs/wiki",
  "docs/raw",
  "docs/.temp",
  "docs/templates",
] as const;

export const requiredDocumentationLinks: Record<string, readonly string[]> = {
  "AGENTS.md": ["CONTEXT.md", "docs/agents/README.md"],
  "README.md": ["AGENTS.md", "CONTEXT.md", "docs/agents/"],
  "docs/agents/README.md": [
    "architecture.md",
    "project-configuration.md",
    "infrastructure.md",
    "session-lifecycle.md",
    "issue-tracker.md",
    "triage-labels.md",
    "domain.md",
    "tooling.md",
    "agent-roles.md",
    "documentation-strategy.md",
    "contributing.md",
    "data-safety.md",
  ],
};

const decisionFile = /(?:^|\/)(?:adr|decision|policy|architecture|strategy|rfc)[^/]*\.md$/i;
const decisionHeading = /^#{1,6}\s*.*\b(?:adr|decision|policy|architecture|strategy|rfc)\b/im;
const allowedRootMarkdown = new Set(["AGENTS.md", "CONTEXT.md", "README.md", "CONTRIBUTING.md", "SECURITY.md"]);

export interface DocumentationPolicyInput {
  paths: Iterable<string>;
  contents?: Readonly<Record<string, string>>;
  duplicateAllowlist?: ReadonlySet<string>;
  wikiOrphanAllowlist?: ReadonlySet<string>;
}

export function documentationGaps(existingPaths: Iterable<string>): string[] {
  const existing = new Set(existingPaths);
  return requiredDocumentationPaths.filter((path) => !existing.has(path));
}

export function legacyDocumentationPaths(existingPaths: Iterable<string>): string[] {
  const existing = [...existingPaths];
  const known = forbiddenDocumentationPaths.filter((path) => existing.some((candidate) => candidate === path || candidate.startsWith(`${path}/`)) && !forbiddenDocumentationPaths.some((parent) => parent !== path && path.startsWith(`${parent}/`)));
  const roots = new Set(existing.map((path) => path.split("/", 1)[0]));
  const rootLegacy = new Set([...roots].filter((path) => /^(?:wiki|raw|templates|\.temp|.*wiki.*|old[-_]?docs?|archive|legacy|documentation)(?:[-_].*)?$/i.test(path)));
  const nestedLegacy = new Set(existing.filter((path) => path.startsWith("docs/")).flatMap((path) => {
    const parts = path.split("/");
    return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/")).filter((candidate) => /(?:^|-)wiki(?:-|$)/i.test(candidate.split("/").at(-1) ?? "") && !candidate.startsWith("docs/llm-wiki-harness"));
  }));
  const unsupportedDocsDirectories = new Set(existing.flatMap((path) => {
    const parts = path.split("/");
    const candidate = parts.length > 1 ? `docs/${parts[1]}` : path;
    return path.startsWith("docs/") && parts.length > 2 && !parts[1].includes(".") && !["docs/agents", "docs/adr", "docs/llm-wiki-harness", "docs/.scratch"].includes(candidate) ? [candidate] : [];
  }));
  return [...new Set([...known, ...rootLegacy, ...nestedLegacy, ...unsupportedDocsDirectories])];
}

function markdownLinks(source: string): string[] {
  return [...source.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map((match) => match[1].trim());
}

function wikiLinks(source: string): string[] {
  return [...source.matchAll(/\[\[([^\]|#]+)(?:\|[^\]]+)?\]\]/g)].map((match) => match[1].trim());
}

function normalizedPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/$/, "");
}

function localLinkTarget(sourcePath: string, link: string, wikiRoot: string, isWikiLink = false): string | undefined {
  const target = link.split("#", 1)[0].trim();
  if (target === "" || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) return undefined;
  if (isWikiLink) return normalizedPath(posix.join(wikiRoot, target.endsWith(".md") ? target : `${target}.md`));
  return normalizedPath(posix.normalize(posix.join(posix.dirname(sourcePath), target)));
}

export function documentationViolations(input: DocumentationPolicyInput): string[] {
  const paths = [...input.paths].map(normalizedPath);
  const pathSet = new Set(paths);
  const wikiRoot = "docs/llm-wiki-harness/wiki";
  const wikiPages = paths.filter((path) => path.startsWith(`${wikiRoot}/`) && path.endsWith(".md"));
  const violations = [
    ...documentationGaps(paths).map((path) => `missing required surface: ${path}`),
    ...legacyDocumentationPaths(paths).map((path) => `legacy surface still exists: ${path}`),
  ];

  const reachableWikiPages = new Set<string>();
  const reportedBrokenLinks = new Set<string>();
  const pendingWikiPages = [normalizedPath(`${wikiRoot}/index.md`)];
  while (pendingWikiPages.length > 0) {
    const source = pendingWikiPages.pop()!;
    if (reachableWikiPages.has(source)) continue;
    reachableWikiPages.add(source);
    const content = input.contents?.[source] ?? "";
    for (const [link, isWikiLink] of [...markdownLinks(content).map((link) => [link, false] as const), ...wikiLinks(content).map((link) => [link, true] as const)]) {
      const target = localLinkTarget(source, link, wikiRoot, isWikiLink);
      if (target === undefined) continue;
      if (!pathSet.has(target) && target.startsWith(`${wikiRoot}/`)) {
        const violation = `broken documentation link: ${source} -> ${target}`;
        if (!reportedBrokenLinks.has(violation)) {
          reportedBrokenLinks.add(violation);
          violations.push(violation);
        }
      }
      if (target.startsWith(`${wikiRoot}/`) && pathSet.has(target)) pendingWikiPages.push(target);
    }
  }
  if (input.contents?.[normalizedPath(`${wikiRoot}/index.md`)] !== undefined) {
    for (const page of wikiPages) {
      if (!reachableWikiPages.has(page) && !input.wikiOrphanAllowlist?.has(page)) {
        violations.push(`orphan wiki page: ${page}`);
      }
    }
  }

  for (const [source, content] of Object.entries(input.contents ?? {})) {
    if (!source.startsWith(`${wikiRoot}/`) || !source.endsWith(".md")) continue;
    for (const link of markdownLinks(content)) {
      const target = localLinkTarget(source, link, wikiRoot);
      if (target !== undefined && !pathSet.has(target)) {
        const violation = `broken documentation link: ${source} -> ${target}`;
        if (!reportedBrokenLinks.has(violation)) {
          reportedBrokenLinks.add(violation);
          violations.push(violation);
        }
      }
    }
  }

  for (const path of paths.filter((candidate) => candidate.endsWith(".md"))) {
    const supported = allowedRootMarkdown.has(path) || path.startsWith("docs/agents/") || path.startsWith("docs/adr/") || path.startsWith("docs/llm-wiki-harness/wiki/");
    const content = input.contents?.[path] ?? "";
    if (!supported && (decisionFile.test(path) || decisionHeading.test(content) || !path.includes("/"))) {
      violations.push(`decision-bearing file in unsupported location: ${path}`);
    }
  }

  for (const [source, targets] of Object.entries(requiredDocumentationLinks)) {
    const content = input.contents?.[source];
    if (content === undefined) continue;
    for (const target of targets) {
      const resolved = normalizedPath(target.startsWith("docs/") || target === "CONTEXT.md" || target === "AGENTS.md" ? target : `docs/agents/${target}`);
      const linked = markdownLinks(content).some((link) => normalizedPath(link) === resolved || normalizedPath(link) === normalizedPath(target));
      if (!linked) violations.push(`missing documentation link: ${source} -> ${target}`);
      if (![...pathSet].some((path) => path === resolved || path === normalizedPath(target) || path.startsWith(`${resolved}/`) || path.startsWith(`${normalizedPath(target)}/`))) violations.push(`linked documentation surface missing: ${source} -> ${target}`);
    }
  }

  const duplicates = new Map<string, string[]>();
  for (const [path, content] of Object.entries(input.contents ?? {})) {
    if (!/\.md$/i.test(path)) continue;
    const key = content.replace(/<!--.*?-->/gs, "").replace(/\s+/g, " ").trim();
    if (key.length < 80) continue;
    duplicates.set(key, [...(duplicates.get(key) ?? []), path]);
  }
  for (const duplicatePaths of duplicates.values()) {
    if (duplicatePaths.length < 2) continue;
    const key = [...duplicatePaths].sort().join("|");
    if (!input.duplicateAllowlist?.has(key)) violations.push(`duplicate documentation surfaces: ${duplicatePaths.join(", ")}`);
  }
  const sections = new Map<string, string[]>();
  for (const [path, content] of Object.entries(input.contents ?? {})) {
    for (const section of content.split(/\n\s*\n/).map((value) => value.replace(/\s+/g, " ").trim()).filter((value) => value.length >= 120)) {
      sections.set(section, [...(sections.get(section) ?? []), path]);
    }
  }
  for (const sectionPaths of sections.values()) {
    const uniquePaths = [...new Set(sectionPaths)].sort();
    if (uniquePaths.length > 1 && !input.duplicateAllowlist?.has(uniquePaths.join("|"))) violations.push(`duplicate documentation section: ${uniquePaths.join(", ")}`);
  }
  return violations;
}
