#!/usr/bin/env tsx
import { resolve } from "node:path";
import { discoverConfiguredProjects } from "../src/project-inventory.js";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.some((arg) => arg !== "--json") || args.length > 1) {
  console.error("Usage: pnpm projects [--json]");
  process.exitCode = 1;
} else {
  try {
    const projects = await discoverConfiguredProjects(resolve("."));
    if (args.includes("--json")) {
      console.log(JSON.stringify(projects, null, 2));
    } else {
      for (const project of projects) {
        console.log(`${project.name}:`);
        console.log(`  purpose: ${project.purpose ?? "(not configured)"}`);
        console.log(`  topics: ${project.topics?.join(", ") ?? "(not configured)"}`);
        console.log(`  excludes: ${project.excludes?.join(", ") ?? "(not configured)"}`);
        console.log(`  expected checkout: ${project.projectRoot}`);
        if (project.wiki) console.log(`  wiki: ${project.wiki.description} (${project.wiki.topics.join(", ")})`);
      }
    }
  } catch {
    // YAML parser errors can contain private source values.
    console.error("Unable to load project inventory; validate projects.yml and projects.local.yml.");
    process.exitCode = 1;
  }
}
