# Product And UX

Last updated: 2026-07-08

## 제품 목표

OpenVTA Analyzer는 오래된 VTA_Road Windows 프로그램이 제공하던 실용적인 차량 궤적 분석 기능을 현대적인 웹 도구로 재구축합니다. 사용자는 설치 없이 GitHub Pages URL을 열고 `.Vta` 또는 `.zip` 세션 파일을 분석할 수 있어야 하며, 모든 처리는 브라우저 안에서 끝나야 합니다.

초기 논의에서 Chrome Extension, GitHub Pages Web/PWA, 별도 앱 배포를 비교했고, 현재 조건에서는 GitHub Pages Web/PWA를 선택했습니다. 이유는 비용 0원, 자동 배포, 공개 repo 운영, 설치 없이 사용, 오픈소스 유지가 동시에 가능하기 때문입니다.

## 목표 사용자

- VTA Logger 또는 유사 APK/장비에서 추출한 VTA 파일을 확인하는 개발자.
- 차량 주행/센서 데이터를 지도, 차트, 테이블로 검토해야 하는 분석 사용자.
- 구버전 VTA_Road가 더 이상 잘 동작하지 않거나 배포/지원이 어려워 대체 도구가 필요한 사용자.
- 공개 저장소에서 기능을 검증하고 개선할 오픈소스 기여자.

## UX 원칙

- 첫 화면은 랜딩 페이지가 아니라 실제 분석 도구여야 합니다.
- UI는 엔지니어링 분석 도구처럼 조용하고 밀도 있게 구성합니다.
- 파일을 올리기 전에도 개인정보 모델과 샘플 사용 경로가 명확해야 합니다.
- 파일을 올린 뒤에는 file tray, overview, chart, table, calibration, export로 자연스럽게 이동해야 합니다.
- 초보 사용자는 guided onboarding tour로 실제 UI를 따라 배웁니다.
- 모바일에서도 문구와 버튼이 넘치지 않아야 하며, tour는 bottom-sheet 형태로 안정적으로 보여야 합니다.

## 현재 사용자 흐름

1. 사용자가 GitHub Pages 앱을 열거나 로컬 dev 서버를 엽니다.
2. `.Vta` 또는 `.zip` 파일을 드롭하거나, built-in sample을 로드합니다.
3. file tray에서 active file, detected format, row count, warning count를 확인합니다.
4. Overview에서 route map, selected point, segment, region, warning summary를 봅니다.
5. inspector에서 raw GPS/enhanced source, transform mode, segment 상태를 조정합니다.
6. Charts에서 velocity, distance, acceleration, orientation, friction circle, validation 흐름을 봅니다.
7. Tables에서 GPS/enhanced/sensor/warning/summary/validation row를 검색, 정렬, export합니다.
8. Calibration에서 CAL 파일, 현재 파일, static window, manual offset, preset, low-pass filter를 다룹니다.
9. Export에서 original segment VTA, transformed segment VTA, GPS CSV, sensor CSV, validation CSV, summary JSON을 다운로드합니다.

## 기존 VTA_Road 대비 범위

현재 제품은 legacy VTA_Road의 실용적인 VTA 분석 기능을 목표로 하고, CAD 엔진 전체 복제는 목표가 아닙니다.

지원하는 분석 범위:

- modern OpenVTA, legacy phone, standalone IMU box `.Vta` parsing.
- `.zip` 안의 `.Vta` session import.
- raw GPS와 enhanced GPS source toggle.
- speed-colored route map과 tile 실패 시 coordinate fallback.
- map/chart/numeric 기반 segment 선택.
- velocity, altitude, accuracy, acceleration, orientation, friction circle, validation chart.
- GPS, enhanced, sensor, warning, summary, validation table.
- CAL/session/static-window/manual 기반 calibration offset estimation.
- named calibration preset 저장, JSON import/export.
- acceleration channel low-pass Butterworth filtering.
- LF/CRLF line ending export.

의도적으로 제외한 범위:

- CAD drawing/editing/layer/block/plugin 기능.
- proprietary ECW background support.
- RT-3000, Vericom VC4000, Smarty BX-1000 import.
- Road Condition Monitoring 계산.
- server-side upload, hosted file storage, account, database, telemetry.
- OpenVTA Live account/device/storage workflows inside this public analyzer
  repo. Those belong to the private `openvta-live` user/admin apps that embed
  analyzer behavior.

## Guided Onboarding Tour

guided tour는 첫 방문 사용자가 실제 UI 위에서 분석 흐름을 배우도록 만든 기능입니다.

- 첫 방문 시 자동 표시됩니다.
- Skip 또는 Done을 누르면 다시 자동 표시되지 않습니다.
- Settings 메뉴의 Restart guide로 다시 실행할 수 있습니다.
- 파일이 없으면 Open Data 단계에서 built-in sample 로드를 권장합니다.
- 파일이 필요한 단계는 active file이 없을 때 건너뛰거나 sample action으로 이어집니다.
- desktop은 target highlight + anchored callout, mobile은 bottom-sheet callout을 사용합니다.

Tour 단계:

1. Welcome and privacy.
2. Open data.
3. File workspace.
4. Overview.
5. Workspace inspector.
6. Charts.
7. Calibration.
8. Export.

구현 기준 문서:

- `docs/superpowers/specs/2026-06-29-guided-onboarding-tour-design.md`
- `src/app/tourSteps.ts`
- `src/components/GuidedTour.tsx`

## 다국어 UX

언어 선택은 top bar에 있고 즉시 적용됩니다. 현재 언어:

- `en`: English, 기본이자 source of truth.
- `ko`: Korean, 1차 품질.
- `ja`: Japanese, 2차 품질.
- `zh-CN`: Simplified Chinese, 2차 품질.
- `es`: Spanish, 2차 품질.
- `fr`: French, 2차 품질.
- `de`: German, 2차 품질.

현지화하지 않는 것:

- export CSV headers.
- export JSON keys.
- generated VTA metadata headers.
- file format names.
- units.
- parsed source data.
- user file names.

이 경계는 downstream tool compatibility를 위한 것입니다.

## 개인정보와 신뢰

앱은 client-side only입니다. 파일은 브라우저 File API로 읽고 메모리에서 파싱합니다. 앱 자체는 VTA 파일, GPS rows, sensor rows, calibration values, selected segment, exports를 서버로 보내지 않습니다.

주의할 점은 map tile입니다. 기본 interactive map은 OpenStreetMap-compatible tile URL을 사용하므로 tile provider는 일반적인 tile request 정보를 볼 수 있습니다. VTA 파일 내용 자체는 tile provider로 보내지 않지만, 보이는 viewport에 대한 tile 요청은 발생할 수 있습니다. tile privacy가 중요하면 coordinate fallback을 사용하거나 신뢰하는 내부 tile endpoint를 설정하는 방향으로 개선해야 합니다.
