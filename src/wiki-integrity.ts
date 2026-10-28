import { posix } from "node:path";
import { parse } from "yaml";

function bodyOf(source: string): string {
  const body = source.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
  return body.replace(/^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[^\n]*$/gm, "");
}

function headings(source: string): Set<string> {
  const anchors = new Set<string>();
  const counts = new Map<string, number>();
  for (const match of bodyOf(source).matchAll(/^ {0,3}#{1,6}\s+(.+?)\s*#*\s*$/gm)) {
    const slug = match[1].replace(/!?\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/<[^>]*>/g, "").toLowerCase().replace(/[^\p{L}\p{N}_\s-]/gu, "").replace(/\s/g, "-");
    const count = counts.get(slug) ?? 0;
    anchors.add(count ? `${slug}-${count}` : slug);
    counts.set(slug, count + 1);
  }
  for (const match of source.matchAll(/<[^>]+\bid=["']([^"']+)["']/g)) anchors.add(match[1]);
  return anchors;
}

export function wikiIntegrityViolations(input: {
  paths: ReadonlySet<string>;
  contents: Readonly<Record<string, string>>;
  wikiRoot: string;
  newPaths?: Iterable<string>;
}): string[] {
  const { paths, contents, wikiRoot } = input;
  const newPaths = new Set(input.newPaths);
  const violations: string[] = [];
  const resolveLink = (source: string, uri: string): string | undefined => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(uri)) return undefined;
    const [encodedPath, encodedAnchor] = uri.split("#");
    let target: string;
    let anchor: string | undefined;
    try {
      target = encodedPath ? posix.normalize(posix.join(posix.dirname(source), decodeURIComponent(encodedPath))) : source;
      anchor = encodedAnchor ? decodeURIComponent(encodedAnchor) : undefined;
    } catch { violations.push(`invalid encoded reference: ${source}`); return undefined; }
    if (target.startsWith("../") || uri.startsWith("/")) {
      violations.push(`reference escapes repository: ${source}`);
    } else if (!paths.has(target)) violations.push(`missing wiki reference: ${source} -> ${target}`);
    else if (anchor && contents[target] !== undefined && !headings(contents[target]).has(anchor)) violations.push(`missing heading anchor: ${source} -> ${target}#${anchor}`);
    return target;
  };
  const links = (source: string) => [...bodyOf(source).matchAll(/\[[^\]]*\]\(([^)]+)\)/g)].map((match) => match[1]);

  for (const [name, source] of Object.entries(contents)) {
    if (!name.startsWith(`${wikiRoot}/`) || !name.endsWith(".md")) continue;
    const body = bodyOf(source);
    for (const link of links(source)) resolveLink(name, link);
    const definitions = [...body.matchAll(/^\[\^([^\]]+)\]:/gm)].map((match) => match[1]);
    const references = [...body.matchAll(/\[\^([^\]\n]+)\](?!:)/g)].map((match) => match[1]);
    for (const id of new Set(references)) if (!definitions.includes(id)) violations.push(`undefined footnote: ${name} [${id}]`);
    if (new Set(definitions).size !== definitions.length) violations.push(`duplicate footnote definition: ${name}`);
    const frontmatter = source.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
    if (/^---\r?\n/.test(source) && !frontmatter) { violations.push(`unclosed wiki frontmatter: ${name}`); continue; }
    let metadata: { type?: unknown; sources?: unknown } | undefined;
    if (frontmatter) {
      try {
        const value: unknown = parse(frontmatter[1]);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
        metadata = value;
      } catch { violations.push(`invalid wiki YAML: ${name}`); continue; }
    }
    const reserved = ["index.md", "log.md"].includes(posix.basename(name));
    const movedPointer = !frontmatter && /^# [^\n]+: moved\s*$/m.test(body) && links(source).length === 1 && links(source)[0].includes("/");
    if (newPaths.has(name) && !reserved && !movedPointer) {
      if (posix.dirname(name) === wikiRoot) violations.push(`new wiki concept needs a topic directory: ${name}`);
      else {
        const topicIndex = posix.join(posix.dirname(name), "index.md");
        const indexed = links(contents[topicIndex] ?? "").some((link) => posix.normalize(posix.join(posix.dirname(topicIndex), link.split("#")[0])) === name);
        if (!paths.has(topicIndex) || !indexed) violations.push(`new wiki concept needs its topic index entry: ${name}`);
        const topic = name.slice(wikiRoot.length + 1).split("/")[0];
        const rootIndex = `${wikiRoot}/index.md`;
        if (contents[rootIndex] !== undefined && !links(contents[rootIndex]).includes(`${topic}/index.md`)) violations.push(`new wiki topic needs a root index entry: ${topic}`);
      }
      if (typeof metadata?.type !== "string") violations.push(`new wiki concept needs typed frontmatter: ${name}`);
    }
    if (!metadata || reserved) continue;
    if (!Array.isArray(metadata.sources) || !metadata.sources.length) { violations.push(`missing wiki source provenance: ${name}`); continue; }
    const sourceIds = new Set<string>();
    for (const item of metadata.sources) {
      if (!item || typeof item.id !== "string" || typeof item.resource !== "string" || !item.resource.trim()) { violations.push(`invalid wiki source record: ${name}`); continue; }
      if (sourceIds.has(item.id)) violations.push(`duplicate wiki source id: ${name} [${item.id}]`);
      sourceIds.add(item.id);
      resolveLink(name, item.resource);
      if (!references.includes(item.id) || !definitions.includes(item.id)) violations.push(`missing source footnote: ${name} [${item.id}]`);
    }
  }
  return [...new Set(violations)];
}
