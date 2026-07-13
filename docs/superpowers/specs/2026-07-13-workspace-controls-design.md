# Workspace Controls Normalization Design

## Problem

The workspace inspector exposes GPS sources, sensor transform modes, and the
active segment as if every option is immediately actionable. In a legacy VTA
recording, enhanced GPS can be absent. Calibration is initially unset and the
low-pass filter is initially disabled, so calibrated and filtered modes can
produce the same sensor array as raw mode. The segment card is read-only. These
states make valid button events look broken.

## Design

Keep the existing global workspace state and make its prerequisites explicit.
`WorkspaceStatus` receives source row counts, sensor row count, calibration and
filter availability, and the visible point count from `App`.

- A GPS source with zero rows is disabled and its row count is shown.
- At least one available GPS source remains active.
- Calibrated mode is disabled until calibration offsets exist.
- Filtered mode is disabled until filtering is enabled.
- Compare mode is disabled until calibration or filtering can produce a
  non-raw series.
- A setup action opens the existing Calibration tab.
- Help text states that transforms affect sensor charts, tables, and exports,
  not GPS or lap geometry.
- The segment card displays its one-based range against the visible point count
  and offers a reset action when a segment is active.

No default calibration or filter is applied automatically. This avoids silently
changing analysis values. Lap detection continues to use the selected GPS rows.

## State And Error Handling

`App` remains the state owner. `WorkspaceStatus` only reports capability and
emits existing callbacks. Loading a new file already resets transform mode to
raw. Disabled controls carry accessible labels and visible help, so missing
enhanced GPS, calibration, filtering, or sensor rows is not treated as an error.

## Verification

Component tests cover unavailable source disabling, transform prerequisites,
calibration navigation, source switching, one-based segment display, and
segment reset. Browser QA uses the supplied legacy VTA to confirm 1,589 raw GPS
rows, zero enhanced rows, transform prerequisites, and reset behavior without
copying the file into the repository.
