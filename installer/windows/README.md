# PremierSEYO Windows Installer

This folder builds the per-user Windows installer. It expects offline runtime
assets to be present before packaging:

- `vendor/windows/node/` must contain the portable Windows x64 Node runtime
  with `node.exe` at the folder root.
- `vendor/windows/ffmpeg/` must contain FFmpeg with
  `bin/ffmpeg.exe`.
- NSIS must be installed locally, or `MAKENSIS_EXE` must point to
  `makensis.exe`.

Build from Windows:

```powershell
npm run installer:win
```

The output is written to:

```text
dist\PremierSEYO-Setup-x64-<version>.exe
```

The installer uses Adobe UPIA to install `PremierSEYO.ccx`. UPIA is installed
with Creative Cloud Desktop and is required for the official CCX install path.
