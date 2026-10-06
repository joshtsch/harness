import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createProviderIntegrations, createSessionProviderIntegrations, type ProviderAdapterRegistry } from "../index.js";
import { loadSessionContext, sessionToolMappingsPath, type BusinessLine, type SessionContext } from "../../context/index.js";
import type { ProjectDefinition } from "../../project-config.js";
import { createSessionManifest } from "../../session/index.js";

const project: ProjectDefinition = {
  name: "example-project", remote: "remote", defaultBranch: "main", setupScript: "setup",
  issueTracker: { type: "github" }, businessLines: ["sales"], verification: [], workflows: [],
};
const businessLines: Record<string, BusinessLine> = {
  sales: { key: "sales", displayName: "Sales", toolMappings: {
    calendar: { provider: "google", targets: [{ id: "calendar", access: "read_write", default: true }] },
    crm: { provider: "attio", targets: [{ id: "workspace", access: "read_write" }] },
    drive: { provider: "google-drive-workspace", targets: [{ id: "city-tales", access: "read_write" }] },
  } },
};

function registry(): ProviderAdapterRegistry {
  return {
    calendar: { google: { list: vi.fn().mockResolvedValue([{ id: "event" }]), create: vi.fn().mockResolvedValue({ id: "created" }) } },
    crm: { attio: { search: vi.fn().mockResolvedValue([{ id: "record" }]), get: vi.fn().mockResolvedValue({ id: "record" }), update: vi.fn().mockResolvedValue({ id: "updated" }) } },
    drive: { "google-drive-workspace": { search: vi.fn().mockResolvedValue([{ id: "file" }]) } },
  };
}

describe("provider integrations", () => {
  it("uses the mappings from the active session context", async () => {
    const adapters = registry();
    const session: SessionContext = {
      sessionId: "session-1",
      toolMappings: { crm: { provider: "attio", targets: [{ id: "session", access: "read_write" }] } },
    };
    await createSessionProviderIntegrations(session, project, businessLines, adapters).updateCrmRecord("record", { name: "Session" });
    expect(adapters.crm!.attio.update).toHaveBeenCalledWith("session", "record", { name: "Session" });
  });

  it("shares one loaded context between manifest output and provider selection", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-session-"));
    const path = sessionToolMappingsPath(directory, "session-1");
    try {
      await mkdir(join(directory, "docs", ".scratch", "setup", "session-1"), { recursive: true });
      await writeFile(path, JSON.stringify({ tool_mappings: {
        crm: { provider: "attio", targets: [{ id: "loaded", access: "read_write" }] },
      } }));
      const session = await loadSessionContext(directory, "session-1");
      await rm(path);

      const manifest = createSessionManifest(session, {
        issueKey: "66",
        purpose: "Give session context one owner",
        issue: { key: "66", number: 66, repository: "example/repo" },
        projects: {},
        status: "complete",
      });
      const update = vi.fn(async () => ({ id: "updated" }));
      await createSessionProviderIntegrations(session, project, businessLines, {
        crm: { attio: { search: vi.fn(), get: vi.fn(), update } },
      }).updateCrmRecord("record", { name: "Loaded" });

      expect(manifest.toolMappings).toEqual(["crm"]);
      expect(update).toHaveBeenCalledWith("loaded", "record", { name: "Loaded" });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("dispatches reads and writes through resolved targets", async () => {
    const adapters = registry();
    const integrations = createProviderIntegrations(project, businessLines, adapters);
    await expect(integrations.listCalendarEvents()).resolves.toEqual([{ id: "event" }]);
    await expect(integrations.createCalendarEvent({ title: "Call" })).resolves.toEqual({ id: "created" });
    await expect(integrations.searchCrm({ name: "Ada" })).resolves.toEqual([{ id: "record" }]);
    await expect(integrations.searchDrive({ name: "Roadmap" })).resolves.toEqual([{ id: "file" }]);
    await expect(integrations.getCrmRecord("record")).resolves.toEqual({ id: "record" });
    await expect(integrations.updateCrmRecord("record", { name: "Grace" })).resolves.toEqual({ id: "updated" });
  });

  it("makes provider and authentication failures explicit", async () => {
    const adapters = registry();
    adapters.crm!.attio.search = vi.fn().mockRejectedValue(new Error("OAuth expired"));
    await expect(createProviderIntegrations(project, businessLines, adapters).searchCrm({})).rejects.toThrow(
      "crm provider attio failed for target workspace: OAuth expired",
    );
    await expect(createProviderIntegrations(project, businessLines, {}).searchCrm({})).rejects.toThrow(
      "no authenticated adapter is registered",
    );
    await expect(createProviderIntegrations(project, businessLines, {}).searchDrive({})).rejects.toThrow(
      "no authenticated adapter is registered",
    );
    await expect(createProviderIntegrations(project, businessLines, adapters).listCalendarEvents()).resolves.toEqual([{ id: "event" }]);
  });

  it("honors project CRM overrides", async () => {
    const adapters = registry();
    const overridden = createProviderIntegrations({
      ...project,
      toolMappings: { crm: { provider: "attio", targets: [{ id: "project", access: "read_write" }] } },
    }, businessLines, adapters);
    await overridden.updateCrmRecord("record", { name: "Override" });
    expect(adapters.crm!.attio.update).toHaveBeenCalledWith("project", "record", { name: "Override" });
  });

  it("keeps personal Drive routing on its separate auth context", async () => {
    const search = vi.fn().mockResolvedValue([{ id: "personal-file" }]);
    const personal = createProviderIntegrations({
      ...project,
      businessLines: [],
      toolMappings: { drive: { provider: "google-drive-personal", targets: [{ id: "personal", access: "read_write" }] } },
    }, {}, { drive: { "google-drive-personal": { search } } });

    await expect(personal.searchDrive({ name: "Taxes" })).resolves.toEqual([{ id: "personal-file" }]);
    expect(search).toHaveBeenCalledWith("personal", { name: "Taxes" });
  });

  it("enforces calendar write defaults before calling a provider", async () => {
    const adapters = registry();
    const withoutDefault = createProviderIntegrations({
      ...project,
      businessLines: [],
      toolMappings: { calendar: { provider: "google", targets: [{ id: "calendar", access: "write" }] } },
    }, {}, adapters);
    await expect(withoutDefault.createCalendarEvent({ title: "Call" })).rejects.toThrow(
      "Calendar writes require exactly one default writable target or an explicit target",
    );
    expect(adapters.calendar!.google.create).not.toHaveBeenCalled();
  });
});
