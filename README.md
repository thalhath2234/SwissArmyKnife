# Swiss Army Knife

Personal cross-platform desktop toolkit built with **Next.js** (static export) + **Tauri 2**. Dark theme. PDF tools first; Forms are out of scope.

## Phase 1 (available)

- Merge PDF
- Split PDF
- Compress PDF (local light rewrite; strong → cloud stub)
- PDF → PNG / JPG
- Images → PDF
- Unlock PDF

## Hybrid model

- Local processors for Phase 1 (`src/lib/pdf`)
- Cloud provider stubs for OCR / translate / Office convert (`src/lib/hybrid`)

## Develop

```bash
npm run dev          # browser UI
npm run tauri:dev    # desktop shell (needs Rust + WebView2)
```

## Build

```bash
npm run build
npm run tauri:build
```

### Windows prerequisites

- [Rust](https://rustup.rs/)
- [Microsoft C++ Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) (Desktop development with C++)
- WebView2 (usually preinstalled on Windows 10/11)
