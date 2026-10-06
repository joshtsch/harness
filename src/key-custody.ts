export type EncryptionIdentityRole = "primary" | "recovery";

export type CustodyIdentity = {
  role: EncryptionIdentityRole;
  recipient: string;
  identity: string;
};

export interface KeyCustodyProvider {
  get(role: EncryptionIdentityRole, session: string): Promise<CustodyIdentity>;
  put(identity: CustodyIdentity, session: string, replace?: boolean): Promise<void>;
}

export const custodyNoteNames: Record<EncryptionIdentityRole, string> = {
  primary: "Harness Primary Encryption Identity",
  recovery: "Harness Recovery Encryption Identity",
};

export function parseCustodyIdentity(value: string, role: EncryptionIdentityRole): CustodyIdentity {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error(`invalid ${role} custody note`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`invalid ${role} custody note`);
  const item = parsed as Record<string, unknown>;
  if (item.format_version !== 1 || item.role !== role || typeof item.recipient !== "string" || typeof item.identity !== "string" || !item.identity.trim()) {
    throw new Error(`invalid ${role} custody note`);
  }
  return { role, recipient: item.recipient, identity: item.identity };
}

export function serializeCustodyIdentity(identity: CustodyIdentity): string {
  return JSON.stringify({ format_version: 1, role: identity.role, recipient: identity.recipient, identity: identity.identity });
}
