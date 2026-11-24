# MK Cad

A small parametric-style CAD tool: 2D sketch, then 3D part (extrude / revolve). No assemblies, by design.
One TypeScript codebase: website, desktop (Tauri) and iOS/Android (Capacitor).

## Status (v0.1, working initial version)
- 2D sketch: rectangle, circle, polygon, grid snap, pan (shift/right-drag), zoom (wheel).
- Circles/loops inside another loop become holes.
- Extrude with depth; revolve around the vertical axis; undo feature; export STL.
- Tests check volumes of extrude, hole and revolve results.
- Not yet: sketch constraints/dimensions solver, arcs/splines, fillet/chamfer, boolean cut, save/load, STEP export. Far from Autodesk Inventor parity.

## Run
    npm install && npm run dev      # website
    npm test && npm run build       # dist/ is the static site

## Website (GitHub Pages)
Push to `main`; in repo Settings > Pages choose "GitHub Actions". The workflow in `.github/workflows/pages.yml` deploys.

## Desktop (Tauri, needs Rust)
    npm run icons && npm run desktop:build  # icons are generated from assets/icon.svg

## Mobile (Capacitor)
    npx cap add android && npx cap add ios   # iOS needs a Mac with Xcode
    npm run cap:sync && npm run android      # or ios
The `android/` project is generated, not committed: `npx cap add android && bash scripts/android-icons.sh && npm run cap:sync && cd android && ./gradlew assembleDebug` (needs JDK 17 and Android SDK 34; set `sdk.dir` in `android/local.properties`, which is git-ignored). A debug APK is for testing only; a store release needs your own signing key (never commit it) and a Google Play developer account. iOS: run `npx cap add ios` on a Mac with Xcode. Manual-only workflows exist in `.github/workflows/` (android-debug, desktop); they do nothing until you run them, and desktop uses three OS runners.

Status of native apps: Android debug build compiled once, never run on a device. Desktop (Tauri) and iOS are untested.

Icons are original (`assets/icon.svg`).

## Limits

v0.1: sketch (rectangle, circle, polygon), extrude, revolve, edit, export to STL, OBJ, STEP (exact B-rep: planes, cylinders, cones) and DXF (2D sketch). STEP of a revolved circle profile is not supported yet. No join/cut. Overlap checks use bounding boxes (conservative): overlapping bodies are rejected, and all 3D exports are blocked when loaded features overlap. Not feature-equivalent to any commercial CAD.
