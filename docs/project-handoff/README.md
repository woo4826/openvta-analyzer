# OpenVTA Analyzer Project Handoff

Last updated: 2026-07-08

이 디렉토리는 OpenVTA Analyzer를 다른 에이전트나 개발자가 이어서 개발할 수 있도록 정리한 핸드오프 문서입니다. 기존 `docs/superpowers/`는 기능별 설계/구현 계획의 원본 기록이고, 이 문서는 현재 제품 상태, 아키텍처, 운영 방법, 남은 로드맵을 한곳에서 빠르게 파악하기 위한 진입점입니다.

## 한 줄 요약

OpenVTA Analyzer는 구버전 VTA_Road Windows 프로그램의 실용적인 VTA 분석 워크플로를 브라우저 기반 Web/PWA로 대체하는 프로젝트입니다. `.Vta`와 `.zip` 세션 파일을 사용자의 브라우저 안에서만 파싱하고, GitHub Pages로 0원 자동 배포하며, 공개 저장소 기반으로 유지합니다.

## 현재 상태

- 배포 모델: public GitHub repository + GitHub Actions + GitHub Pages.
- 앱 URL: <https://woo4826.github.io/openvta-analyzer/>
- 저장소: <https://github.com/woo4826/openvta-analyzer>
- 런타임: React 18, TypeScript, Vite, Vitest, Playwright.
- 비용 구조: 서버, DB, 계정, 스토리지, 유료 API 없이 0원 운영을 목표로 함.
- 개인정보 모델: VTA/GPS/센서 파일은 브라우저 메모리에서만 처리하고 앱 서버로 업로드하지 않음.
- 다국어: 영어/한국어 1차 품질, 일본어/중국어 간체/스페인어/프랑스어/독일어 2차 품질.
- 최신 주요 기능: guided onboarding tour, settings replay, VTA/ZIP 분석, 맵/차트/테이블/보정/필터/내보내기.
- 최신 원격 검증: commit `712d15f`의 GitHub Actions `CI`와 `Deploy Pages`
  workflow가 2026-07-03 UTC에 성공했습니다.

## 문서 맵

- [Product And UX](./product-and-ux.md): 목표 사용자, UX 원칙, 기존 VTA_Road 대비 범위, 현재 기능.
- [Architecture](./architecture.md): 코드 구조, 상태 흐름, 도메인 모듈, 저장 키, i18n, 테스트 구조.
- [Operations And Deployment](./operations-and-deployment.md): 로컬 개발, 검증 명령, CI/Pages 배포, 릴리스 체크리스트.
- [Roadmap And Handoff](./roadmap-and-handoff.md): 완료된 단계, 주요 결정, 남은 작업, 다음 에이전트 작업 순서.

## 원본 설계 기록

상세 설계와 구현 계획은 아래 문서를 기준으로 이어 보면 됩니다.

- `docs/superpowers/specs/2026-06-28-legacy-vta-feature-parity-and-ux-design.md`
- `docs/superpowers/plans/2026-06-28-legacy-vta-ux-redesign.md`
- `docs/superpowers/specs/2026-06-28-i18n-language-support-design.md`
- `docs/superpowers/plans/2026-06-28-i18n-language-support.md`
- `docs/superpowers/specs/2026-06-29-guided-onboarding-tour-design.md`
- `docs/superpowers/plans/2026-06-29-guided-onboarding-tour.md`

## 이어서 개발할 때 첫 10분

1. 저장소 루트에서 `pnpm install`을 실행합니다.
2. `pnpm dev`로 로컬 앱을 띄우고 Vite가 출력한 `http://127.0.0.1:.../` URL을 확인합니다. 로컬 개발 base path는 `/`이고, GitHub Actions 배포 빌드에서만 `/openvta-analyzer/` base path를 사용합니다.
3. `README.md`, `AGENTS.md`, 이 디렉토리의 문서를 읽습니다.
4. 기능을 고치기 전에 관련 도메인 모듈과 테스트를 먼저 찾습니다. 예: 파싱은 `src/domain/parser.ts`, 보정은 `src/domain/calibration.ts`, tour는 `src/components/GuidedTour.tsx`.
5. 변경 후 최소 검증은 `pnpm typecheck && pnpm lint && pnpm test && pnpm build`입니다.
6. UI/브라우저 동작이 바뀌면 `pnpm test:e2e`도 실행합니다.

## 핵심 유지 원칙

- zero-backend 모델을 깨지 않습니다.
- GitHub Pages에서 정적 파일만으로 동작해야 합니다.
- 사용자 VTA/GPS/센서 데이터는 외부로 전송하지 않습니다.
- export 스키마, CSV 헤더, JSON 키, VTA 메타데이터는 호환성 때문에 함부로 현지화하지 않습니다.
- 영어와 한국어는 제품 품질 기준으로 유지하고, 2차 언어도 누락 없이 TypeScript shape를 맞춥니다.
- 구버전 CAD 기능 전체를 복제하지 않습니다. VTA 분석에 필요한 기능만 제품 범위로 둡니다.
- OpenVTA Live의 user/admin inline Analyzer는 private `openvta-live`에서
  이 저장소의 공개 analyzer/parsing 동작을 소스 동기화해 소비합니다. 이
  공개 저장소에는 계정, 서버 업로드, object storage, Live credential 처리를
  추가하지 않습니다.
