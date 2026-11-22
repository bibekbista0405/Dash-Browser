; DASH installer and uninstaller pages (electron-builder NSIS include).
; The uninstaller asks, in plain words, whether to keep or delete the user's data.

!macro customHeader
  !include "nsDialogs.nsh"
  !include "LogicLib.nsh"
  BrandingText "DASH by Bibek Bista"
!macroend

; ---- Installer ----------------------------------------------------------------------------------

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to DASH"
  !define MUI_WELCOMEPAGE_TEXT "DASH is a privacy-first browser.$\r$\n$\r$\n  - No telemetry and no accounts$\r$\n  - Your data stays on this computer$\r$\n  - Built-in ad and tracker blocking, Website Lock and App Lock$\r$\n$\r$\nThis wizard will install DASH on your computer. Click Next to continue."
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  !define MUI_FINISHPAGE_TITLE "DASH is installed"
  !define MUI_FINISHPAGE_TEXT "DASH is ready to use.$\r$\n$\r$\nOn first launch a short welcome tour helps you set it up. Everything DASH stores stays on this computer."
  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_TEXT "Launch DASH now"
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !insertmacro MUI_PAGE_FINISH
!macroend

; ---- Uninstaller ---------------------------------------------------------------------------------

!macro customUnWelcomePage
  ; Declared here, not at the top of the file: this macro only runs in the uninstaller build, and a variable that the
  ; installer build never references is a warning (6001) that electron-builder turns into an error.
  Var DeleteDataCheck
  Var DeleteDataChoice
  Function un.DataPageCreate
    !insertmacro MUI_HEADER_TEXT "Your DASH data" "Choose what happens to the data DASH stored on this computer."
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateLabel} 0 0 100% 40u "DASH keeps your history, bookmarks, saved passwords, settings, downloads list and notes on this computer only. If you keep them, they will still be here if you install DASH again."
    Pop $0
    ${NSD_CreateCheckbox} 0 52u 100% 12u "Also delete my DASH data"
    Pop $DeleteDataCheck
    ${NSD_CreateLabel} 14u 68u 95% 36u "This cannot be undone. A later install will start fresh, with the welcome tour and no saved passwords or history."
    Pop $0
    nsDialogs::Show
  FunctionEnd

  Function un.DataPageLeave
    ${NSD_GetState} $DeleteDataCheck $0
    ${If} $0 == ${BST_CHECKED}
      MessageBox MB_YESNO|MB_ICONEXCLAMATION|MB_DEFBUTTON2 "Delete all DASH data (history, bookmarks, saved passwords, settings)?$\r$\n$\r$\nThis cannot be undone." IDYES +2
      Abort
      StrCpy $DeleteDataChoice "1"
    ${Else}
      StrCpy $DeleteDataChoice "0"
    ${EndIf}
  FunctionEnd
  !define MUI_WELCOMEPAGE_TITLE "Uninstall DASH"
  !define MUI_WELCOMEPAGE_TEXT "This will remove DASH from your computer.$\r$\n$\r$\nClose DASH before you continue. On the next page you can choose whether to keep or delete your data.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.DataPageCreate un.DataPageLeave
!macroend

!macro customUnInstall
  ${If} $DeleteDataChoice == "1"
    ${IfNot} ${isUpdated}
      SetShellVarContext current
      RMDir /r "$APPDATA\${APP_FILENAME}"
      RMDir /r "$LOCALAPPDATA\${APP_FILENAME}"
    ${EndIf}
  ${EndIf}
!macroend
