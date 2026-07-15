import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrackProfileV1 } from "../../domain/types";
import { I18nProvider } from "../../i18n/I18nProvider";

const mocks = vi.hoisted(() => ({
  importTexts: vi.fn(),
  remove: vi.fn(),
  refresh: vi.fn(),
  origins: { inje: "local-override", taebaek: "generated" } as Record<string, "local-override" | "imported" | "osm" | "generated">,
}));

vi.mock("../../app/useTrackLibrary", () => ({
  useTrackLibrary: () => ({
    profiles: [profile("inje"), profile("taebaek")],
    origins: mocks.origins,
    busy: false,
    error: undefined,
    importTexts: mocks.importTexts,
    remove: mocks.remove,
    refresh: mocks.refresh,
  }),
}));

import { TrackLibrary } from "../TrackLibrary";

describe("TrackLibrary", () => {
  beforeEach(() => {
    mocks.importTexts.mockReset().mockResolvedValue(undefined);
    mocks.remove.mockReset().mockResolvedValue(undefined);
    mocks.refresh.mockReset().mockResolvedValue(undefined);
    mocks.origins = { inje: "local-override", taebaek: "generated" };
  });

  it("opens without a recording and keeps apply disabled", () => {
    render(<I18nProvider><TrackLibrary open onClose={vi.fn()} onApply={vi.fn()} /></I18nProvider>);

    expect(screen.getByRole("dialog", { name: "Track Library" })).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Apply to current recording" }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ disabled: true })]));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("imports multiple JSON files and applies a selected profile", async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    const { container } = render(
      <I18nProvider><TrackLibrary open activeFileName="session.Vta" onClose={vi.fn()} onApply={onApply} /></I18nProvider>,
    );
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const files = [
      new File(["one"], "inje.json", { type: "application/json" }),
      new File(["two"], "catalog.json", { type: "application/json" }),
    ];

    fireEvent.change(input, { target: { files } });
    await waitFor(() => expect(mocks.importTexts).toHaveBeenCalledWith(["one", "two"]));
    await user.click(screen.getAllByRole("button", { name: "Apply to current recording" })[0]);

    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ id: "inje" }), "local-override");
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<I18nProvider><TrackLibrary open onClose={onClose} onApply={vi.fn()} /></I18nProvider>);

    await user.keyboard("{Escape}");

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("infers a missing legacy origin from the profile source", () => {
    mocks.origins = {};
    render(<I18nProvider><TrackLibrary open onClose={vi.fn()} onApply={vi.fn()} /></I18nProvider>);

    expect(screen.getByText("Recording-based")).toBeInTheDocument();
  });
});

function profile(id: string): TrackProfileV1 {
  return {
    schemaVersion: 1,
    id,
    name: id === "inje" ? "Inje Speedium" : "Taebaek Speedway",
    centerline: { type: "LineString", coordinates: [[0, 0], [0.001, 0]] },
    direction: "unknown",
    sectorGates: [],
    sections: [],
    source: id === "taebaek" ? { kind: "recording" } : { kind: "user" },
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
}
