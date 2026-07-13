# Lap And Track Analysis Design

## Goal

OpenVTA Analyzer must turn one VTA recording into lap, timing-sector, and corner analysis while preserving its zero-backend workflow. Analysis must remain usable when no track profile exists, when OpenStreetMap lookup fails, and when map tiles are unavailable.

## Product Flow

1. Parse the VTA locally and choose exactly one GPS source for lap analysis. Enhanced GPS is preferred when available; otherwise raw GPS is used.
2. Search cached track profiles, then automatically query OpenStreetMap around the recording bounds when the cache is missing or stale.
3. Match a clear circuit-layout candidate. If no candidate is reliable, remain in trackless mode.
4. Use a profile start/finish gate when present. Otherwise let the user select a route point and create a 50 metre directional gate perpendicular to the local travel heading.
5. Detect directional gate crossings, retain incomplete session fragments, and calculate laps.
6. Let the user edit the gate, add or remove lap boundaries, and include or exclude laps.
7. Show up to five laps on a distance-normalized map and speed/delta-time chart.
8. Generate editable corner/straight sections and timing-sector gates, then calculate lap, sector, and corner metrics.
9. Save reusable track profiles in IndexedDB and share them as `.openvta-track.json` files.

## Privacy And Offline Behavior

VTA rows never leave the browser. Automatic OpenStreetMap lookup sends only an expanded bounding box around the recording to public Overpass endpoints. The privacy notice must disclose that track lookup and map tiles expose an approximate viewed location to their providers.

OpenStreetMap, track-profile, and tile failures are non-fatal. The existing coordinate fallback must render the recording, directional gates, sections, and selected lap overlays without a basemap.

## Track Profile

The versioned JSON profile uses WGS84 GeoJSON geometry and records:

- circuit and layout identity;
- centerline and direction;
- start/finish, timing-sector, pit-in, and pit-out gates;
- distance-based corner and straight sections;
- optional pit-lane geometry;
- OpenStreetMap element IDs, attribution, license, and fetch time.

OSM-derived profiles retain ODbL attribution after user edits and export. Invalid or unsupported profile versions never replace existing data.

## Lap Detection

A gate is a finite line with an allowed forward bearing. A crossing is valid when a consecutive GPS segment crosses the gate in the forward direction and within the gate endpoints. Crossing time is interpolated between samples. The gate rearms only after at least five seconds and sufficient distance from the line.

The data before the first crossing and after the last crossing is retained as partial-start or partial-end. A session with no crossings is partial-both. GPS gaps, wrong sector order, and reverse crossings produce visible flags rather than silent deletion.

Manual edits are session-local: users can add a boundary at the selected point, remove a boundary to merge laps, and change validity. Editing the start/finish gate requires confirmation and clears boundary overrides before recalculation.

## Sections And Comparisons

Timing sectors are bounded by directional gates. Corners and straights are stored as centerline distance ranges. A representative valid complete lap is resampled every five metres and smoothed to propose sections; users can edit boundaries, names, and direction.

The dedicated Lap Analysis tab provides:

- lap status, duration, distance, speed, and fastest-lap delta;
- selection and overlay of up to five laps;
- a pinned complete reference lap and distance-based Delta-T;
- sector time, best-sector delta, and theoretical-best lap;
- corner entry, minimum, and exit speed plus available acceleration metrics;
- a remembered setting controlling whether valid sectors from incomplete laps are eligible for Best Sector and theoretical best. It defaults to excluded.

A primary lap, sector, or corner is projected to the existing `ActiveSegment` so current tables, charts, and exports continue to work. Additional comparison laps remain local to the Lap Analysis workspace.

## Compatibility

Existing VTA parsing, CSV headers, summary JSON keys, generated VTA metadata, calibration, transform modes, and segment exports remain unchanged. New reports use separate English-schema CSV/JSON downloads. All new UI strings are added to every supported locale.

