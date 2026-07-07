# Operations And Deployment

Last updated: 2026-07-08

## 로컬 개발

저장소 루트:

```bash
cd /Users/hajin-u/Developer/openvta/openvta-analyzer
pnpm install
pnpm dev
```

Vite는 `127.0.0.1` host로 실행되도록 설정되어 있습니다. 출력된 URL을 사용하세요.

## 검증 명령

기본 검증:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

브라우저 워크플로 검증:

```bash
pnpm exec playwright install chromium
pnpm test:e2e
```

UI, 접근성, tour, map/chart/table/export 흐름을 바꾸면 E2E까지 실행하는 것이 기준입니다.

## CI

`.github/workflows/ci.yml`

트리거:

- pull_request.
- push to `main`.

실행 순서:

1. checkout.
2. Node 22 setup.
3. pnpm 11.7.0 setup.
4. `pnpm install --frozen-lockfile`.
5. Playwright Chromium install.
6. `pnpm typecheck`.
7. `pnpm lint`.
8. `pnpm test`.
9. `pnpm build`.
10. `pnpm test:e2e`.

## GitHub Pages 배포

`.github/workflows/pages.yml`

트리거:

- push to `main`.
- manual `workflow_dispatch`.

흐름:

1. `pnpm install --frozen-lockfile`.
2. `pnpm build`.
3. `dist/`를 Pages artifact로 업로드.
4. GitHub Pages environment에 deploy.

배포 URL:

- <https://woo4826.github.io/openvta-analyzer/>

비용:

- public repository 기준 GitHub Pages와 GitHub Actions 무료 사용을 전제로 합니다.
- 별도 서버, DB, secret, object storage가 없습니다.

## 릴리스 체크리스트

기능 변경 전:

- `AGENTS.md` guardrail 확인.
- 관련 `docs/superpowers/specs/`와 `docs/project-handoff/` 확인.
- export schema나 localStorage key를 바꾸는지 확인.

구현 중:

- domain logic은 가능한 한 `src/domain/`에 두고 unit test를 먼저 보강합니다.
- UI text는 `src/i18n/locales.ts`에 key를 추가하고 모든 언어를 채웁니다.
- 새 interaction은 Playwright에서 사용자가 실제로 누르는 방식으로 검증합니다.

merge/push 전:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

push 후:

- GitHub Actions CI success 확인.
- Deploy Pages success 확인.
- live URL HTTP 200 확인.
- 핵심 흐름 1회 수동 확인: sample load, language switch, tour restart, export panel.
- OpenVTA Live inline Analyzer에 영향을 줄 수 있는 parser/export/UI shell
  변경이면 private `openvta-live` sync/update 작업과 별도 검증이 필요합니다.
  이 저장소의 Pages 배포 성공만으로 Live 통합 성공을 의미하지는 않습니다.

## Troubleshooting

Playwright browser가 없을 때:

```bash
pnpm exec playwright install chromium
```

Map tile 요청이 테스트를 불안정하게 만들 때:

- E2E에서는 `https://tile.openstreetmap.org/**` route를 abort하여 coordinate fallback을 검증합니다.
- 실제 앱에서는 tile unavailable message와 fallback plot이 보여야 합니다.

localStorage가 막힌 환경:

- language, calibration presets, onboarding tour는 persistence가 안 될 수 있습니다.
- 앱은 crash하지 않아야 합니다.
- 관련 helper는 `src/domain/settings.ts`와 `src/i18n/locales.ts`에 있습니다.

Vite base path 문제:

- GitHub Pages project site는 `/openvta-analyzer/` path 아래에서 동작합니다.
- local dev와 Pages 모두에서 asset path가 깨지지 않도록 Vite 설정을 변경할 때 주의합니다.

E2E에서 onboarding tour가 기존 테스트를 가릴 때:

- 일반 workflow test는 `openvta.onboardingTour.v1`을 completed 상태로 seed합니다.
- tour test는 storage를 비우고 첫 방문 흐름을 검증합니다.
