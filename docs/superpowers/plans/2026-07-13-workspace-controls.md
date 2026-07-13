# Workspace Controls Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the workspace inspector accurately expose available GPS sources, meaningful sensor transforms, and an actionable segment reset.

**Architecture:** `App` remains the state and capability owner and passes counts and readiness flags into the presentational `WorkspaceStatus`. The component disables non-operative choices, explains transform scope, links to the existing Calibration tab, and resets an active segment through existing callbacks.

**Tech Stack:** React, TypeScript, Vitest, Testing Library, existing OpenVTA i18n and UI components.

---

### Task 1: Specify unavailable and actionable workspace states

**Files:**
- Create: `src/components/__tests__/WorkspaceStatus.test.tsx`
- Modify: `src/components/WorkspaceStatus.tsx`

- [ ] Add a component test with raw GPS count `1589`, enhanced GPS count `0`, sensors present, no calibration, filter disabled, and an active segment. Assert enhanced, calibrated, filtered, and compare controls are disabled; the raw source remains active; the displayed range is one-based; setup and reset actions invoke their callbacks.
- [ ] Run `./node_modules/.bin/vitest run src/components/__tests__/WorkspaceStatus.test.tsx` and confirm the new expectations fail before implementation.
- [ ] Add explicit capability props and render counts, disabled states, transform-scope help, calibration setup, and segment reset without mutating state inside the component.
- [ ] Rerun the focused test and confirm it passes.

### Task 2: Wire current file capabilities from App

**Files:**
- Modify: `src/app/App.tsx`
- Modify: `src/i18n/locales.ts`

- [ ] Pass raw/enhanced/sensor counts, calibration readiness, filter readiness, visible point count, and a callback that activates the Calibration tab.
- [ ] Add all new workspace messages to the English base dictionary and all six additional locale dictionaries.
- [ ] Run `./node_modules/.bin/tsc -b` and `./node_modules/.bin/eslint . --max-warnings=0` and resolve any contract or locale gaps.

### Task 3: Verify with the supplied recording and full regression suite

**Files:**
- Modify only if verification exposes a defect.

- [ ] Load `/Users/hajin-u/Downloads/VTA24082025_101142_CC00.Vta` directly during local verification and confirm raw GPS is available, enhanced GPS is unavailable, and the disabled state is understandable.
- [ ] Confirm transform setup opens Calibration and an active lap/map segment can be reset to the full 1,589-point route.
- [ ] Run `./node_modules/.bin/vitest run`, `./node_modules/.bin/tsc -b`, `./node_modules/.bin/eslint . --max-warnings=0`, `./node_modules/.bin/vite build`, and `git diff --check`.
