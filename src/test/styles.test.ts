import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync("src/styles.css", "utf8");

describe("responsive analyzer layout", () => {
  it("collapses the file workspace before the narrow one-column breakpoint", () => {
    expect(styles).toContain(`@media (max-width: 1180px) {\n  .segment-controls-scrim`);
    expect(styles).toContain(".workspace-grid {\n    grid-template-columns: minmax(0, 1fr);");
  });

  it("keeps narrow grid tracks shrinkable", () => {
    expect(styles).toContain(
      ".section-editor-row {\n    grid-template-columns: minmax(0, 1fr);",
    );
  });
});
