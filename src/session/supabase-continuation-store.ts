import type { ArtifactContent, ContinuationArtifact, ContinuationManifest, ContinuationState, ContinuationStore, ContinuationUserRecordStore } from "./continuation.js";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class ContinuationRevisionConflictError extends Error {
  constructor() {
    super("continuation revision conflict");
    this.name = "ContinuationRevisionConflictError";
  }
}

export class ContinuationBackendUnavailableError extends Error {
  constructor() {
    super("continuation backend is unavailable");
    this.name = "ContinuationBackendUnavailableError";
  }
}

export class SupabaseContinuationStore implements ContinuationStore, ContinuationUserRecordStore {
  private readonly baseUrl: string;
  private readonly serviceKey: string;
  private readonly fetcher: FetchLike;

  constructor(options: { url: string; serviceKey: string; fetcher?: FetchLike }) {
    const url = new URL(options.url);
    if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      throw new Error("continuation Supabase URL must use HTTPS");
    }
    if (!options.serviceKey.trim()) throw new Error("continuation Supabase service key is required");
    this.baseUrl = url.toString().replace(/\/$/, "");
    this.serviceKey = options.serviceKey;
    this.fetcher = options.fetcher ?? fetch;
  }

  async load(key: string): Promise<ContinuationManifest | null> {
    return this.rpc<ContinuationManifest | null>("continuation_load", { p_session_key: key });
  }

  async list(state: ContinuationState): Promise<ContinuationManifest[]> {
    const result = await this.rpc<unknown>("continuation_list", { p_state: state });
    if (!Array.isArray(result)) throw new Error("continuation backend returned an invalid session list");
    return result as ContinuationManifest[];
  }

  async readArtifact(key: string): Promise<ContinuationArtifact | null> {
    return this.rpc<ContinuationArtifact | null>("continuation_read_artifact", { p_artifact_key: key });
  }

  async loadUserRecord(key: string): Promise<{ revision: number; content: ArtifactContent } | null> {
    return this.rpc<{ revision: number; content: ArtifactContent } | null>("continuation_user_record_load", { p_record_key: key });
  }

  async commitUserRecord(key: string, expectedRevision: number | null, content: ArtifactContent): Promise<number> {
    return this.rpc<number>("continuation_user_record_commit", {
      p_record_key: key,
      p_expected_revision: expectedRevision,
      p_content: content,
    });
  }

  async commit(expectedRevision: number | null, manifest: ContinuationManifest, artifacts: ContinuationArtifact[]): Promise<void> {
    await this.rpc<ContinuationManifest>("continuation_commit", {
      p_expected_revision: expectedRevision,
      p_manifest: manifest,
      p_artifacts: artifacts,
    });
  }

  private async rpc<T>(functionName: string, body: Record<string, unknown>): Promise<T> {
    let response: Response;
    try {
      response = await this.fetcher(`${this.baseUrl}/rest/v1/rpc/${functionName}`, {
        method: "POST",
        headers: {
          apikey: this.serviceKey,
          authorization: `Bearer ${this.serviceKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch {
      throw new ContinuationBackendUnavailableError();
    }

    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { code?: unknown } | null;
      if (response.status === 409 || payload?.code === "40001") throw new ContinuationRevisionConflictError();
      if (response.status === 429 || response.status >= 500) throw new ContinuationBackendUnavailableError();
      throw new Error(`continuation backend request failed (HTTP ${response.status})`);
    }
    try {
      return await response.json() as T;
    } catch {
      throw new Error("continuation backend returned invalid JSON");
    }
  }
}

export function supabaseContinuationStoreFromEnvironment(): SupabaseContinuationStore {
  const url = process.env.HARNESS_CONTINUATION_SUPABASE_URL;
  const serviceKey = process.env.HARNESS_CONTINUATION_SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("HARNESS_CONTINUATION_SUPABASE_URL and HARNESS_CONTINUATION_SUPABASE_SERVICE_ROLE_KEY are required");
  return new SupabaseContinuationStore({ url, serviceKey });
}
