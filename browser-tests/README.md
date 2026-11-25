# Browser regression scripts (not part of CI)

These drive the real app in headless Chrome with real mouse and keyboard input. They are run by hand.

Needs: Node, `puppeteer-core`, and Chrome at `/usr/bin/google-chrome` (edit the path in the script if different).

Run against a local dev server or the live site:

    npm run dev -- --port 4180
    node browser-tests/dim-guard-live.mjs http://localhost:4180/
    node browser-tests/dim-guard-live.mjs https://minakhairat.github.io/CadLite/

`dim-guard-live.mjs` checks the shared-corner dimension guard on the solver path: a plain dimension, a Vertical constraint, then a conflicting dimension (plain and expression). It expects refusal, unchanged geometry, no Redo entry, accepted non-conflicting expression, extrude volume 16000 and a clean save and reopen.

`dim-guard-baseline.mjs` runs the same setup and then calls Undo after the refusal. Expected: Undo returns the clean square. Before the history fix, Undo restored the broken geometry (bottom edge length 41.2311).

`project-geometry.mjs` checks Project Geometry: box extruded on XY, new XZ sketch, button projects 4 construction lines (40 wide, 10 tall), second press adds nothing, Undo/Redo, save keeps the source tag.

All scripts print `ASSERT OK` or `ASSERT FAIL` lines and exit non-zero on any failure. They are run by hand and are NOT wired into build CI, so a green CI run says nothing about them.
