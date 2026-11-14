MIPS 0.3.4 - local-test prerelease

Includes merged PRs #144-#146 since desktop-v0.3.3. Feature baseline: a1541d557b58ec1e50d44b1730fbcb5b77536147. The final release tag commit and installer SHA256 must be recorded at publication.

Desktop changes:
- Start the application maximized and fill the display.
- Save AS Excel exports through the native Windows Save As dialog, retaining selected rows and ledger formatting. Cancellation, duplicate clicks and failures are handled explicitly.

Matching ERP server changes:
- Replace the AS attachment selector with a 180px upload area, centered upload icon and Korean label, and the 20MB-per-file / 10-files-per-request hint.
- Remove the Previous button; use the numbered steps to revisit earlier form sections.

Installer migration: verified per-user Process ERP registrations and owned desktop/start-menu shortcuts are migrated to MIPS, including installations where both names exist. Existing taskbar link targets, icons and descriptions are updated in place. Only the two known legacy managed files are removed; settings and other files remain. Conflicting shortcuts or locked legacy files defer cleanup instead of removing unrelated files.

Migration scope: standard per-user shortcuts are covered. A pinned shortcut retains its existing filename to preserve the pin; Windows may retain a cached label. Custom renamed shortcuts are not rewritten. Native fixture checks use silent update installation with an explicit destination; a live upgrade/relaunch from the user's 0.3.2 process is not part of that fixture verification.

Connects to http://127.0.0.1:3000/ on the same PC. Server files are separate and are not deployed by installing this app. No production deployment is included.

Validation: desktop checks 17/17, AS workflow checks 19/19, AS intake and Excel selection browser checks passed. Signed Windows build and actual WebView2 smoke passed (maximized launch, update gate, zoom, Excel bridge, login, attachments, preview and logout). Seven isolated native installer cases passed, including repeated updates and preservation of user files: old-only, both installed, MIPS-only, same-path, unrelated shortcuts, shortcut collision and destination junction. The fixture also rejects installation outside its designated directory. Publication hashes are recorded before release.
Database changes: none. ERP data and attachments are not packaged or overwritten.
Recovery: retain earlier immutable installers. Restore the previous test-channel manifest to stop further upgrades. Already upgraded apps require manual reinstall or a higher-version corrective release. App rollback does not restore server data.
