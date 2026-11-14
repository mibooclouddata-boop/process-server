# Required desktop update implementation plan

> **For agentic workers:** Use executing-plans; preserve unrelated working changes.

**Goal:** Ship a signed local-test desktop prerelease with mandatory startup updates and the supplied Miboo logo.
**Architecture:** Native Rust checks a public GitHub channel manifest before ERP navigation. A bundled local screen owns retry/install; remote ERP receives no update privilege. GitHub Actions builds signed immutable installers; channel metadata points to an approved release.
**Tech Stack:** Tauri 2 updater, NSIS, GitHub Actions/Releases, Node test + Playwright.
**Spec:** User-approved mandatory startup update design in this conversation; no Later button, no forced interruption during work. Local-test prerelease explicitly chosen.

## Global constraints
- No production server deployment, no business data in Git, no private signing key in Git.
- PR merge requires explicit approval for this PR. Prepare draft release before merge; publish only the approved release commit after merge.
- Desktop version 0.2.0; release tag desktop-v0.2.0; test channel separate from future stable.
- Checking failure blocks entry with Retry; closing the application remains possible. No check during active ERP work.
- Initial existing 0.1.2 installations require one manual upgrade.

## Review focus
- Update bypass via reconnect or navigation before check succeeds.
- Network error, malformed manifest, invalid signature must not unlock ERP or install.
- Duplicate button clicks/concurrent checks must not run parallel installs.
- New version must preserve installed app identity and local zoom settings.
- Channel publication must never point to missing/unpublished assets or leak signing keys.

## Tasks
- [x] Add tests for local update UI states, error/retry, safe release notes; native gate state tests.
- [x] Implement Rust startup update gate, local progress/retry/install UI and navigation/reconnect guards. Retain rounded window, drag, zoom.
- [x] Convert supplied PDF-compatible AI logo to display/icon assets; inspect actual output.
- [x] Configure signed prerelease build workflow, version validation and channel manifest generation; document publishing and key custody.
- [ ] Run browser tests, Rust tests/build, actual WebView2 smoke with isolated fixtures including mandatory gate. Review final branch directly; no independent review claimed.
- [ ] Commit only desktop/workflow/docs changes, push, create draft PR and draft prerelease; configure GitHub signing secret. Ask user for explicit PR merge approval before publishing the approved release/channel.

## Execution record
- Baseline: isolated from origin/main fb29c41; existing desktop source copied without build artifacts. Other workspace modifications untouched.
- Ruling: user asked to create release, but repository policy explicitly requires PR-specific merge approval before release. Prepare draft assets and PR first; actual publish follows that approval.

- Verification: 8 browser/Node tests pass; signed NSIS build succeeds; WebView2 smoke passes native gate, failed check/retry, invalid signature rejection, forbidden remote update command, zoom, login, session, attachments, preview, download and logout. Successful installer upgrade/relaunch remains acceptance testing.
