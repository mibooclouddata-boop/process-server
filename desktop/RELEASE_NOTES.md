Process ERP 0.2.2 - local-test prerelease

- Fit the landing particle graphic inside compact app windows, with a safe margin throughout animation.
- Keep the artwork inside the right edge of the window.
- Bundle the corrected landing assets in the desktop installer.

Validation: cover motion tests (10), desktop unit tests, and browser screenshots at 1000x700, 1280x720, 1440x960.
No database changes or production server deployment. ERP remains on http://127.0.0.1:3000/.
Recovery: retain desktop-v0.2.1 installer; channel recovery does not roll back ERP data.
