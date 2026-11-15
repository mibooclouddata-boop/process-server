MIPS 0.3.6 - local-test prerelease

This release advances the desktop app version so installations on the existing desktop test channel receive the mandatory update prompt on their next app start.

The desktop app is a wrapper that connects to the ERP server at http://127.0.0.1:3000/. ERP screens and AS workflow changes are served separately and are not included in this desktop installer. The merged server source release v1.1.0 must be deployed to the appropriate ERP server for those changes to appear.

Desktop changes: version and update-channel refresh only. No desktop UI or database changes.

Validation and publication details, including the exact tag commit and installer SHA256, are recorded after the signed CI build. Database changes: none. ERP data and attachments are stored on the server and are not packaged or overwritten.

Recovery: restore the previous test-channel manifest to stop further upgrades. Already upgraded apps require manual reinstall or a higher-version corrective release. App rollback does not restore server data.
