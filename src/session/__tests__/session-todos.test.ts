import { describe, expect, it } from "vitest";
import { nextSessionTodo, parseSessionTodos } from "../session-todos.js";

describe("session todos", () => {
  it("preserves order and selects the first open todo", () => {
    const todos = parseSessionTodos(JSON.stringify([
      { id: "first", title: "Review issue", status: "completed" },
      { id: "second", title: "Implement checkpoint update", status: "open", reference: "https://github.com/joshtsch/harness/issues/79" },
      { id: "third", title: "Document behavior", status: "open" },
    ]));
    expect(todos.map(({ id }) => id)).toEqual(["first", "second", "third"]);
    expect(nextSessionTodo(todos)).toEqual(todos[1]);
    expect(nextSessionTodo(todos.map((todo) => ({ ...todo, status: "completed" as const })))).toBeNull();
  });

  it("rejects unsafe or malformed todo content", () => {
    const email = ["person", "example.com"].join("@");
    expect(() => parseSessionTodos("not json")).toThrow("JSON array");
    expect(() => parseSessionTodos(JSON.stringify([{ id: "duplicate", title: "One", status: "open" }, { id: "duplicate", title: "Two", status: "open" }]))).toThrow("duplicated");
    expect(() => parseSessionTodos(JSON.stringify([{ id: "unsafe", title: `Contact ${email}`, status: "open" }]))).toThrow("likely credentials or personal information");
    expect(() => parseSessionTodos(JSON.stringify([{ id: "unsafe", title: "Visit the project site", status: "open", reference: "http://example.com/" }]))).toThrow("HTTPS URL");
    expect(() => parseSessionTodos(JSON.stringify([{ id: "unsafe", title: "Review the project", status: "blocked" }]))).toThrow("status must be open or completed");
  });
});
