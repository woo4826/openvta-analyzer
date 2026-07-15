import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LapWorkspace } from "../../app/useLapWorkspace";
import type { GpsPoint, LapResult, TrackProfileV1 } from "../../domain/types";
import { I18nProvider } from "../../i18n/I18nProvider";
import { LapAnalysis } from "../LapAnalysis";

vi.mock("../RouteMap", () => ({
  RouteMap: ({
    onSectionSelect,
    sectionVisuals,
  }: {
    onSectionSelect?: (sectionId: string) => void;
    sectionVisuals?: Record<string, { color: string }>;
  }) => (
    <div data-testid="lap-route-map" data-neutral-color={sectionVisuals?.["straight-neutral"]?.color}>
      {onSectionSelect ? <button type="button" onClick={() => onSectionSelect("straight-neutral")}>Select neutral section</button> : null}
    </div>
  ),
}));
vi.mock("../ChartPanel", () => ({
  ChartPanel: ({ title, actions }: { title: string; actions?: React.ReactNode }) => <section><h3>{title}</h3>{actions}</section>,
}));

describe("LapAnalysis", () => {
  it("imports a track profile and exposes the partial-lap sector policy", async () => {
    const user = userEvent.setup();
    const workspace = emptyWorkspace();
    render(
      <I18nProvider>
        <LapAnalysis
          fileName="session.Vta"
          points={[gps(0), gps(1)]}
          selectedPointIndex={0}
          onSelectedPointIndex={vi.fn()}
          sourceVisibility={{ rawGps: true, enhancedGps: false }}
          mapSettings={{ pointSize: 5, tileUrl: "tiles", speedThresholds: [10, 30, 50, 80] }}
          onMapSettingsChange={vi.fn()}
          onActiveSegment={vi.fn()}
          workspace={workspace}
        />
      </I18nProvider>,
    );

    await user.click(screen.getByRole("tab", { name: "Setup" }));

    const fileInput = document.querySelector<HTMLInputElement>('input[type="file"]');
    expect(fileInput).not.toBeNull();
    const trackFile = new File(["{}"], "track.openvta-track.json", { type: "application/json" });
    Object.defineProperty(trackFile, "text", { value: async () => "{}" });
    await user.upload(fileInput!, trackFile);
    await waitFor(() => expect(workspace.importProfile).toHaveBeenCalledWith("{}"));

    await user.click(screen.getByRole("checkbox", { name: /Include completed sectors from partial laps/i }));
    expect(workspace.setIncludePartialLapSectors).toHaveBeenCalledWith(true);
    expect(screen.getByTestId("lap-route-map")).toBeInTheDocument();
  });

  it("keeps gate numeric edits as drafts until a confirmed Apply", async () => {
    const user = userEvent.setup();
    const workspace = emptyWorkspace();
    workspace.gate = gate();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderLapAnalysis(workspace);
    await user.click(screen.getByRole("tab", { name: "Setup" }));

    const width = screen.getByRole("spinbutton", { name: "Gate width (m)" });
    await user.clear(width);
    await user.type(width, "75");
    expect(workspace.updateStartFinish).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Apply gate changes" }));
    expect(confirm).toHaveBeenCalledWith("Replace the existing start/finish gate? Lap boundary and validity corrections will be cleared.");
    expect(workspace.updateStartFinish).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Apply gate changes" }));
    expect(workspace.updateStartFinish).toHaveBeenCalledWith(75, 90);
    confirm.mockRestore();
  });

  it("confirms replacement of an existing gate but not first gate creation", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const firstWorkspace = emptyWorkspace();
    const first = renderLapAnalysis(firstWorkspace);
    await user.click(screen.getByRole("tab", { name: "Setup" }));

    await user.click(screen.getByRole("button", { name: "Use selected point as start/finish" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(firstWorkspace.useSelectedPointAsStartFinish).toHaveBeenCalledWith(0);
    first.unmount();

    const existingWorkspace = emptyWorkspace();
    existingWorkspace.gate = gate();
    renderLapAnalysis(existingWorkspace);
    await user.click(screen.getByRole("tab", { name: "Setup" }));
    await user.click(screen.getByRole("button", { name: "Use selected point as start/finish" }));
    expect(confirm).toHaveBeenCalledWith("Replace the existing start/finish gate? Lap boundary and validity corrections will be cleared.");
    expect(existingWorkspace.useSelectedPointAsStartFinish).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Use selected point as start/finish" }));
    expect(existingWorkspace.useSelectedPointAsStartFinish).toHaveBeenCalledWith(0);
    confirm.mockRestore();
  });

  it("renders reverse crossing and missed-sector diagnostics as localized warnings and lap flags", async () => {
    const user = userEvent.setup();
    const workspace = emptyWorkspace();
    const flaggedLap = lapWithFlags();
    workspace.gate = gate();
    workspace.detection = {
      gate: workspace.gate,
      boundaries: [],
      laps: [flaggedLap],
      warnings: [
        "One or more laps crossed the start/finish gate in the reverse direction.",
        "One or more laps crossed timing sector gates in the wrong order.",
      ],
    };

    renderLapAnalysis(workspace);

    await user.click(screen.getByRole("tab", { name: "Compare" }));
    expect(screen.getByRole("columnheader", { name: "Flags" })).toBeInTheDocument();
    expect(screen.getAllByText("Reverse crossing").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Missing / wrong sector order").length).toBeGreaterThan(0);
    expect(screen.getByText("A lap crossed the start/finish gate in the reverse direction.")).toBeInTheDocument();
    expect(screen.getByText("A lap crossed timing sector gates in the wrong order or missed a gate.")).toBeInTheDocument();
  });

  it("edits sector gates and shows lap and sector deltas", async () => {
    const user = userEvent.setup();
    const workspace = emptyWorkspace();
    const fastest = { ...lapWithFlags(), id: "fastest", flags: [], durationSeconds: 10 };
    const slower = { ...lapWithFlags(), id: "slower", ordinal: 2, flags: [], durationSeconds: 12 };
    const partial = { ...lapWithFlags(), id: "partial", completion: "partial-end" as const, flags: ["in-lap" as const] };
    workspace.gate = gate();
    workspace.profile = trackProfile();
    workspace.detection = { gate: workspace.gate, boundaries: [], laps: [fastest, slower, partial], warnings: [] };
    workspace.sectors = [
      { id: "s-fast", lapId: fastest.id, sectorIndex: 0, name: "S1", startGateId: "start-finish", endGateId: "sector-1", startSeconds: 0, endSeconds: 4, durationSeconds: 4, fromPartialLap: false, eligibleForBest: true },
      { id: "s-slow", lapId: slower.id, sectorIndex: 0, name: "S1", startGateId: "start-finish", endGateId: "sector-1", startSeconds: 0, endSeconds: 5, durationSeconds: 5, fromPartialLap: false, eligibleForBest: true },
    ];
    renderLapAnalysis(workspace);

    await user.click(screen.getByRole("tab", { name: "Compare" }));
    expect(screen.getByRole("columnheader", { name: "Delta to fastest" })).toBeInTheDocument();
    expect(screen.getByText("+2.000 s")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Reference Closing fragment" })).toBeDisabled();
    await user.click(screen.getByRole("tab", { name: "Setup" }));
    expect(screen.getByText("+1.000 s")).toBeInTheDocument();

    const name = screen.getByRole("textbox", { name: "Name" });
    await user.clear(name);
    await user.type(name, "Back straight");
    await user.tab();
    expect(workspace.updateSectorGate).toHaveBeenCalledWith("sector-1", { name: "Back straight" });
    await user.click(screen.getByRole("button", { name: "Move to selected point" }));
    expect(workspace.moveSectorGateToPoint).toHaveBeenCalledWith("sector-1", 0);
  });

  it("defaults to opportunity insights and keeps advanced setup out of the primary flow", () => {
    const workspace = emptyWorkspace();
    const selectedLap = { ...lapWithFlags(), id: "lap-a", flags: [], durationSeconds: 11 };
    const referenceLap = { ...lapWithFlags(), id: "lap-b", ordinal: 2, flags: [], durationSeconds: 10 };
    const profile = {
      ...trackProfile(),
      sections: [{ id: "corner-1", name: "Corner 1", kind: "corner-right" as const, startDistanceMeters: 0, endDistanceMeters: 100 }],
      analysisLine: { type: "LineString" as const, coordinates: [[128, 38], [128.001, 38.001]] },
    };
    workspace.gate = gate();
    workspace.profile = profile;
    workspace.analysisLine = profile.analysisLine;
    workspace.detection = { gate: workspace.gate, boundaries: [], laps: [selectedLap, referenceLap], warnings: [] };
    workspace.primaryLapId = selectedLap.id;
    workspace.referenceLapId = referenceLap.id;
    workspace.selectedLapIds = [selectedLap.id, referenceLap.id];
    workspace.automaticTheoreticalBestSeconds = 5;
    workspace.sectionResults = [
      sectionResult(selectedLap.id, 6, 80),
      sectionResult(referenceLap.id, 5, 90),
    ];

    renderLapAnalysis(workspace);

    expect(screen.getByRole("tab", { name: "Insights" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Biggest time-loss opportunities" })).toBeVisible();
    expect(screen.queryByText("Corner and straight definitions")).not.toBeInTheDocument();
  });

  it("keeps a neutral map section selected even when it is outside the top opportunities", async () => {
    const user = userEvent.setup();
    const workspace = emptyWorkspace();
    const selectedLap = { ...lapWithFlags(), id: "lap-selected", flags: [], durationSeconds: 20 };
    const referenceLap = { ...lapWithFlags(), id: "lap-reference", ordinal: 2, flags: [], durationSeconds: 10 };
    const sectionIds = ["corner-1", "corner-2", "straight-1", "straight-neutral"];
    const profile = {
      ...trackProfile(),
      sections: sectionIds.map((id, index) => ({
        id,
        name: id,
        kind: id.startsWith("straight") ? "straight" as const : "corner-right" as const,
        startDistanceMeters: index * 100,
        endDistanceMeters: (index + 1) * 100,
      })),
      analysisLine: { type: "LineString" as const, coordinates: [[128, 38], [128.001, 38.001]] },
    };
    workspace.gate = gate();
    workspace.profile = profile;
    workspace.analysisLine = profile.analysisLine;
    workspace.detection = { gate: workspace.gate, boundaries: [], laps: [selectedLap, referenceLap], warnings: [] };
    workspace.primaryLapId = selectedLap.id;
    workspace.referenceLapId = referenceLap.id;
    workspace.selectedLapIds = [selectedLap.id, referenceLap.id];
    workspace.automaticTheoreticalBestSeconds = 10;
    workspace.sectionResults = sectionIds.flatMap((sectionId, index) => [
      sectionResult(selectedLap.id, 5 + [3, 2, 1, 0.1][index], 80, sectionId),
      sectionResult(referenceLap.id, 5, 90, sectionId),
    ]);

    renderLapAnalysis(workspace);
    await user.click(screen.getByRole("button", { name: "Select neutral section" }));

    await waitFor(() => expect(screen.getByTestId("lap-route-map")).toHaveAttribute("data-neutral-color", "#7c3aed"));
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
  });
});

function renderLapAnalysis(workspace: LapWorkspace) {
  return render(
    <I18nProvider>
      <LapAnalysis
        fileName="session.Vta"
        points={[gps(0), gps(1)]}
        selectedPointIndex={0}
        onSelectedPointIndex={vi.fn()}
        sourceVisibility={{ rawGps: true, enhancedGps: false }}
        mapSettings={{ pointSize: 5, tileUrl: "tiles", speedThresholds: [10, 30, 50, 80] }}
        onMapSettingsChange={vi.fn()}
        onActiveSegment={vi.fn()}
        workspace={workspace}
      />
    </I18nProvider>,
  );
}

function emptyWorkspace(): LapWorkspace {
  return {
    lookupState: "idle",
    candidates: [],
    sectors: [],
    sectionResults: [],
    selectedLapIds: [],
    includePartialLapSectors: false,
    importProfile: vi.fn().mockResolvedValue(undefined),
    applyProfile: vi.fn(),
    chooseCandidate: vi.fn(),
    useSelectedPointAsStartFinish: vi.fn(),
    updateStartFinish: vi.fn(),
    addSectorGate: vi.fn(),
    updateSectorGate: vi.fn(),
    moveSectorGateToPoint: vi.fn(),
    reorderSectorGate: vi.fn(),
    removeSectorGate: vi.fn(),
    canProposeSections: false,
    canGenerateAutomaticSections: false,
    proposeSections: vi.fn(),
    recalculateAutomaticSections: vi.fn(),
    updateSection: vi.fn(),
    removeSection: vi.fn(),
    addBoundary: vi.fn(),
    removeBoundary: vi.fn(),
    setLapValidity: vi.fn(),
    toggleLapSelection: vi.fn(),
    setPrimaryLap: vi.fn(),
    setReferenceLap: vi.fn(),
    setIncludePartialLapSectors: vi.fn(),
    saveCurrentProfile: vi.fn().mockResolvedValue(undefined),
    resetProfileOverride: vi.fn().mockResolvedValue(undefined),
  };
}

function gps(index: number): GpsPoint {
  return {
    index,
    lineNumber: index + 1,
    rawLine: "",
    date: "01012026",
    time: "000000",
    latitude: 38 + index * 0.001,
    longitude: 128 + index * 0.001,
    altitudeMeters: 0,
    speedKmh: 80,
    bearingDegrees: 0,
    satelliteCount: 10,
    elapsedRealtimeNanos: index * 1_000_000_000,
    source: "RawGps",
    confidence: 1,
  };
}

function sectionResult(lapId: string, durationSeconds: number, exitSpeedKmh: number, sectionId = "corner-1") {
  return {
    id: `${lapId}-${sectionId}`,
    lapId,
    sectionId,
    name: sectionId,
    kind: sectionId.startsWith("straight") ? "straight" as const : "corner-right" as const,
    durationSeconds,
    entrySpeedKmh: 100,
    minimumSpeedKmh: 60,
    averageSpeedKmh: 80,
    maximumSpeedKmh: 110,
    exitSpeedKmh,
    fromPartialLap: false,
    eligibleForBest: true,
  };
}

function gate() {
  return {
    id: "start-finish",
    name: "Start / Finish",
    kind: "start-finish" as const,
    line: { type: "LineString" as const, coordinates: [[128, 37.99], [128, 38.01]] },
    forwardBearingDegrees: 90,
    widthMeters: 50,
  };
}

function lapWithFlags(): LapResult {
  return {
    id: "lap-1",
    ordinal: 1,
    completion: "complete",
    validity: "valid",
    flags: ["reverse-crossing", "missed-sector"],
    start: { id: "start", source: "auto", pointIndex: 0, elapsedSeconds: 0, coordinate: [128, 38] },
    end: { id: "end", source: "auto", pointIndex: 1, elapsedSeconds: 1, coordinate: [128.001, 38.001] },
    startIndex: 0,
    endIndex: 1,
    durationSeconds: 1,
    distanceKm: 0.1,
    averageSpeedKmh: 80,
    maxSpeedKmh: 80,
  };
}

function trackProfile(): TrackProfileV1 {
  return {
    schemaVersion: 1,
    id: "test-track",
    name: "Test track",
    centerline: { type: "LineString", coordinates: [[128, 38], [128.001, 38.001]] },
    direction: "unknown",
    startFinish: gate(),
    sectorGates: [{ ...gate(), id: "sector-1", name: "Sector 1", kind: "sector" }],
    sections: [],
    source: { kind: "user" },
    updatedAt: "2026-07-13T00:00:00.000Z",
  };
}
