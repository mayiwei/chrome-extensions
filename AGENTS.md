# AGENTS.md — Chrome Extensions Repository

## Project Overview

A monorepo for Chrome extensions. Currently contains one extension:

- **alertmanager-chrome-extension/** — Chrome Manifest V3 extension that monitors Prometheus
  Alertmanager instances with multi-instance support, real-time notifications, badge counts,
  and a full monitoring dashboard (alerts, silences, status).

## Tech Stack

- **Platform**: Chrome Extension (Manifest V3), minimum Chrome 110
- **Language**: Vanilla JavaScript (ES2020+, no TypeScript, no build step)
- **Styling**: Plain CSS with CSS custom properties (no preprocessor)
- **Module system**: `importScripts()` in service worker; `<script>` tags in HTML pages
- **Dependencies**: Zero external dependencies — no npm, no bundler, no framework
- **APIs**: Chrome Extensions API (`chrome.storage`, `chrome.alarms`, `chrome.notifications`,
  `chrome.action`, `chrome.runtime`), Alertmanager API v2

## Build / Lint / Test Commands

There is **no build step, no bundler, no test framework, and no linter configured**.

```bash
# Load the extension in Chrome for manual testing:
# 1. Open chrome://extensions
# 2. Enable "Developer mode"
# 3. Click "Load unpacked" and select alertmanager-chrome-extension/

# No commands exist for:
# npm install / npm run build / npm test / npx eslint
```

If adding tooling in the future, consider:
- `web-ext lint` for extension manifest validation
- ESLint with `env: { browser: true, webextensions: true }`
- Vitest or Jest for unit testing `lib/` modules (they export via `globalThis`)

## Directory Structure

```
alertmanager-chrome-extension/
  manifest.json              # Extension manifest (MV3)
  background/
    service-worker.js        # Background polling, alarms, notifications, message handling
  lib/
    storage.js               # Chrome storage wrapper (sync + local), settings, instance CRUD
    alertmanager-api.js       # Alertmanager v2 API client (alerts, silences, status)
    utils.js                  # Shared utilities (severity, formatting, filtering, sorting)
  popup/
    popup.html               # Browser action popup UI
    popup.js                  # Popup logic — alert dashboard, filtering, detail view
    popup.css                 # Popup styles
  options/
    options.html              # Settings page (opens in tab)
    options.js                # Settings logic — instance management, preferences
    options.css               # Settings styles
  icons/
    icon16.png, icon48.png, icon128.png
```

## Code Style Guidelines

### JavaScript

- **Strict mode**: All page scripts use IIFE wrappers with `'use strict'`
- **No modules**: Service worker uses `importScripts()`; HTML pages use `<script>` tags
- **Global exports**: Library modules attach to `globalThis` (e.g., `globalThis.Storage = Storage`)
- **Object literal pattern**: Core modules (`Storage`, `AlertmanagerAPI`, `Utils`) are plain
  object literals — not classes, not constructor functions
- **Async/await**: All async code uses async/await (no raw `.then()` chains except in
  message listeners that require `return true` for async `sendResponse`)
- **Arrow functions**: Used for callbacks and short lambdas: `(a) => a.status?.state`
- **Optional chaining**: Used liberally: `alert.status?.state`, `alert.labels?.severity`
- **Template literals**: Preferred for string building, including HTML templates
- **JSDoc comments**: All public methods have JSDoc with `@param`, `@returns`, `@typedef`
- **Const by default**: Use `const` for all declarations; use `let` only when reassignment
  is needed. Never use `var`.

### Naming Conventions

- **Variables/functions**: `camelCase` — `pollAlerts`, `currentSeverityFilter`, `renderAlertList`
- **Constants**: `UPPER_SNAKE_CASE` — `ALARM_NAME`, `NOTIFICATION_ID_PREFIX`, `DEFAULT_SETTINGS`
- **Module objects**: `PascalCase` — `Storage`, `AlertmanagerAPI`, `Utils`
- **DOM references**: Collected into a single `dom` object at the top of each page script
- **CSS custom properties**: `--clr-*` for colors, `--radius`, `--shadow`
- **CSS class names**: `kebab-case` — `alert-card`, `connection-dot`, `sev-btn`
- **HTML IDs**: `camelCase` — `alertList`, `searchInput`, `instanceSelector`
- **Data attributes**: `kebab-case` — `data-tab`, `data-severity`, `data-fingerprint`

### Formatting

- **Indentation**: 2 spaces
- **Semicolons**: Always
- **Quotes**: Single quotes for JS strings; double quotes in HTML attributes
- **Trailing commas**: Used in multi-line object/array literals
- **Max line length**: ~120 characters (soft limit)
- **Braces**: Same-line opening brace (K&R style)
- **Blank lines**: One blank line between functions/methods; no multiple consecutive blank lines

### HTML

- Semantic structure: `<header>`, `<nav>`, `<section>`, `<footer>`
- Scripts loaded at end of `<body>`, order matters: `storage.js` -> `alertmanager-api.js` -> `utils.js` -> page script
- No inline `<script>` or `<style>` blocks (CSP compliance)

### CSS

- CSS custom properties defined in `:root` for theming
- Tailwind-inspired color palette (slate, blue, red, amber, green)
- BEM-lite naming — flat selectors preferred, no deep nesting
- Universal reset: `* { margin: 0; padding: 0; box-sizing: border-box; }`
- System font stack: `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- Transitions on interactive elements (buttons, cards, dots)

### Error Handling

- API errors: `try/catch` with graceful fallback to cached data
- Service worker logs errors to console: `console.error('[Alertmanager Monitor] ...')`
- Badge shows `!` on poll failure with gray background `#6b7280`
- Options page validates form inputs with inline error messages and `.invalid` class
- `AlertmanagerAPI.testConnection()` returns `{ success, message }` — never throws
- `_fetch()` wraps native fetch with AbortController timeout (default 10s)

### Security

- All user-generated content passed through `Utils.escapeHtml()` before DOM insertion
- External links use `target="_blank" rel="noopener"`
- `host_permissions: ["*://*/*"]` — required for arbitrary Alertmanager URLs
- Credentials stored in `chrome.storage.sync` (encrypted by Chrome at rest)

### Chrome Extension Patterns

- **Message passing**: `chrome.runtime.onMessage` with `sendResponse` + `return true` for async
- **Storage**: `chrome.storage.sync` for settings; `chrome.storage.local` for cached data
  (alerts, silences, fingerprints) to avoid sync quota limits
- **Alarms**: Single alarm `alertmanager-poll` for periodic polling; minimum 0.5 min interval
- **Notifications**: Up to 5 individual notifications, then a batch summary for >5 new alerts
- **Badge**: Dynamic text (active count) and color (red/amber/blue/green) based on alert severity

### Adding a New Extension

1. Create a new top-level directory (e.g., `my-new-extension/`)
2. Include a `manifest.json` with `manifest_version: 3`
3. Follow the same directory structure: `background/`, `lib/`, `popup/`, `options/`, `icons/`
4. Use the same code style and patterns as `alertmanager-chrome-extension`

### Common Gotchas

- Service worker `importScripts()` paths are relative to the extension root, not the worker file
- `chrome.action.openPopup()` may not exist in all Chrome versions — use optional chaining
- `chrome.storage.sync` has a quota (~100KB); use `chrome.storage.local` for bulk data
- Message listeners must `return true` to indicate async `sendResponse` usage
- Alarm minimum period is 30 seconds (0.5 minutes) in Manifest V3
