; MusabAI Code Windows x64 installer.
; Built from the same packaged editor ZIP via the Windows GitHub Actions workflow.
#define AppName "MusabAI Code"
#ifndef AppVersion
  #define AppVersion "0.2.2"
#endif
#define SourceRoot GetEnv("GITHUB_WORKSPACE")
#if SourceRoot == ""
  #error "This installer must be built from the GitHub Actions workspace."
#endif
#define EditorDir AddBackslash(SourceRoot) + "dist\MusabAI-Code-win32-x64"
#define OutputDir AddBackslash(SourceRoot) + "dist"

[Setup]
AppId=Musabgpt.MusabAICode.Windows
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Musabgpt
AppPublisherURL=https://github.com/Musabgpt/m88
AppSupportURL=https://github.com/Musabgpt/m88/issues
DefaultDirName={localappdata}\Programs\MusabAI Code
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
OutputDir={#OutputDir}
OutputBaseFilename=MusabAI-Code-Setup-{#AppVersion}-windows-x64
Compression=lzma2/max
SolidCompression=yes
PrivilegesRequired=lowest
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
UninstallDisplayIcon={app}\MusabAI Code.exe
VersionInfoDescription=MusabAI Code Windows installer

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Additional shortcuts:"

[Files]
Source: "{#EditorDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\MusabAI Code"; Filename: "{app}\MusabAI Code.exe"; WorkingDir: "{app}"
Name: "{autodesktop}\MusabAI Code"; Filename: "{app}\MusabAI Code.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
Filename: "{app}\MusabAI Code.exe"; Description: "Launch MusabAI Code"; Flags: nowait postinstall skipifsilent
