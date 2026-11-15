# GNC Campus Map — Final Release Test Report

## Changes in this release

- Added an explicit **2D / 3D** view switch in the campus map toolbar.
- Made **2D the initial view** so the campus map and routes remain usable on devices without WebGL and do not wait for a 3D CDN request.
- Loads Three.js and OrbitControls only when a visitor selects 3D.
- Preserved the supplied `assets/gnc-campus-map-reference.jpg` unchanged as the visual map in both modes. This preserves the roof shapes, school flag, parking markings, building labels, and original illustrated building detail.
- Added a shallow presentation board and restrained orthographic camera for 3D mode. No artificial replacement building blocks are drawn over the original school map.
- Replaced spline curves with right-angle waypoint routes. Red routes have a white underlay and moving white direction dashes; 3D routes use matching straight segment geometry.
- Added distinct start/end markers, zoom, reset, 2D drag-to-pan, 3D orbit/zoom, keyboard-operable 2D destination markers, and a graceful fallback to 2D if the 3D module/CDN or WebGL is unavailable.

## Automated checks performed

1. **JavaScript syntax:** `node --check` passed for every `.js` file in the project.
2. **CSS syntax:** stylesheet parsed with `tinycss2`; no parser errors or declaration errors.
3. **HTML structure:** checked `index.html`, `display.html`, and `admin/index.html`; no duplicate element IDs were found.
4. **Asset/link integrity:** all relative local resources referenced by those HTML entrypoints resolve to files in the project.
5. **Route geometry:** all nine destination routes start at the Main Gate, stay within the 351 × 570 source map, contain no diagonal legs, and have no repeated consecutive points.
6. **Source-art preservation:** the original supplied campus image remains the 351 × 570 source texture and is referenced in both the 2D and 3D map implementations.
7. **Integration preservation:** Supabase config, student app, admin app, cashier display, database SQL, service worker, and notification Edge Function files remain in the package. No VAPID private key was added to browser config.
8. **Chromium 2D interaction test:** verified destination list generation, all nine route selections, route clearing, zoom control behavior, and accessible selected-state updates. No browser page errors occurred.
9. **Chromium 3D control-flow test:** exercised the lazy Three.js initialization path with a mocked Three.js/OrbitControls renderer, selected each of the nine destinations, reset the map, and switched back to 2D. No browser page errors occurred.
10. **3D fallback test:** simulated unavailable Three.js imports and confirmed the app remains in 2D, keeps the map visible, and disables the failed 3D control rather than leaving an indefinite loader.

## Runtime limitation

The 3D control-flow tests use a mocked renderer; they are not a substitute for an actual GPU/WebGL render. The browser in this build environment blocks local browser navigation and cannot make a reliable live request to the Three.js CDN, so a true WebGL render and the deployed Vercel page were not tested here. On deployment, 3D mode requires WebGL and access to the Three.js CDN configured in the import map. 2D mode does not require Three.js or WebGL.

## Campus navigation accuracy

The route lines follow the orthogonal patterns shown in the user-provided reference screenshots and the supplied campus illustration. They are visual guide paths, not surveyed accessibility, emergency, or safety directions. Guagua National Colleges should verify actual pedestrian access before relying on them for official wayfinding.
