export interface MarkdownViolation {
  line: number;
  message: string;
}

const headingWithoutSpace = /^ {0,3}#{1,6}(?=[^#\s])/;
// `*text*` is emphasis, so an asterisk without a space is ambiguous and is not rejected.
const unorderedListWithoutSpace = /^ {0,3}[-+]\S/;
const orderedListWithoutSpace = /^ {0,3}\d+[.)]\S/;
const linkStart = /!?\[[^\]]*\]\(/g;

export function markdownViolations(source: string): MarkdownViolation[] {
  const violations: MarkdownViolation[] = [];
  const lines = source.split(/\r?\n/);
  let fence: { line: number; marker: string } | undefined;

  for (const [index, line] of lines.entries()) {
    const lineNumber = index + 1;
    const trimmed = line.trimStart();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      const marker = trimmed.slice(0, 3);
      if (fence?.marker === marker) fence = undefined;
      else if (!fence) fence = { line: lineNumber, marker };
      continue;
    }
    if (fence) continue;

    if (headingWithoutSpace.test(line)) violations.push({ line: lineNumber, message: "heading marker must be followed by a space" });
    if (unorderedListWithoutSpace.test(line) || orderedListWithoutSpace.test(line)) violations.push({ line: lineNumber, message: "list marker must be followed by a space" });

    const links = [...line.matchAll(linkStart)];
    for (const [linkIndex, match] of links.entries()) {
      const start = match.index ?? 0;
      const nextStart = links[linkIndex + 1]?.index ?? line.length;
      const close = line.indexOf(")", start + match[0].length);
      if (close === -1 || close > nextStart) violations.push({ line: lineNumber, message: "link or image is missing a closing parenthesis" });
    }
  }

  if (fence) violations.push({ line: fence.line, message: `unclosed ${fence.marker} code fence` });
  return violations;
}
