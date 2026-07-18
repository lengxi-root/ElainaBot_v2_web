---
name: testing-elainabot-web
description: How to run and UI-test the ElainaBot_v2_web admin panel (Vue 3 + naive-ui + Vite) without a backend, using mocked APIs and fake login.
---

# Testing ElainaBot_v2_web without a backend

- Dev server: `npm run dev` in the repo root → http://localhost:5173/web/ (base path is `/web/`).
- There is usually NO backend. Mock all `/api/**` with Playwright route interception connected over CDP (`chromium.connectOverCDP('http://localhost:29229')`). Register routes at the **browser context** level (`ctx.route('**/api/**', ...)`) so mocks survive SPA navigation, and keep the node script alive (`await new Promise(()=>{})`) while interacting with the visible browser.
- API envelope: `{ success: true, ... }`. `src/utils/api.js#responsePayload` unwraps `body.data` if a `data` key exists, otherwise returns the body itself. Update page reads `version` (not `current_version`) from `/api/update/version`.
- Fake login: open `/web/login`, run `localStorage.setItem('elaina_token','anything')`, then navigate to any route. The router guard redirects `/web/login` back to `/web/` while the token exists; logout button (top-right last icon) clears it.
- Plugins page mocks: `/api/plugins/scan-dirs` → `{success, dirs:[{directory, enabled, is_large, is_system, meta, commands, files}]}`; `/api/modules/scan` → `{success, modules:[...]}`.
- Database page: 全库搜索/执行 SQL buttons are `:disabled="!dbPath"` — you must expand the bot node in the left tree (click the expand arrow) and click a .db file to enable them. Mock `/api/database/list` (databases) and `/api/database/tables`.
- Update success dialog: mock POST `/api/update/start` → success, GET `/api/update/progress` → `{is_updating:true, stage:'updating'}` once or twice, then `{is_updating:false, stage:'completed', progress:100}`. Click 检查更新 (with `/api/update/check` → `has_update:true`) then 一键更新到最新.
- Chinese IME text cannot be typed via xdotool `type`; use ASCII strings that hit the same code path (e.g. search plugin directory names like "music").
- WS/SSE: `src/utils/ws.js` falls back to SSE (`/api/sse/panel`) after 2 WebSocket failures (~3s reconnect delay each). Verify via `performance.getEntriesByType('resource')`.
- naive-ui is registered on-demand in `src/main.js`; when pages change, check console (warnings, not just errors) for `Failed to resolve component: n-*` on every route: `/web/`, `/web/logs`, `/web/plugins`, `/web/database`, `/web/openapi`, `/web/messages`, `/web/statistics`, `/web/market`, `/web/config`, `/web/update`, `/web/login`.

## Devin Secrets Needed
None — fake token login is sufficient for frontend-only testing.
