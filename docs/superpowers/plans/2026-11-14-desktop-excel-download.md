# Desktop AS list Excel download

> **For agentic workers:** Use executing-plans to implement these tasks inline.

**Goal:** Save the existing AS list ledger Excel from the desktop app using Windows Save As.

**Architecture:** An injected desktop click handler forwards Excel blob bytes to a narrowly scoped native command. The native dialog chooses the destination and an atomic temporary-file replacement protects existing files. Browser exports and ledger generation remain unchanged.

**Tech Stack:** Tauri 2, Rust, native dialog plugin, HTML/CSS/JavaScript, Playwright.

**Spec:** User clarification: AS 목록 Excel 다운로드가 앱에서 동작하지 않는 문제를 수정. Attachment concepts are excluded.

## Global Constraints
- Preserve current ledger bytes and existing browser downloads.
- No release, deployment, database changes, or live attachment changes.
- Remote ERP receives only the save-excel command, no general filesystem access.

## Review Focus
- Cancel must create no file; a failed write must preserve an existing destination.
- Repeated clicks must not open multiple dialogs.
- Only configured ERP origins may call the command.
- Malformed names and oversized payloads must fail before a dialog opens.
- Existing browser download behavior must continue to work.

## Tasks
- [x] Add failing browser checks for Excel interception, bytes, cancellation, errors, duplicate clicks, and ordinary-link pass-through.
- [x] Implement the desktop Excel handler, native validation/save command, restricted capability, and native unit tests.
- [x] Run browser tests, native compilation/tests, existing desktop tests, and actual Windows Save As with fixture ledger content.
- [ ] Review the final PR, report checks, and request approval for that PR before merging.
