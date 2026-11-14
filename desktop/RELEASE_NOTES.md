Process ERP 0.2.1 ? local-test prerelease

- Set both the native window icon and the separate Windows taskbar ICON_BIG to the MIBOO star symbol.
- Remove the extra console window from local-test installers.
- Check the Windows GUI executable subsystem before publishing.

Connects to http://127.0.0.1:3000/ on the same PC. No production server deployment or database changes.
Existing 0.2.0 installations receive this version through the mandatory startup updater.
Rollback: manually reinstall desktop-v0.2.0 and restore the test-channel metadata to that version. ERP data is not included in installers.
