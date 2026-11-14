MIPS 0.3.3 - local-test prerelease

Includes merged PRs #132-#142 since desktop-v0.3.2. Feature baseline: 4a6a5db035643bc7d2129c345654d3cb4286a6a9. The final versioned tag commit and installer SHA256 will be recorded at publication. Published tags and installers are immutable.

Desktop changes:
- Rename the application to MIPS, retaining app identity, settings and the star icon.
- Refine startup corners, update checks and access/login transition motion.

Matching ERP server changes:
- Apply Pretendard on the first login visit without a refresh.
- Refine all three AS intake stages, material fields, wording and footer buttons.
- Disable delivery date entry for on-site work and remove redundant hints.
- Explicit calendar selection confirmation, cancel without changes, input clear button, stronger date contrast and compact week layout.
- Single-line AS Excel exports with ledger formatting.

Connects to http://127.0.0.1:3000/ on the same PC. ERP server files are separate and are not deployed by installing this app. Server improvements require the matching reviewed server source. No production HTTPS server or production deployment is included.

Release validation covers desktop unit/UI checks, native build and isolated WebView2 smoke checks, AS intake/calendar browser checks and AS workflow tests. Final outcomes are recorded at publication. The release workflow repeats desktop checks, signs the installer and verifies the Windows executable.

Database changes: none. ERP records and attachments are not packaged or replaced.
Recovery: retain previous versioned assets. Restore the previous test-channel manifest to stop further upgrades; already upgraded apps require manual reinstall or a higher-version corrective release. App rollback does not restore ERP data.
