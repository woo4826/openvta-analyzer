import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SectionOpportunity } from "../../domain/types";
import { I18nProvider } from "../../i18n/I18nProvider";
import { SegmentOpportunityRanking } from "../SegmentOpportunityRanking";

describe("SegmentOpportunityRanking", () => {
  it("ranks reference-lap losses and opens the selected section", async () => {
    const user = userEvent.setup();
    const onSection = vi.fn();
    render(
      <I18nProvider>
        <SegmentOpportunityRanking
          opportunities={opportunities()}
          scope={{ kind: "whole-lap" }}
          focusedLapOrdinal={7}
          referenceLapOrdinal={4}
          onSection={onSection}
        />
      </I18nProvider>,
    );

    const rows = screen.getAllByRole("button");
    expect(rows[0]).toHaveTextContent("Corner 2");
    expect(rows[0]).toHaveTextContent("+0.700 s");
    expect(screen.getByText("+1.100 s")).toBeVisible();
    await user.click(rows[0]);
    expect(onSection).toHaveBeenCalledWith("c2");
  });
});

function opportunities(): SectionOpportunity[] {
  return [
    {
      section: { id: "c1", name: "Corner 1", kind: "corner-left", startDistanceMeters: 0, endDistanceMeters: 100 },
      focusedLapId: "lap-7",
      referenceLapId: "lap-4",
      timeDeltaSeconds: 0.4,
      pathDeltaMeters: 2,
      exitSpeedDeltaKmh: -3,
      consistencyStdDevSeconds: 0.1,
      eligibleSampleCount: 7,
    },
    {
      section: { id: "c2", name: "Corner 2", kind: "corner-right", startDistanceMeters: 100, endDistanceMeters: 200 },
      focusedLapId: "lap-7",
      referenceLapId: "lap-4",
      timeDeltaSeconds: 0.7,
      pathDeltaMeters: 4,
      exitSpeedDeltaKmh: -6,
      consistencyStdDevSeconds: 0.2,
      eligibleSampleCount: 7,
    },
  ];
}
