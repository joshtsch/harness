import { assertSafeContinuationArtifact } from "./continuation-content-policy.js";

export type SessionTodo = {
  id: string;
  title: string;
  status: "open" | "completed";
  reference?: string;
};

const todoIdPattern = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/;

export function parseSessionTodos(content: string): SessionTodo[] {
  assertSafeContinuationArtifact(content);
  let value: unknown;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error("session todos must be a JSON array");
  }
  if (!Array.isArray(value) || value.length > 100) throw new Error("session todos must be an array of at most 100 items");
  const ids = new Set<string>();
  return value.map((item): SessionTodo => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("session todo item is invalid");
    const todo = item as Record<string, unknown>;
    if (Object.keys(todo).some((key) => !["id", "title", "status", "reference"].includes(key))) throw new Error("session todo item has an unknown field");
    if (typeof todo.id !== "string" || !todoIdPattern.test(todo.id) || ids.has(todo.id)) throw new Error("session todo id is invalid or duplicated");
    ids.add(todo.id);
    if (typeof todo.title !== "string" || !todo.title.trim() || todo.title.length > 160 || /[\r\n]/.test(todo.title)) throw new Error("session todo title must be a concise single line");
    if (todo.status !== "open" && todo.status !== "completed") throw new Error("session todo status must be open or completed");
    if (todo.reference !== undefined) {
      if (typeof todo.reference !== "string") throw new Error("session todo reference must be an HTTPS URL");
      let reference: URL;
      try { reference = new URL(todo.reference); } catch { throw new Error("session todo reference must be an HTTPS URL"); }
      if (reference.protocol !== "https:" || reference.username || reference.password) throw new Error("session todo reference must be an HTTPS URL without credentials");
    }
    return { id: todo.id, title: todo.title.trim(), status: todo.status, ...(todo.reference ? { reference: todo.reference } : {}) };
  });
}

export function nextSessionTodo(todos: SessionTodo[]): SessionTodo | null {
  return todos.find((todo) => todo.status === "open") ?? null;
}
