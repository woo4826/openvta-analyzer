# Roadmap And Handoff

Last updated: 2026-07-08

## 완료된 큰 단계

### Phase 1: GitHub Pages Web/PWA 방향 결정

결정:

- Chrome Extension보다 GitHub Pages Web/PWA를 우선합니다.
- 이유는 0원 운영, 설치 없는 접근, 공개 repo, 자동 배포, 오픈소스 유지가 동시에 맞기 때문입니다.
- 앱은 정적 브라우저 앱으로 유지하고, backend/server/account/database를 두지 않습니다.

### Phase 2: Legacy VTA_Road 분석과 실용 기능 재구축

분석 출처:

- `https://www.testcell3.com/vta-program.html`
- 하위/연결 페이지와 공개 문서 archive.
- legacy VTA Program PDF, VTALogger 문서, phone/IMU data format 문서.

구현된 핵심:

- `.Vta` parser for modern OpenVTA, legacy phone, standalone IMU box.
- `.zip` session import.
- file workspace tray.
- map route view, source toggle, point-size control, speed-colored route styling, coordinate fallback.
- selected point, segment, region summary.
- charts: velocity, distance, acceleration, orientation, friction circle, validation.
- tables: GPS, enhanced GPS, sensor, warnings, summary, validation, sort/filter/export visible rows.
- calibration: CAL/session/static-window/manual offsets.
- calibration presets with JSON import/export.
- acceleration low-pass filter.
- transform modes: raw/calibrated/filtered/compare.
- exports: original/transformed VTA, GPS CSV, sensor CSV, validation CSV, summary JSON, line endings.

### I18n 단계

구현:

- local i18n layer.
- English/Korean primary quality.
- Japanese/Simplified Chinese/Spanish/French/German secondary quality.
- language selector and persistence.
- tests for dictionary completeness and Korean workflow.

### Guided Onboarding Tour 단계

구현:

- first-run auto tour.
- skip/done persistence.
- Settings > Restart guide.
- desktop anchored callout and mobile bottom sheet.
- stable `data-tour` targets.
- sample-load path for users without a file.
- multilingual strings.
- unit/component/E2E coverage.

## 주요 설계 결정

- 제품은 analyzer이지 recorder가 아닙니다.
- 구버전 CAD 엔진 전체 복제는 하지 않습니다.
- RCM은 raw examples, formulas, licensing clarity가 생길 때까지 future module입니다.
- export contract는 stable English schema를 유지합니다.
- original parsed data는 immutable로 두고 transform view/export에서 calibrated/filtered data를 사용합니다.
- storage는 browser localStorage만 사용하고 optional로 취급합니다.
- map tile은 편의 기능이고, tile 실패 시 coordinate fallback이 핵심 safety path입니다.
- OpenVTA Live 통합은 private Live repo가 source sync/inline embedding으로
  담당합니다. public analyzer repo는 계속 zero-backend analyzer로 유지합니다.

## 현재 known gaps

- 2차 언어 번역은 native review를 거치지 않았습니다.
- RT-3000/Vericom/Smarty imports는 public format/sample 부족으로 deferred입니다.
- RCM calculation은 공식 raw examples/formulas 부족으로 deferred입니다.
- ECW/proprietary raster background는 browser decoding/licensing 이슈로 deferred입니다.
- map tile URL과 speed threshold 값은 `MapSettings` 타입에 있지만, durable storage와 전용 사용자 편집 UI는 아직 없습니다. 현재 사용자 UI는 point size 중심입니다.
- report/print-friendly summary와 PNG snapshot은 아직 full product feature가 아닙니다.
- multi-file comparison overlay는 legacy parity spec에 있지만 아직 구현되지 않았습니다. 현재 `Compare`는 한 파일 안에서 raw/calibrated/filtered sensor view를 비교하는 기능입니다.
- very large VTA file performance는 추가 profiling이 필요합니다.

## 다음 개발 추천 순서

0. OpenVTA Live sync compatibility
   - parser/export/local analyzer behavior를 바꿀 때 private `openvta-live`
     inline Analyzer 소비 경로가 깨지지 않는지 release note나 handoff에
     명시합니다.
   - Live credential, account, storage 기능은 이 public repo에 직접 추가하지
     않습니다.

1. 문서/도움말 강화
   - 앱 내부 Help 또는 docs 페이지를 추가할지 결정합니다.
   - guided tour와 README 사이의 간극을 줄입니다.

2. Map settings persistence
   - tile URL, point size, speed thresholds를 localStorage에 저장하고 필요한 사용자 편집 UI를 추가합니다.
   - privacy 문구와 Settings 메뉴를 같이 정리합니다.

3. Report export
   - browser print-friendly summary page.
   - current chart data CSV.
   - 가능하면 chart PNG export.

4. Large-file performance pass
   - parsing time, chart render time, table filtering/sorting을 측정합니다.
   - Web Worker 도입은 실제 병목 확인 후 결정합니다.

5. Translation QA
   - Korean 용어를 실제 사용자와 재검토합니다.
   - secondary language는 native review 또는 issue 기반 개선으로 관리합니다.

6. Legacy deferred imports research
   - RT-3000/Vericom/Smarty sample 확보.
   - RCM raw sample/formula 확보.
   - 확보 전에는 UI에 unsupported/deferred로 명확히 유지합니다.

## 다음 에이전트가 작업할 때 체크리스트

시작:

- `git status --short`로 사용자 변경을 확인합니다.
- `.gitignore`나 로컬 agent 설정 변경이 있으면 보존합니다.
- `README.md`, `AGENTS.md`, `docs/project-handoff/README.md`를 읽습니다.

기능 설계:

- product scope가 zero-backend/GitHub Pages와 충돌하는지 먼저 확인합니다.
- export schema나 data format을 바꾸면 backward compatibility를 문서화합니다.
- UI text를 추가하면 i18n key를 전체 언어에 추가합니다.

구현:

- domain logic은 `src/domain/`에 격리하고 unit test를 붙입니다.
- UI state는 필요 이상으로 `App.tsx`에 늘리지 말고, 커지면 focused hook/component로 분리합니다.
- target selector가 필요한 UI는 stable `data-*` attribute를 사용합니다.

검증:

- domain-only 변경: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
- UI interaction 변경: 위 명령 + `pnpm test:e2e`.
- 배포 변경: GitHub Actions CI/Pages 결과와 live URL 확인.
- Latest local baseline as of 2026-07-08 KST on commit `ffc5f31`: typecheck,
  lint, 66 Vitest tests, production build, and 14 Playwright tests passed.

문서:

- 새 기능이 제품 방향에 영향을 주면 `docs/project-handoff/`를 업데이트합니다.
- 세부 설계가 필요한 큰 기능은 `docs/superpowers/specs/`와 `docs/superpowers/plans/`에 남깁니다.

## 좋은 다음 이슈 후보

- Persist map preferences in localStorage.
- Add help/manual panel linked from Settings.
- Add print-friendly analysis summary.
- Add chart data export per active chart.
- Add performance benchmark fixture for large VTA files.
- Add translation QA issue template.
- Add unsupported import research notes for RT-3000/Vericom/Smarty/RCM.
