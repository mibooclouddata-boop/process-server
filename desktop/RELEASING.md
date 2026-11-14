# Desktop release operations

## Current channel

- Repository: `mibooclouddata-boop/process-server` (public).
- App identity remains `com.processserver.erp`; NSIS installs for the current Windows user.
- Desktop release: `desktop-v0.2.0`, local-test prerelease, connects to `http://127.0.0.1:3000/`.
- Update endpoint: `https://github.com/mibooclouddata-boop/process-server/releases/download/desktop-test-channel/latest.json`.
- `desktop-test-channel` is an explicitly mutable metadata pointer, not a versioned application release. Its `latest.json` may be replaced; versioned installers and `desktop-vX.Y.Z` tags must never be replaced or moved.
- Stable distribution must use a separate channel and an HTTPS ERP URL with `npm run build`. Do not distribute this debug/local-test build as production.

## User flow and trust boundary

On startup, the local screen checks the channel over HTTPS. A newer version blocks navigation to ERP. The user can start the mandatory update or exit the application; there is no Later option. Checking/download/verification failures show Retry and never unlock ERP. Successful download signatures are verified by the Tauri updater before installation. No update check interrupts an active ERP session.

The Rust process owns the update object, concurrency lock and navigation gate. The remote ERP gets only window-dragging permission. Reconnect cannot skip the gate. Debug tests can supply a loopback update endpoint using `PROCESS_UPDATE_URL`; production binaries ignore that environment variable. The local-test build is a functional preview, not an anti-tampering mechanism.

Existing 0.1.2 users install the first updater-enabled version manually. Zoom settings are preserved through the unchanged app identity. ERP records and attachments live on the server and are not packaged in installers.

## Key custody

The public verification key is committed in `src-tauri/tauri.conf.json`. The private signing key is stored in repository Actions Secret `TAURI_SIGNING_PRIVATE_KEY`; never print it, put it in a PR, or add it to Git. Keep a separate secure backup of the generated key. GitHub Secrets cannot export it for recovery. Losing it prevents signing updates accepted by existing installations.

The current local backup is in the ignored project artifacts directory `desktop-signing/test.key`. This directory is not part of a clone or release. Transfer that backup to the organization's approved secret backup before retiring this PC.

Updater signatures authenticate downloaded updates. They are not Windows Authenticode signatures and do not remove SmartScreen reputation warnings.

## Prepare a version

1. Change the same version in `desktop/package.json`, its lockfile, `src-tauri/Cargo.toml`, its lockfile and `src-tauri/tauri.conf.json`. Update `RELEASE_NOTES.md`.
2. Run `npm test --prefix desktop`; build and run `node desktop/smoke.cjs` with isolated fixture data. Review the source and PR. Do not include live data.
3. Push a work branch and prepare a draft PR. Obtain explicit approval for that PR's merge into `main`.
4. After merging, choose the exact reviewed commit and create `desktop-vX.Y.Z` on it. Pushing this tag runs `Desktop signed prerelease`: tests, signed NSIS build, manifest generation, draft GitHub prerelease. There is no automatic main-branch server deployment.
5. Inspect draft assets, commit, version, test results and release notes. A draft is not an active update. Never edit/replace an already published installer; issue the next version.
6. With release publication approval, manually run `Publish approved desktop test release` on `main`, supplying the exact tag. It verifies the release commit belongs to main and the manifest/asset names match, publishes the installer first, then replaces test-channel metadata.
7. Verify the public endpoint and download, install on a test PC, confirm the new version launches, and record the result.

For the initial bootstrap, a locally verified signed installer and manifest may be attached to a draft prerelease whose `targetCommitish` is the full reviewed branch SHA. The publish workflow accepts this only after that exact commit is an ancestor of main. Merge that PR with a merge commit; if squash/rebase changes the SHA, rebuild the draft from the merged commit before publishing. Draft creation does not authorize merge.

## Failure and recovery

If publication stops between publishing assets and updating the channel, installed users stay on the previous channel version; rerun the publication workflow for the same approved release. Keep previous release assets. Remove a faulty version from the channel before preparing a higher corrected version. Existing installations do not automatically downgrade; a code rollback must be released with a higher app version. App rollback does not restore server data.

The initial channel must be published before distributing 0.2.0. Until then its mandatory startup check intentionally blocks entry. GitHub outages also block a fresh login; this follows the chosen mandatory policy.

## Verification limits

Local tests cover UI states, native gating, invalid signature rejection, login/session, attachments, preview/download and zoom. A full successful installer upgrade/relaunch in a clean Windows user profile and production HTTPS connectivity still require release acceptance testing. Existing user installations are not overwritten by smoke tests.

The logo assets were rendered from the supplied `miboo_heavy_industries.ai`: the star symbol is used for the app icon and the Korean wordmark for startup. The Illustrator original and its metadata are not shipped.
