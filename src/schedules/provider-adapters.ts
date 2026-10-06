import {
  resolveToolContext,
  type ToolContextOptions,
  type BusinessLine,
  type SessionContext,
} from "../context/index.js";
import type { ProjectDefinition } from "../project-config.js";

export type ProviderPayload = Record<string, unknown>;

export interface CalendarAdapter {
  list(targetId: string): Promise<readonly ProviderPayload[]>;
  create(targetId: string, event: ProviderPayload): Promise<ProviderPayload>;
}

export interface CrmAdapter {
  search(targetId: string, query: ProviderPayload): Promise<readonly ProviderPayload[]>;
  get(targetId: string, recordId: string): Promise<ProviderPayload>;
  update(targetId: string, recordId: string, changes: ProviderPayload): Promise<ProviderPayload>;
}

export interface DriveAdapter {
  search(targetId: string, query: ProviderPayload): Promise<readonly ProviderPayload[]>;
}

export interface ProviderAdapterRegistry {
  calendar?: Record<string, CalendarAdapter>;
  crm?: Record<string, CrmAdapter>;
  drive?: Record<string, DriveAdapter>;
}

export class ProviderAdapterError extends Error {
  constructor(
    readonly tool: "calendar" | "crm" | "drive",
    readonly provider: string,
    readonly targetId: string,
    cause: unknown,
  ) {
    super(`${tool} provider ${provider} failed for target ${targetId}: ${cause instanceof Error ? cause.message : String(cause)}`, { cause });
    this.name = "ProviderAdapterError";
  }
}

function adapterFor<T>(
  registry: ProviderAdapterRegistry,
  tool: "calendar" | "crm" | "drive",
  provider: string,
  targetId: string,
): T {
  const adapter = registry[tool]?.[provider] as T | undefined;
  if (!adapter) throw new ProviderAdapterError(tool, provider, targetId, new Error("no authenticated adapter is registered"));
  return adapter;
}

function providerError(tool: "calendar" | "crm" | "drive", provider: string, targetId: string, error: unknown): ProviderAdapterError {
  return error instanceof ProviderAdapterError ? error : new ProviderAdapterError(tool, provider, targetId, error);
}

async function callAdapter<TAdapter, TResult>(
  registry: ProviderAdapterRegistry,
  tool: "calendar" | "crm" | "drive",
  provider: string,
  targetId: string,
  call: (adapter: TAdapter) => Promise<TResult>,
): Promise<TResult> {
  try {
    return await call(adapterFor<TAdapter>(registry, tool, provider, targetId));
  } catch (error) {
    throw providerError(tool, provider, targetId, error);
  }
}

function optionsWithOperation(
  options: ToolContextOptions | undefined,
  operation: ToolContextOptions["operation"],
  defaults: ToolContextOptions,
): ToolContextOptions {
  return { ...defaults, ...options, operation };
}

export function createProviderIntegrations(
  project: ProjectDefinition,
  businessLines: Record<string, BusinessLine>,
  registry: ProviderAdapterRegistry,
  defaults: ToolContextOptions = {},
  session?: SessionContext,
) {
  return {
    async listCalendarEvents(options?: ToolContextOptions): Promise<ProviderPayload[]> {
      const context = resolveToolContext(project, businessLines, "calendar", optionsWithOperation(options, "read", defaults), session);
      const results: ProviderPayload[] = [];
      for (const target of context.targets) {
        results.push(...await callAdapter(registry, "calendar", target.provider, target.id,
          (adapter: CalendarAdapter) => adapter.list(target.id)));
      }
      return results;
    },

    async createCalendarEvent(event: ProviderPayload, options?: ToolContextOptions): Promise<ProviderPayload> {
      const context = resolveToolContext(project, businessLines, "calendar", optionsWithOperation(options, "write", defaults), session);
      const target = context.targets[0];
      return callAdapter(registry, "calendar", target.provider, target.id,
        (adapter: CalendarAdapter) => adapter.create(target.id, event));
    },

    async searchCrm(query: ProviderPayload, options?: ToolContextOptions): Promise<ProviderPayload[]> {
      const context = resolveToolContext(project, businessLines, "crm", optionsWithOperation(options, "read", defaults), session);
      const results: ProviderPayload[] = [];
      for (const target of context.targets) {
        results.push(...await callAdapter(registry, "crm", target.provider, target.id,
          (adapter: CrmAdapter) => adapter.search(target.id, query)));
      }
      return results;
    },

    async searchDrive(query: ProviderPayload, options?: ToolContextOptions): Promise<ProviderPayload[]> {
      const context = resolveToolContext(project, businessLines, "drive", optionsWithOperation(options, "read", defaults), session);
      const results: ProviderPayload[] = [];
      for (const target of context.targets) {
        results.push(...await callAdapter(registry, "drive", target.provider, target.id,
          (adapter: DriveAdapter) => adapter.search(target.id, query)));
      }
      return results;
    },

    async getCrmRecord(recordId: string, options?: ToolContextOptions): Promise<ProviderPayload> {
      const context = resolveToolContext(project, businessLines, "crm", optionsWithOperation(options, "single_record", defaults), session);
      const target = context.targets[0];
      return callAdapter(registry, "crm", target.provider, target.id,
        (adapter: CrmAdapter) => adapter.get(target.id, recordId));
    },

    async updateCrmRecord(recordId: string, changes: ProviderPayload, options?: ToolContextOptions): Promise<ProviderPayload> {
      const context = resolveToolContext(project, businessLines, "crm", optionsWithOperation(options, "write", defaults), session);
      const target = context.targets[0];
      return callAdapter(registry, "crm", target.provider, target.id,
        (adapter: CrmAdapter) => adapter.update(target.id, recordId, changes));
    },
  };
}

export function createSessionProviderIntegrations(
  session: SessionContext,
  project: ProjectDefinition,
  businessLines: Record<string, BusinessLine>,
  registry: ProviderAdapterRegistry,
) {
  return createProviderIntegrations(project, businessLines, registry, {}, session);
}
