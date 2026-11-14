Process ERP 0.3.2 - local-test prerelease

- Keep the landing page visible after every successful startup update check, including ordinary launches and after updates. Open login only when the user clicks access.
- Regression coverage: no automatic access event after the check; clicking access starts the connection. Native smoke checks no longer seed a post-update flag to hold the landing page.

- Fix landing particle clipping in compact windows; bundle the corrected assets.
- Validate particle containment with 10 motion tests and packaged startup at three window sizes.

Includes PR #125 and PR #126, based on main commit 1fefb52663bcf4c9d07f4a1bf8b5f44010f289a8.

- Integrate startup and mandatory updates into the ERP cover screen (#125).
- Show three dots throughout update installation; remove the wave flash when entering ERP.
- Remove update percentages and release details from the startup screen.
- Keep the access button on every launch, including offline retry and after updates.
- Hide the upper-right account icon in the server-provided ERP interface (#126).

Connects to http://127.0.0.1:3000/ on the same PC. The ERP server is separate: #126 requires its matching server files and is not deployed by installing the app.
No database changes or production server deployment. Existing 0.2.1 apps receive the release through the mandatory test-channel updater after publication.
Validation: desktop UI/unit tests, Windows native icon checks, native build and isolated WebView2 smoke checks. Release workflow repeats desktop tests and verifies the executable before creating the draft.
Recovery: retain previous versioned assets. Restore the previous test-channel manifest to stop further upgrades; already upgraded apps require manual reinstall or a higher-version corrective release. App rollback does not restore ERP data.

0.3.2 contains the 0.3.1 landing fit fix plus the startup access correction. Release target is the exact reviewed desktop-v0.3.2 tag commit. Record the full SHA and installer SHA256 at publication.
