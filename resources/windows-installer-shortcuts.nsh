; Shared NSIS helpers for LokSystem deployment launchers
; Creates extra shortcuts that start the WebUI deployment wrapper.

!define DEPLOY_SHORTCUT_NAME "${SHORTCUT_NAME} Deploy WebUI"
!define DEPLOY_SHORTCUT_DESCRIPTION "Start ${PRODUCT_NAME} in WebUI deployment mode"

!macro createDeployDesktopShortcut
  !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
    ${ifNot} ${isNoDesktopShortcut}
      ${If} ${FileExists} "$INSTDIR\LokSystem-Deploy.cmd"
        CreateShortCut "$DESKTOP\${DEPLOY_SHORTCUT_NAME}.lnk" "$INSTDIR\LokSystem-Deploy.cmd" "" "$appExe" 0 "" "" "${DEPLOY_SHORTCUT_DESCRIPTION}"
        ClearErrors
      ${EndIf}
    ${endif}
  !endif
!macroend

!macro createDeployStartMenuShortcut
  !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
    ${If} ${FileExists} "$INSTDIR\LokSystem-Deploy.cmd"
      !ifdef MENU_FILENAME
        CreateDirectory "$SMPROGRAMS\${MENU_FILENAME}"
        CreateShortCut "$SMPROGRAMS\${MENU_FILENAME}\${DEPLOY_SHORTCUT_NAME}.lnk" "$INSTDIR\LokSystem-Deploy.cmd" "" "$appExe" 0 "" "" "${DEPLOY_SHORTCUT_DESCRIPTION}"
      !else
        CreateShortCut "$SMPROGRAMS\${DEPLOY_SHORTCUT_NAME}.lnk" "$INSTDIR\LokSystem-Deploy.cmd" "" "$appExe" 0 "" "" "${DEPLOY_SHORTCUT_DESCRIPTION}"
      !endif
      ClearErrors
    ${EndIf}
  !endif
!macroend

!macro customInstall
  ${if} $keepShortcuts == "false"
    !insertmacro createDeployStartMenuShortcut
    !insertmacro createDeployDesktopShortcut
  ${endif}
!macroend

!macro customUnInstall
  !ifndef DO_NOT_CREATE_DESKTOP_SHORTCUT
    WinShell::UninstShortcut "$DESKTOP\${DEPLOY_SHORTCUT_NAME}.lnk"
    Delete "$DESKTOP\${DEPLOY_SHORTCUT_NAME}.lnk"
  !endif

  !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
    ReadRegStr $R1 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" MenuDirectory
    ${if} $R1 == ""
      StrCpy $R2 "$SMPROGRAMS\${DEPLOY_SHORTCUT_NAME}.lnk"
    ${else}
      StrCpy $R2 "$SMPROGRAMS\$R1\${DEPLOY_SHORTCUT_NAME}.lnk"
    ${endif}
    WinShell::UninstShortcut "$R2"
    Delete "$R2"
  !endif
!macroend
