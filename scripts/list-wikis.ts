#!/usr/bin/env tsx
import { resolve } from "node:path";
import { discoverProjectWikis } from "../src/wiki-inventory.js";

const json = process.argv.includes("--json");
const wikis = await discoverProjectWikis(resolve("."));

if (json) {
  console.log(JSON.stringify(wikis, null, 2));
} else {
  for (const wiki of wikis) {
    console.log(`${wiki.project}:`);
    console.log(`  description: ${wiki.description}`);
    console.log(`  topics: ${wiki.topics.join(", ")}`);
    console.log(`  pages: ${resolve(wiki.projectRoot, wiki.pages)}`);
    console.log(`  raw: ${resolve(wiki.projectRoot, wiki.raw)}`);
    console.log(`  templates: ${resolve(wiki.projectRoot, wiki.templates)}`);
  }
}
