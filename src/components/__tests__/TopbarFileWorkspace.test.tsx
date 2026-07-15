import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { VtaWorkspaceFile } from "../../domain/types";
import { I18nProvider } from "../../i18n/I18nProvider";
import { TopbarFileWorkspace } from "../TopbarFileWorkspace";

describe("TopbarFileWorkspace", () => {
  it("switches and removes loaded files from the top-bar popover", async () => {
    const user = userEvent.setup();
    const onSelectFile = vi.fn();
    const onRemoveFile = vi.fn();
    render(
      <I18nProvider>
        <TopbarFileWorkspace
          files={[file("first", "first.Vta", 12), file("second", "second.Vta", 24)]}
          activeFileId="first"
          onFiles={vi.fn()}
          onSelectFile={onSelectFile}
          onRemoveFile={onRemoveFile}
        />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: /Files · 2.*first\.Vta/i }));
    expect(screen.getByRole("dialog", { name: "Files" })).toBeVisible();
    expect(screen.getByText("GPS 24")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /second\.Vta.*legacy-phone/i }));
    expect(onSelectFile).toHaveBeenCalledWith("second");

    await user.click(screen.getByRole("button", { name: /Files · 2.*first\.Vta/i }));
    await user.click(screen.getByRole("button", { name: "Remove second.Vta" }));
    expect(onRemoveFile).toHaveBeenCalledWith("second");
  });

  it("closes with Escape", async () => {
    const user = userEvent.setup();
    render(
      <I18nProvider>
        <TopbarFileWorkspace
          files={[file("first", "first.Vta", 12)]}
          activeFileId="first"
          onFiles={vi.fn()}
          onSelectFile={vi.fn()}
          onRemoveFile={vi.fn()}
        />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("button", { name: /Files · 1.*first\.Vta/i }));
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Files" })).not.toBeInTheDocument();
  });
});

function file(id: string, sourceName: string, gpsCount: number): VtaWorkspaceFile {
  return {
    id,
    sourceName,
    loadedAt: 1,
    detectedFormat: "legacy-phone",
    headers: [],
    rawLines: [],
    gpsPoints: Array.from({ length: gpsCount }, () => null) as unknown as VtaWorkspaceFile["gpsPoints"],
    enhancedPoints: [],
    sensorPoints: [],
    parseWarnings: [],
  };
}
