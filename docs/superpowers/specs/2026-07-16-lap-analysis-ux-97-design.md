# Lap Analysis UX 97 Design

## Objective

Raise the production Lap Analysis experience to a strict minimum score of
97/100 using the supplied `VTA24082025_101142_CC00.Vta` recording. The score is
the lowest result from three independent reviewers, not an average. A passing
round also requires zero Critical and zero Major findings.

The implementation keeps the map-first, zero-backend workflow and does not
restore the removed time-loss ranking.

## Baseline evidence

Three independent read-only audits used the deployed app and the supplied VTA.
After correcting one snapshot-only false positive with DOM and layout evidence,
the scores were 70, 72, and 80. The strict baseline is therefore 70/100.

The recording auto-matched Inje Speedium, produced seven complete laps and a
closing fragment, exposed a GPS time-gap warning, and synchronized GPS with
sensor-clock IMU samples.

### Confirmed Major issues

1. The proportional section strip creates 7–29 px targets and drops most names.
2. Corner selection changes the analysis but leaves the map at whole-track
   scale and can leave the selected raw marker outside the active scope.
3. Focus/reference semantics are inconsistent: primary evidence shows delta to
   session best while the screen promises a selected-reference comparison.
4. Map and telemetry are separated by a long page, so the synchronized spatial
   result cannot be seen while inspecting the chart.
5. Device-axis ownership, orientation, sign convention, and gravity inclusion
   are unexplained.
6. Telemetry detail is pointer-only and has no keyboard point traversal.
7. Lap Analysis state is discarded on a normal top-level tab round trip.
8. Mobile map-layer and route controls overlap and several targets are smaller
   than 44 px.
9. Analysis and lap-layer panels do not provide reliable initial focus, Escape,
   containment, or focus restoration.
10. Low-GPS coaching stops at a generic warning and presents implausible
    GPS-derived G values without a nearby reliability qualification.

## Product principles

- Preserve the large map and the focused/reference red-solid/blue-dashed visual
  language.
- Make the primary workflow visible without opening an advanced drawer.
- Compare the focused lap directly to the selected reference; keep session-best
  values as explicitly secondary evidence.
- Never invent a driving cause from low-confidence GPS.
- Keep pointer interaction fast while providing equivalent keyboard access.
- Retain local-only file processing and existing track preset behavior.
- Do not add a ranked “Biggest time-loss sections” widget or opportunity list.

## Primary workflow

The first workbench controls become a persistent comparison toolbar:

1. Focused-lap selector, with lap label, time, and completion state.
2. Reference-lap selector, limited to eligible complete laps and including time.
3. Pairwise selected-scope result, labelled `Focused − Reference` with ahead or
   behind wording.
4. Current scope, previous-section, next-section, and advanced-settings actions.

Immediately below it, the existing section ribbon becomes part of the visible
workflow. It exposes Whole lap, All/Corners/Straights filters, and horizontally
scrollable named chips with at least 44 px height and usable widths. Arrow-key
navigation selects adjacent sections. The proportional track strip remains a
non-interactive spatial overview above the custom range slider inside advanced
settings.

Focus, reference, filter, axis, and scope survive top-level tab round trips.
`LapAnalysis` remains mounted for the active file while expensive map and chart
resources are released through the existing `active` path.

## Map behavior

The comparison map receives explicit fit points from the focused trajectory.
Whole-lap scope fits the focused lap; section and custom-range scopes fit the
active focused segment. Scope or focused-lap changes refit once without making
subsequent live cursor updates recenter the viewport.

If the global selected point falls outside the new focused trajectory, the
cursor and selected source index reset to that scope’s first sample. If the
point remains inside the new scope, it is preserved. Fit route uses the same
scope-aware points.

The map continues to use lap-identity colors rather than speed colors. Its
accessible label changes from the misleading “Speed-colored route plot” to a
lap-trajectory comparison description. Mobile places lap-layer controls in a
dedicated row and gives every route control a 44 px target.

## Telemetry and simultaneous spatial context

The chart continues to show speed, focused-lap measured Device X/Y/Z, and
Delta-T. Supporting copy defines:

- `Delta-T = Focused − Reference`;
- negative Delta-T means the focused lap is ahead;
- Device X/Y/Z belongs to the focused lap’s sensor-clock synchronization;
- axes remain device coordinates, are not vehicle-aligned, and Z can include
  gravity.

The chart container is focusable. Left/Right moves one trajectory sample,
PageUp/PageDown moves a larger step, and Home/End selects the first/last sample.
The same live readout is exposed with `aria-live`.

A compact, non-tiled track inset appears with telemetry. It draws focused and
reference scope paths and synchronized markers at the cursor distance. This
preserves the large map while making spatial position visible during chart
inspection.

## Pairwise evidence and data quality

The focused evidence widget starts with a selected-reference comparison:

- focused time and reference time;
- pairwise time delta with ahead/behind wording;
- entry, minimum, and exit speed differences;
- driven-path difference.

Delta to session best remains available but is labelled `To session best`.
Peak loss-rate remains secondary and is never presented as reference delta.

For low GPS confidence, the coach card lists the concrete available reason,
such as a GPS time gap or missing accuracy, and offers a direct Track & lap
setup action. It may state caveated observations but continues to withhold
causal coaching. GPS-derived lateral/deceleration G values render as unreliable
instead of numeric values when confidence is low or unknown.

Whole-lap labels distinguish track definition length from comparable recorded
coverage when they differ, instead of presenting two unlabeled conflicting
numbers.

## Panels, feedback, and responsive behavior

The Analysis controls trigger moves into the persistent toolbar. Opening it
adds a document-level state so the complete workspace, including tabs and
warnings, shifts right on wide screens. On narrow screens it overlays with a
scrim. The panel receives initial focus, contains keyboard focus, closes on
Escape, and restores focus to its trigger.

The lap-layer panel receives the same focus entry, Escape, containment, focus
restoration, and viewport-bounded scrolling. Mobile panel and map toolbar rows
do not overlap.

CSV and JSON exports publish a short in-app completion status containing the
generated filename.

## Architecture

- `LapAnalysis` receives `active` and remains mounted from `App` for the active
  file.
- `SegmentAnalysisWorkbench` owns persistent comparison/scope UI, pairwise
  evidence, export feedback, and scope-safe cursor synchronization.
- `SegmentScopeRibbon` is the primary section selector.
- `SegmentRangeNavigator` keeps custom-range control but makes its proportional
  strip presentational.
- `RouteMap` gains scope-aware fit points and selected-point resolution.
- `SegmentTrajectoryMap` provides focused fit points and the comparison map
  label.
- `ChartPanel` exposes keyboard cursor actions without coupling itself to lap
  samples.
- `SegmentTelemetryChart` resolves keyboard movement to focused trajectory
  samples and renders explanatory copy plus a compact track inset.
- A small reusable focus-containment hook supports both panels.

## Failure handling

- Missing focused/reference records render an em dash and disable unavailable
  comparison actions.
- Empty trajectories do not attempt fitting or keyboard traversal.
- The compact inset renders an explicit unavailable state for fewer than two
  usable coordinates.
- Export status is only announced after `downloadText` is invoked.
- Low-confidence GPS never yields an unqualified G value or causal action.

## Verification and score loop

Every implementation batch must pass focused component tests before the next
batch. The final local gate is:

- `pnpm typecheck`
- `pnpm lint`
- `pnpm test`
- `pnpm build`
- `pnpm test:e2e`

Aside then loads the supplied VTA on desktop and mobile-sized layouts to verify
the primary workflow, map fitting, cursor synchronization, keyboard operation,
panel focus, state persistence, and non-overlapping controls.

Three independent reviewers repeat the fixed 100-point rubric:

- information architecture: 15;
- lap/segment navigation: 15;
- comparative map readability: 15;
- telemetry interaction/synchronization: 20;
- actionability: 15;
- discoverability/feedback: 10;
- accessibility/responsiveness/reliability: 10.

If the lowest score is below 97 or any reviewer reports a Critical or Major
issue, the main thread performs another evidence-driven fix and re-evaluation
round. Deployment occurs only after the gate passes.

