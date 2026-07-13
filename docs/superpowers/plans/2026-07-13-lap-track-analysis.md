# Lap And Track Analysis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add offline-capable lap, track-profile, timing-sector, and corner analysis for VTA recordings and deploy it to GitHub Pages.

**Architecture:** Pure domain modules own geometry, detection, profile validation, and metrics. A per-file React workspace orchestrates OSM lookup, persisted profiles, manual overrides, and the dedicated Lap Analysis UI while projecting one primary range into the existing `ActiveSegment` contract.

**Tech Stack:** TypeScript, React, Vite, Vitest, ECharts, MapLibre GL, IndexedDB, GeoJSON, OpenStreetMap Overpass.

---

### Task 1: Track profile and geometry foundation

- [ ] Add versioned profile, gate, section, lap-result, and analysis-setting types.
- [ ] Add strict JSON import validation and stable export formatting.
- [ ] Add local projection, distance, point-to-segment, line-crossing, interpolation, and route resampling helpers.
- [ ] Cover valid, malformed, unsupported-version, and geometry-edge cases with Vitest.

### Task 2: Lap detection and corrections

- [ ] Generate a 50 metre gate from a selected route point and local heading.
- [ ] Detect forward finite-line crossings with interpolated time and rearm rules.
- [ ] Build complete and partial laps and attach GPS-gap/sector-order flags.
- [ ] Apply manual boundary add/remove and lap-validity overrides without mutating parsed VTA data.
- [ ] Cover 1 Hz GPS, reverse travel, stationary jitter, missing crossings, partial fragments, and manual corrections.

### Task 3: Sector, corner, and comparison analysis

- [ ] Build timing-sector results from ordered gates.
- [ ] Resample laps onto a five-metre distance axis and calculate speed and Delta-T traces.
- [ ] Generate editable corner/straight proposals from smoothed curvature.
- [ ] Calculate lap, sector, and corner metrics and theoretical best.
- [ ] Default partial-lap sector eligibility to false and persist the user preference.

### Task 4: OSM lookup and profile persistence

- [ ] Query raceway/start-finish/pit geometry inside an expanded recording bounding box.
- [ ] Convert closed and connected raceway ways into layout candidates and score them against the recording.
- [ ] Add timeout, one fallback endpoint, ambiguous-candidate, malformed-response, offline, and no-match behavior.
- [ ] Cache profiles in IndexedDB and keep an in-memory/export fallback when storage is blocked.
- [ ] Preserve OSM IDs, attribution, and ODbL metadata through edits and exports.

### Task 5: Per-file workspace and Lap Analysis UI

- [ ] Add a per-file workspace hook that keeps the selected source, profile, gate, overrides, selected laps, and reference lap.
- [ ] Add a Lap Analysis tab between Overview and Charts.
- [ ] Add track lookup/setup, profile import/export, gate editing, lap correction, and section editing controls.
- [ ] Add the lap list, five-lap selection limit, primary/reference selection, map overlays, distance charts, and metric tables.
- [ ] Project the primary range into `ActiveSegment` without changing multi-lap comparison state.
- [ ] Render all overlays in both MapLibre and coordinate-fallback modes.

### Task 6: Export, localization, documentation, and deployment

- [ ] Add independent lap, sector, corner, analysis JSON, and track-profile downloads without changing existing contracts.
- [ ] Add every new message to all seven locale dictionaries.
- [ ] Update README and project handoff documentation, including Overpass privacy and offline behavior.
- [ ] Run typecheck, lint, unit/component tests, and production build.
- [ ] Use Aside for deployed desktop/mobile, OSM-success, OSM-failure, tile-failure, import/export, and lap-correction QA.
- [ ] Commit, integrate into `main`, push, monitor CI/Pages, and verify the deployed GitHub Pages URL.
