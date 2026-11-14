; Rename the known, per-user Process ERP installation without deleting user data.
; Overridable paths let the native regression harness use isolated registry/links.
!define /ifndef LEGACY_UNINSTKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\Process ERP"
!define /ifndef LEGACY_PRODUCTKEY "Software\processserver\Process ERP"
!define /ifndef MIGRATION_DESKTOP "$DESKTOP"
!define /ifndef MIGRATION_STARTMENU "$SMPROGRAMS"
!define /ifndef MIGRATION_PINNED "$APPDATA\Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar"

Var LegacyDirectory
Var LegacyMigrationOK
Var MigrationLinkDirectory
Var MigrationPath

!macro NSIS_HOOK_PREINSTALL
  StrCpy $LegacyDirectory ""
  StrCpy $LegacyMigrationOK 1
  ReadRegStr $R0 HKCU "${LEGACY_UNINSTKEY}" "Publisher"
  ReadRegStr $R1 HKCU "${LEGACY_UNINSTKEY}" "MainBinaryName"
  ${If} $R0 == "${MANUFACTURER}"
  ${AndIf} $R1 == "${MAINBINARYNAME}.exe"
    ReadRegStr $R2 HKCU "${LEGACY_PRODUCTKEY}" ""
    ${If} $R2 != ""
      GetFullPathName $R3 "$R2"
      ReadRegStr $R0 HKCU "${LEGACY_UNINSTKEY}" "InstallLocation"
      ReadRegStr $R1 HKCU "${LEGACY_UNINSTKEY}" "UninstallString"
      ${If} $R0 == '$\"$R3$\"'
      ${AndIf} $R1 == '$\"$R3\uninstall.exe$\"'
        StrCpy $LegacyDirectory $R3
        ; Do not follow directory junctions/symlinks while cleaning an old install.
        StrCpy $MigrationPath $R3
        ${DoWhile} $MigrationPath != ""
          System::Call 'kernel32::GetFileAttributesW(w "$MigrationPath") i.r0'
          IntOp $R0 $0 & 0x400
          ${If} $R0 != 0
            StrCpy $LegacyDirectory ""
            ${ExitDo}
          ${EndIf}
          ${GetParent} "$MigrationPath" $MigrationPath
        ${Loop}
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

; Update only a standard legacy link whose target proves it belongs to this app.
; Never replace another application's MIPS.lnk or Process ERP.lnk.
!macro MigrateLegacyShortcut directory
  StrCpy $MigrationLinkDirectory "${directory}"
  !insertmacro IsShortcutTarget "$MigrationLinkDirectory\Process ERP.lnk" "$LegacyDirectory\${MAINBINARYNAME}.exe"
  Pop $R8
  ${If} $R8 = 1
    StrCpy $R9 1
    ${If} ${FileExists} "$MigrationLinkDirectory\MIPS.lnk"
      !insertmacro IsShortcutTarget "$MigrationLinkDirectory\MIPS.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
      Pop $R9
    ${EndIf}
    ${If} $R9 = 1
      ClearErrors
      SetOutPath "$INSTDIR"
      CreateShortcut "$MigrationLinkDirectory\MIPS.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0 SW_SHOWNORMAL "" "MIPS"
      ${IfNot} ${Errors}
        !insertmacro SetLnkAppUserModelId "$MigrationLinkDirectory\MIPS.lnk"
        !insertmacro IsShortcutTarget "$MigrationLinkDirectory\MIPS.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
        Pop $R9
        ${If} $R9 = 1
          ClearErrors
          Delete "$MigrationLinkDirectory\Process ERP.lnk"
          ${If} ${Errors}
            StrCpy $LegacyMigrationOK 0
          ${EndIf}
        ${Else}
          StrCpy $LegacyMigrationOK 0
        ${EndIf}
      ${Else}
        StrCpy $LegacyMigrationOK 0
      ${EndIf}
    ${Else}
      StrCpy $LegacyMigrationOK 0
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; A new destination may alias the old directory through a junction. Preserve
  ; the legacy registration/files instead of comparing two textual paths.
  StrCpy $MigrationPath $INSTDIR
  ${DoWhile} $MigrationPath != ""
    System::Call 'kernel32::GetFileAttributesW(w "$MigrationPath") i.r0'
    IntOp $R0 $0 & 0x400
    ${If} $R0 != 0
      StrCpy $LegacyDirectory ""
      ${ExitDo}
    ${EndIf}
    ${GetParent} "$MigrationPath" $MigrationPath
  ${Loop}
  ${If} $LegacyDirectory != ""
    !insertmacro MigrateLegacyShortcut "${MIGRATION_DESKTOP}"
    !insertmacro MigrateLegacyShortcut "${MIGRATION_STARTMENU}"
    ; Keep the pinned link filename so Windows' existing pin still resolves.
    !insertmacro IsShortcutTarget "${MIGRATION_PINNED}\Process ERP.lnk" "$LegacyDirectory\${MAINBINARYNAME}.exe"
    Pop $R8
    ${If} $R8 = 1
      ClearErrors
      CreateShortcut "${MIGRATION_PINNED}\Process ERP.lnk" "$INSTDIR\${MAINBINARYNAME}.exe" "" "$INSTDIR\${MAINBINARYNAME}.exe" 0 SW_SHOWNORMAL "" "MIPS"
      ${If} ${Errors}
        StrCpy $LegacyMigrationOK 0
      ${Else}
        !insertmacro SetLnkAppUserModelId "${MIGRATION_PINNED}\Process ERP.lnk"
        !insertmacro IsShortcutTarget "${MIGRATION_PINNED}\Process ERP.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
        Pop $R8
        ${If} $R8 != 1
          StrCpy $LegacyMigrationOK 0
        ${EndIf}
      ${EndIf}
    ${EndIf}
    ${If} $LegacyMigrationOK = 1
      GetFullPathName $R8 "$INSTDIR"
      ${If} $LegacyDirectory != $R8
        ; Legacy releases contain only these two managed files. Never invoke an
        ; old uninstaller or recursively remove a directory/profile/data folder.
        ClearErrors
        IfFileExists "$LegacyDirectory\${MAINBINARYNAME}.exe" 0 +2
          Delete "$LegacyDirectory\${MAINBINARYNAME}.exe"
        ${If} ${Errors}
          StrCpy $LegacyMigrationOK 0
        ${Else}
          IfFileExists "$LegacyDirectory\uninstall.exe" 0 +2
            Delete "$LegacyDirectory\uninstall.exe"
          ${If} ${Errors}
            StrCpy $LegacyMigrationOK 0
          ${EndIf}
        ${EndIf}
      ${EndIf}
      ${If} $LegacyMigrationOK = 1
        ClearErrors
        DeleteRegKey HKCU "${LEGACY_UNINSTKEY}"
        ${If} ${Errors}
          StrCpy $LegacyMigrationOK 0
        ${Else}
          DeleteRegValue HKCU "${LEGACY_PRODUCTKEY}" ""
          DeleteRegValue HKCU "${LEGACY_PRODUCTKEY}" "Installer Language"
          DeleteRegKey /ifempty HKCU "${LEGACY_PRODUCTKEY}"
          ; A nonempty old directory is deliberately retained (user files).
          ${If} $LegacyDirectory != $R8
            RMDir "$LegacyDirectory"
          ${EndIf}
        ${EndIf}
      ${EndIf}
    ${EndIf}
    ${If} $LegacyMigrationOK != 1
      DetailPrint "MIPS installed; legacy cleanup deferred because a file or shortcut is in use."
    ${EndIf}
  ${EndIf}
!macroend
