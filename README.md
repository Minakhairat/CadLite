# CadLite

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
    npm run desktop:build

## Mobile (Capacitor)
    npx cap add android && npx cap add ios   # iOS needs a Mac with Xcode
    npm run cap:sync && npm run android      # or ios
Store release needs Google Play / Apple Developer accounts. Note: `src-tauri/icons` and app icons are not generated yet.
