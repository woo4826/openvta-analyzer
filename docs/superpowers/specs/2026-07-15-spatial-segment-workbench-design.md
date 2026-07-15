# Spatial Segment Analysis Workbench Design

## Goal

OpenVTA Analyzer must turn one locally loaded VTA recording into a map-first, segment-focused comparison workspace. A user chooses a saved corner, straight, or arbitrary A–B range and immediately sees every lap that traversed it, actual GPS trajectories, fastest and shortest recorded paths, synchronized telemetry, and a per-lap evidence table. Coach and opportunity-ranking language is removed from the primary workflow.

The product remains a zero-backend GitHub Pages application. Curated track definitions are hosted as versioned static JSON files. User edits stay local and override the curated definition without modifying deployed assets. If no hosted or locally saved track matches, the app generates an editable temporary track from the recording.

## Product principles

1. **One spatial scope everywhere.** The map, section ribbon, graphs, cursor, brush, table, and exports use the same centerline-progress range.
2. **Evidence before interpretation.** The UI shows speed, elapsed time, Delta-T, loss rate, trajectory, distance, and GPS quality without coaching claims.
3. **Every detected lap remains visible.** Complete, partial, invalid, and low-confidence laps keep explicit rows. A lap contributes metrics only when it actually covers both selected boundaries.
4. **Fastest is not shortest.** Fastest segment time, shortest recorded path, whole-lap fastest, and theoretical best are distinct labels.
5. **Curated by default, editable locally.** Hosted JSON definitions are immutable in the browser. Editing creates a local override with reset and export actions.
6. **Trackless is still useful.** Missing presets, failed OSM lookup, missing map tiles, and open-route recordings never block raw analysis.

## Primary workflow

After parsing a VTA file and detecting laps, the Lap Analysis view opens directly into a single **Segment Workbench** rather than Insights/Compare/Setup tabs.

The top bar contains:

- matched venue/layout and profile status;
- focused lap;
- reference mode, defaulting to the fastest eligible lap inside the selected scope;
- distance/time graph-axis toggle;
- a compact Setup action for track and gate editing.

Below it, a horizontal section ribbon lists corners and straights in track order. `All`, `Corners`, and `Straights` filters change the ribbon, table matrix, and current selection together. Selecting a section from the ribbon, map, table, or dropdown produces the same controlled `AnalysisScope`.

The main desktop layout contains a large map and a compact evidence inspector. Below it are synchronized graphs and the all-lap table. On mobile the product uses `Map`, `Graphs`, and `Laps` views while preserving the selected scope, focused lap, reference lap, cursor, and brush range across view changes.

## Shared analysis state

The workspace adds a single state contract:

```ts
export type AnalysisScope =
  | { kind: "whole-lap" }
  | { kind: "section"; sectionId: string }
  | {
      kind: "range";
      startDistanceMeters: number;
      endDistanceMeters: number;
      source: "map" | "chart" | "manual";
    };
```

`TrackSection` continues to describe persisted corner/straight ranges. `ActiveSegment` remains the raw source-index contract used by legacy tables, charts, and export. A scope adapter maps `AnalysisScope` to each lap's interpolated source indexes instead of merging these concepts.

The workspace distinguishes:

- `analysisLapIds`: all detected laps considered by tables and distribution statistics;
- `overlayLapIds`: at most five visible graph overlays;
- `focusedLapId`: the lap emphasized on map, graph, and table;
- `referenceLapId`: the comparison lap for Delta-T and time-slip-rate.

The focused and reference laps are always included in `overlayLapIds`.

## Static track preset system

Deployed assets use:

```text
public/tracks/index.v1.json
public/tracks/profiles/<track-layout>.<revision>.json
```

The index contains matching metadata only:

```json
{
  "schemaVersion": 1,
  "kind": "openvta-track-index",
  "generatedAt": "2026-07-15T00:00:00Z",
  "entries": [
    {
      "id": "kr-inje-speedium-full",
      "venueName": "Inje Speedium",
      "layoutName": "Full Course",
      "href": "profiles/inje-speedium-full.2026-07-15.json",
      "bbox": [128.28, 37.99, 128.30, 38.01],
      "lengthMeters": 3915,
      "direction": "clockwise",
      "revision": "2026-07-15",
      "quality": "curated"
    }
  ]
}
```

The app loads the index using `${import.meta.env.BASE_URL}tracks/index.v1.json`, filters entries by recording bounds and estimated lap length, fetches only likely profiles, validates them with the existing `TrackProfileV1` parser, and scores geometry before applying one.

Profile priority is:

1. profile explicitly chosen for the current recording;
2. local override/import with the same ID;
3. hosted static profile;
4. fresh cached OSM profile;
5. live OSM match;
6. recording-generated temporary profile.

Static fetch, validation, or checksum failure is non-fatal and falls through to the next source. Hosted profiles show `Built in`; edited copies show `Local override`; recording profiles show `Generated`. Reset removes only the local override. Export downloads the effective profile without uploading it.

The first hosted profile is Inje Speedium Full Course. Its geometry must come from a redistributable curated/OSM source with attribution; the supplied private VTA trace is not copied into `public/`.

## User track and boundary editing

Setup remains accessible without dominating analysis. It supports:

- moving start/finish to the selected route point;
- changing gate width and forward bearing;
- editing section name, kind, start, and end progress;
- creating a section from the current A–B range;
- regenerating automatic sections;
- importing/exporting profile JSON;
- resetting a local override to the hosted definition.

Changing start/finish requires confirmation because it recalculates lap boundaries, partial states, sector eligibility, reference choices, theoretical best, and all segment metrics atomically. The result summary reports before/after lap counts and fastest time. User edits save as a local override in IndexedDB.

When no profile matches, a repeatable start/finish is inferred only for a defensible closed course. The fastest valid complete lap becomes `analysisLine`, automatic corner/straight sections are generated, and the result stays editable and exportable. Open routes remain trackless unless the user explicitly creates gates or a point-to-point range.

## Segment trajectories and derived metrics

For every lap, GPS samples are projected to `analysisLine ?? centerline` and unwrapped to monotonic progress. The selected boundaries are interpolated so every trajectory begins and ends at the same progress even when source samples differ.

For a traversed scope, calculate:

- segment duration and Delta to best eligible result;
- actual driven path distance and delta to the shortest recorded path;
- entry, minimum, average, maximum, and exit speed;
- maximum GPS-derived deceleration and lateral G;
- cumulative elapsed time at progress;
- Delta-T against the reference, rebased to zero at scope start;
- local loss rate in seconds per 100 metres, derived from the rolling slope of Delta-T;
- signed lateral offset from the analysis line;
- GPS coverage and positional-confidence status.

Loss rate is smoothed over a configurable 25–50 metre distance window and masked when reference speed is too low or coverage is insufficient. It is not described as brake/throttle evidence.

Partial laps contribute only scopes whose two boundaries they cover. `includePartialLapSections` remains the remembered user control for whether valid partial-lap results can become Best Sector and contribute to theoretical best. It never hides the row or measurement.

## Map

The map displays the selected section in context and preserves the coordinate-only fallback when tiles fail.

- All valid traversing lap trajectories are thin and low-opacity.
- Focused and reference trajectories are emphasized with stable colors and different line styles.
- A translucent envelope communicates trajectory spread only when GPS accuracy is materially better than the spread.
- The focused lap receives a distance-aligned time-slip-rate gradient.
- Focused/reference Ghost markers represent the same track progress, not the same timestamp.
- Start/end gates and directly selected A–B boundaries are visible and keyboard accessible.
- Fastest and shortest recorded trajectories have separate badges.

Map click finds the nearest analysis-line progress and moves the shared cursor. Map range mode selects A then B and creates a temporary `range` scope.

## Graphs

The default distance-axis stack contains:

1. speed versus segment distance;
2. cumulative elapsed time versus segment distance;
3. Delta-T versus segment distance;
4. local loss rate versus segment distance.

Optional channels include signed line offset and GPS-derived longitudinal/lateral acceleration. Time-axis mode shows speed and distance against elapsed time while keeping the same source-index mapping.

All graphs share cursor, zoom, and brush state. Hover/click moves the two map Ghosts. Dragging in range mode creates a custom A–B scope; zoom remains a distinct control. Reset restores the saved section. The section ribbon is also rendered as a split band above the graphs.

## Per-lap table

The selected-scope table includes every detected lap and supports row focus. Columns are:

- lap and completion/validity state;
- segment time and Delta Best;
- actual path distance and delta to shortest;
- entry/minimum/average/exit speed;
- maximum derived deceleration/lateral G;
- coverage/GPS quality;
- Best eligibility.

Unavailable measurements show a reason instead of disappearing. Desktop allows column visibility controls; mobile defaults to lap, time, Delta, minimum speed, and state, with an expandable details row.

Above the table, distribution statistics show median, standard deviation, best-to-worst range, and complete/partial coverage counts. Selecting a row updates the map heat, Ghost pair, graph overlays, and evidence inspector.

## Removal and compatibility

The Opportunity/Coach overview is removed from the primary product and its ranking language is deleted from user-facing copy. Existing pure opportunity files may be deleted once no production or test imports remain.

Existing VTA parsing, calibration, transform modes, CSV headers, export schemas, timing-sector gates, TrackProfile v1 imports, and non-lap tabs remain compatible. New static-index and segment-analysis exports use separate versioned contracts.

## Failure behaviour

- Missing or invalid hosted index/profile: show a non-blocking source badge and continue with local/OSM/generated matching.
- Ambiguous preset match: show candidates; never silently choose.
- No complete lap: keep track/gate setup and any fully covered partial-scope measurements; no complete reference is invented.
- Low GPS quality: retain measurements, suppress racing-line envelope/shortest claims, and show low-confidence state.
- Missing map tiles: render coordinate fallback with trajectories, sections, gates, cursor, and selection.
- Invalid user range: normalize/clamp while editing and reject zero-length save.

## Acceptance evidence

Using `/Users/hajin-u/Downloads/VTA24082025_101142_CC00.Vta`:

- parse 1,589 GPS points;
- detect 7 complete laps, one partial-start, and one partial-end;
- generate 27 analysis sections on the current automatic line;
- show all seven complete C6 rows and both partial status rows;
- identify C6 Lap 2 as `11.507 s` Best, Lap 4 as `16.054 s` (`+4.547 s`), Lap 6 as `17.701 s` (`+6.194 s`), and Lap 7 as `13.389 s` (`+1.882 s`);
- prove section/map/table/graph selection stays synchronized;
- prove graph brush creates a custom scope and table values update;
- prove hosted profile, local override, reset, and generated fallback precedence;
- prove the remembered partial-lap Best policy affects eligibility and theoretical best without hiding rows;
- pass typecheck, lint, unit, build, browser E2E, desktop/mobile Aside QA, and GitHub Pages smoke testing without console errors or horizontal overflow.

