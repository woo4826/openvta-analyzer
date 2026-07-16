# Unified Segment Scope and Drag Zoom Design

## Problem

Lap Analysis currently exposes the same analysis scope through two separate
surfaces. `SegmentScopeRibbon` selects whole-lap or stored sections in the main
workbench, while `SegmentRangeNavigator` repeats the scope and custom-range
controls inside the Analysis controls drawer. The duplicate presentation makes
it unclear which control owns the current range and makes stale or apparently
unchanged drawer text especially confusing when a user selects a section.

The three telemetry charts share wheel/slider zoom state, cursor position, and
map position, but the chart split stopped enabling horizontal brush selection.
Users can no longer drag across a graph to zoom into the selected interval.

## Product Decision

The main workbench gets one authoritative `SegmentScopeNavigator`. It replaces
both the chip-only ribbon and the drawer range navigator. The Analysis controls
drawer keeps secondary policy and layout settings, but no longer presents a
second analysis-range editor.

The navigator contains:

- the All/Corners/Straights filter;
- a scope summary with the active name and exact meter range;
- a precise section select for short sections that are difficult to click;
- a track-length-proportional section strip whose section widths reflect their
  actual distances;
- two range handles on the same strip for custom ranges;
- explicit whole-lap reset and previous/next section navigation.

Section click, select change, previous/next navigation, and range-handle commit
all update the same `AnalysisScope` owned by `useSegmentWorkbench`. The draft
slider range is presentation-only and is synchronously reset whenever the
authoritative scope, profile, or total track length changes.

## Telemetry Drag Zoom

Every Speed, Delta-T, and measured-acceleration chart enables a horizontal
`lineX` brush. A completed drag converts the selected domain interval into one
normalized zoom window and supplies it to all three chart options. The brush is
cleared after the zoom is applied so the next drag works immediately.

Dragging changes only the chart viewport. It does not create a new analysis
scope or change sector calculations. Hover continues to move the shared cursor
and map marker. A visible `전체 보기`/`Show all` action appears while zoomed and
restores all three charts to 0–100 percent.

## Dynamic Track Length and Fallback Profiles

All navigator geometry uses the active profile/analysis-line distance passed by
the workbench; no Inje-specific length is embedded in the component. Hosted
presets, imported profiles, local overrides, and generated no-preset tracks use
the same code path. Invalid or out-of-bounds section ranges are clamped for
presentation without mutating the saved profile.

If there are no stored sections, the navigator still supports whole-lap and
custom-range selection. The section select and section filter remain disabled or
empty instead of blocking analysis.

## Additional Review Scope

The implementation review is limited to Lap Analysis interaction paths touched
by the change: scope ownership, range synchronization, chart zoom event loops,
cursor synchronization, responsive overflow, keyboard access, and unavailable
telemetry states. Unrelated analyzer features and export contracts remain
unchanged.

## Verification

- Component tests prove section/select/range controls share one scope and use
  dynamic lengths, including a 4028 m non-preset track.
- Chart tests prove a brush in any metric updates all three zoom windows and the
  reset action restores them.
- Hook/domain tests retain whole-lap, section, custom-range, filtering, and
  missing-section behavior.
- Full typecheck, lint, unit tests, build, and repository end-to-end tests pass.
- Aside browser QA loads
  `/Users/hajin-u/Downloads/VTA24082025_101142_CC00.Vta`, selects multiple Inje
  sections, confirms the integrated meter range, drag-zooms each chart, checks
  shared zoom/cursor/map behavior, and verifies responsive layout.

