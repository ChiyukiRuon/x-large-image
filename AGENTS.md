# Repository Guidelines

## Project Structure & Module Organization

This dependency-free Chromium Manifest V3 extension adds one download button to X posts. Keep the workflow inside that button; do not introduce preview pages or settings without a request.

- `manifest.json`: extension registration and permissions.
- `content.js` / `content.css`: tweet detection, button styling, and status messages. Success and failure messages reset after two seconds.
- `background.js`: sender validation and download requests.
- `core.js`: URL validation and horizontal layout calculations.
- `seams.js`: bounded detection of solid or faded seam columns.
- `stitch.js`: original-image fetching, seam cropping, and PNG encoding using `OffscreenCanvas`.
- `tests/`: Node unit tests and a Chromium smoke test.

## Build, Test, and Development Commands

No dependency installation or build step is required. Load the repository root through **Load unpacked** in Chrome or Edge's extension developer mode. Reload the extension and refresh X after changes.

- `npm test`: run Node's built-in test runner over `tests/*.test.mjs`.
- `npm run test:browser`: run the local Chromium smoke test; requires Node.js 24 and Chrome at the default Windows path. Set `XLI_BROWSER` for another Chromium executable.
- `node --check content.js`: check JavaScript syntax; repeat for changed scripts.

Use `npm.cmd` if PowerShell blocks `npm.ps1`. No formatter or linter is configured.

## Coding Style & Naming Conventions

Use four-space indentation, single-quoted JavaScript strings, and no statement-ending semicolons. Use camelCase for functions and variables, PascalCase for types, and lowercase or kebab-case filenames. If introducing TypeScript, use `import type` for type-only imports. Follow existing shared `XLargeImage` module conventions.

Keep human-facing documentation in Chinese under `docs/`, agent-facing documentation in English under `agent-docs/`, and the root README as the project entry point.

## Testing Guidelines

Name unit tests `*.test.mjs`. Cover meaningful changes to seam detection, image ordering, validation, and layout. No numerical coverage threshold is configured. The browser smoke test mocks CDN responses and Chrome APIs; disclose gaps in real-X, service-worker, and disk-download verification.

## Commit & Pull Request Guidelines

Use Conventional Commits, such as `fix(stitch): remove narrow seam columns`, with brief English subjects. Do not commit or push without explicit instruction.

PRs should explain the problem, resulting behavior, validation commands, and relevant issues. Include screenshots for visual changes and disclose remaining browser or live-site verification gaps.
