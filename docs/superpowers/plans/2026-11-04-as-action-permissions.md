# AS action permissions implementation plan

User-approved policy: system administrators have all four AS permissions; other existing and new users receive permissions individually. Keep the pending roster layout changes.

## Design
- Store `asPermissions` separately from legacy process `allowedSteps`. Keys: `create`, `production`, `painting`, `delivery`. Missing/empty means no write permissions; active system administrators bypass individual assignments.
- Keep AS reading available to authenticated active staff. AS registration permission covers create/edit/delete/restore and the initial production request. Each stage completion/save requires the permission for the current stage, never the destination stage.
- Use one browser/server permission helper. Server enforcement occurs inside the write transaction, before changes or cached-write replay. Do not trust UI or request-supplied role/permissions.
- User steering: no roster checkboxes. Add a Permissions tab next to Account management in the user detail dialog; place four individually labelled checkboxes there. System administrator boxes are checked and locked. Save through the existing system-administrator-only user API. Use the existing serialized autosave and explicit failed-save/reload state; prevent concurrent stale updates and keep account activation independent.
- Account changes revoke sessions as today. Local JSON and Supabase profiles both persist the new field. Supabase migration must preserve staff administration audit/session behavior and prevent direct database write bypasses.
- No actual production migration, release or deployment is authorized.

## Tasks
- [x] Add permission helper, denied-by-default tests, service enforcement and local user API persistence/validation.
- [x] Add Supabase migration, adapter validation/mapping and tests with existing security/session guarantees.
- [x] Connect detail-dialog permission checkboxes and AS action controls, test UI saving/failure and permission denial.
- [x] Run related API/browser/security regressions, review the complete pending diff and document migration/rollback limits.

Validation: all four permission boundaries, sysadmin bypass, inactive/reset accounts denied, role/permission spoofing rejected, revocation on existing sessions, stage progression only forward, replay cannot bypass revoked permissions, invalid arrays rejected, XSS-safe names, independent checkbox saves, failed saves restored, responsive roster.

Validation completed: npm test 127 passed; user browser 5 passed; AS integrity/write-progress browser 2 passed. Review found and fixed permission revocation during upload/lock wait via fresh authorization after acquiring the store lock. Supabase migration exercised in PGlite only; no hosted DB changes.
