import { exploreProject } from "../src/code-intelligence.js";

const [projectRoot, ...queryParts] = process.argv.slice(2);
if (!projectRoot || queryParts.length === 0) {
  console.error("Usage: pnpm evaluate:code-graph <absolute-project-root> <query>");
  process.exitCode = 2;
} else {
  const result = await exploreProject({ projectRoot, query: queryParts.join(" ") });
  console.log(JSON.stringify({ ...result, output: result.output.slice(0, 20_000) }, null, 2));
}
