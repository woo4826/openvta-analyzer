# OpenVTA Analyzer

OpenVTA Analyzer is a zero-backend Web/PWA workspace for VTA trajectory files. It parses `.Vta` and `.zip` session exports locally in the browser, visualizes route and sensor data, supports segment export, and includes Phase 2 calibration and low-pass filtering tools.

## Features

- Modern OpenVTA, legacy phone, and standalone IMU box VTA parsing.
- `.zip` import for sessions containing `.Vta` files.
- Speed-colored route view with OpenStreetMap-compatible interactive tiles and a coordinate fallback.
- Velocity, altitude, accuracy, acceleration, velocity+acceleration, orientation, and friction-circle charts.
- GPS/enhanced/sensor table inspection.
- CAL-file or session-based calibration offset estimation.
- 2nd-order low-pass Butterworth filtering for acceleration channels.
- Segment `.Vta`, GPS CSV, sensor CSV, and summary JSON export.
- Client-side only: traces are not uploaded by the app.

## Development

```bash
pnpm install
pnpm dev
```

Verification:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
```

## Deployment

The app is designed for GitHub Pages. The `Deploy Pages` workflow builds `dist/` on `main` and publishes it through GitHub Pages. Keep the repository public to preserve zero-cost Pages and Actions usage.

## Privacy

Files are opened through browser APIs and parsed in memory. The app does not send GPS traces, sensor rows, calibration files, or exports to a server. Map tiles are requested only for the visible interactive map viewport.

## Scope

Included: Phase 1 core VTA analyzer and Phase 2 calibration/filtering.

Deferred: CAD editing tools, RT-3000/Vericom/Smarty imports, proprietary ECW backgrounds, and Road Condition Monitoring calculations.

