import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);
const repository = resolve(import.meta.dirname, "..");
const denied = [".env", ".env.hosted", "apps/web/.env.hosted-setup", "foo.env", "nested/foo.env"];
const readable = [".env.example", "apps/web/.env.example", "docs/env.md"];

async function envRules(file: string, tool: "Read" | "Edit"): Promise<string[]> {
  const settings = JSON.parse(await readFile(resolve(repository, file), "utf8")) as { permissions: { deny: string[] } };
  return settings.permissions.deny.filter((rule) => rule.startsWith(`${tool}(`) && rule.includes("env")).map((rule) => rule.slice(tool.length + 1, -1));
}

// Claude Code Read/Edit rules use gitignore syntax, so git check-ignore evaluates them the same way.
async function matched(patterns: string[], paths: string[]): Promise<string[]> {
  const root = await mkdtemp(join(tmpdir(), "env-deny-"));
  try {
    await exec("git", ["init", "-q", root]);
    await writeFile(join(root, ".gitignore"), `${patterns.join("\n")}\n`);
    const result = await exec("git", ["check-ignore", "--no-index", "--", ...paths], { cwd: root }).catch((error: { code?: number; stdout?: string }) => {
      if (error.code === 1) return { stdout: "" };
      throw error;
    });
    return result.stdout.split("\n").filter(Boolean);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("Claude Code env deny rules", () => {
  for (const file of [".claude/settings.json", "projects/.claude/settings.json"]) {
    for (const tool of ["Read", "Edit"] as const) {
      it(`${file} ${tool} denies env files at any depth but keeps .env.example`, async () => {
        const rules = await envRules(file, tool);
        expect(rules).toEqual(await envRules(".claude/settings.json", "Read"));
        expect(await matched(rules, [...denied, ...readable])).toEqual(denied);
      });
    }
  }
});
