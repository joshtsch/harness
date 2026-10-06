import { describe, expect, it } from "vitest";
import { installedPluginNames, missingRequiredPlugins } from "../src/codex-plugins.js";

describe("Codex plugin checks", () => {
  it("parses installed and enabled plugins from codex output", () => {
    const names = installedPluginNames("ponytail@ponytail installed, enabled  4.10.0\nother@market not installed");
    expect(names).toEqual(new Set(["ponytail@ponytail"]));
  });

  it("reports only required plugins that are unavailable", () => {
    const required = [
      { name: "ponytail", marketplace: "ponytail", source: "DietrichGebert/ponytail", install: [] },
      { name: "missing", marketplace: "local", source: "example/missing", install: [] },
    ];
    expect(missingRequiredPlugins(required, "ponytail@ponytail installed, enabled").map((plugin) => plugin.name)).toEqual(["missing"]);
  });
});
