# GNC campus map — final static QA report

## Changes in this release
- 2D source image: 6× Lanczos enlargement of the supplied 351 × 570 artwork, with restrained sharpening; the original JPG remains unchanged.
- 3D architecture: added instanced facade windows/mullions, floor bands, corner pilasters, hipped roofs, curved Beta flag canopy, U-shaped Goseco court, raised parking decks/markings, and an open Main Gate portico.
- 3D routes: nine separate orthogonal waypoint paths, constant near-ground elevation, thin red centerline with white edge and moving direction markers.
- 3D camera: tighter full-campus isometric framing and footprint-scaled destination close-ups.
- 2D routes and existing Supabase features are preserved. No SQL migration is required.

## Static checks performed
- Node.js syntax check on all project JavaScript files.
- TypeScript source inspected for accidental inclusion of VAPID private values; no private key is added to frontend assets.
- CSS parser check on all project stylesheets.
- HTML duplicate-ID check for all HTML pages.
- Relative script, stylesheet, image, and source URL check from each HTML file's own directory.
- 2D and 3D route sets checked: nine routes each, every consecutive waypoint pair is axis-aligned (horizontal or vertical), all coordinates are inside the 351 × 570 map bounds.
- Building IDs and destination IDs checked for uniqueness and expected mapping.
- 3D architecture function checks: `addWindows` is defined before runtime use; window InstancedMesh matrices are flagged for GPU upload and bounding-sphere computation; parking markings are added during scene setup.
- 2D/3D view toggle, import map version, route renderer, and fallback code references checked.
- ZIP archive integrity and deploy-root layout checked after packaging.

## Runtime limitation
The workspace cannot run a real GPU/WebGL browser render against the live Vercel deployment. The Three.js scene code passes syntax and structural checks, but the final visual quality of WebGL shading, texture loading, and camera behavior must still be confirmed in a real browser on the deployed site. The 2D view remains the default and fallback.

## Important accuracy note
The source campus plan is 351 × 570 pixels and is an illustration. Upscaling reduces resampling artifacts but cannot restore details absent from the original. The 3D building footprints and walkway routes are interpreted approximations based on the supplied video and reference images; GNCI should confirm actual routes and building details before using the map as official navigation.


## Beta Gym and Rizal Statue update

- Beta Building's former solid body is replaced with an open-sided basketball gym beneath the flag canopy.
- The gym includes a red apron, blue court, straight court boundaries, center line/ring, key boxes, two backboards, two rims, and six green structural supports.
- The Goseco courtyard includes the user's background-removed Rizal statue asset and a monument label.
- The statue sprite sits at the center of the open Goseco courtyard so that camera-facing rotation keeps the supplied likeness legible during orbit.
- Existing 2D plan artwork, 2D route coordinates, 3D route coordinates, Supabase integrations, and admin/cashier code are preserved.


## Beta gym + Rizal monument revision (November 15, 2026)

### Implemented
- Beta Building now uses an open-sided gym structure beneath the flag canopy, with red apron, blue court, white court markings, centre circle, free-throw areas, backboards, rims, structural columns and green fascia.
- The Goseco courtyard now places the supplied Rizal statue cutout at its center, with the background removed, a floor shadow and a readable monument label.
- The statue cutout is 623 × 1741 RGBA; transparent background retained.
- The previously approved 2D campus map and 2D/3D routes are unchanged.

### Checks executed
- `node --check` passed for the changed campus map module and existing browser JavaScript files.
- HTML parsed; no duplicate element IDs found in `index.html`, `display.html`, or `admin/index.html`.
- CSS parsed; no parser errors in `styles.css`, `display.css`, or `admin.css`.
- Local HTML asset references checked; no missing files found.
- All nine 2D and nine 3D routes checked: points remain within the map bounds and every segment is axis-aligned.
- Confirmed Beta gym and Rizal statue model functions and asset references are present.
- Confirmed the HD 2D map asset remains 2106 × 3420 and unchanged.
- Confirmed the new statue PNG contains an alpha channel and transparent background.
- ZIP archive integrity checked after packaging.

### Runtime limitation
This environment could not complete a browser-based live WebGL render test against the deployed Vercel site. The Three.js source passed syntax and static checks, but the final appearance, shadowing and sprite presentation should be confirmed in the real browser after deployment.


## Follow-up correction (2026-11-15)
- `campus-map-3d.js` passes `node --check` after replacing the incorrect Beta gym with an enclosed cashier building.
- Removed the Beta basketball-court/gym geometry and flag canopy implementation.
- Added Beta cashier service windows, entrance, facade glazing, sign plaque, and solid blue/red roof panels.
- Added the covered Limlingan pedestrian bridge as 3D geometry.
- Removed screenshot-cropped map textures from the hipped and flat roof materials; roof finishes now use solid material colours and physical geometry.
- Existing 2D map assets and route definitions were not changed.
- Runtime visual verification on the user's live browser/Vercel deployment remains outstanding; static syntax and packaging checks are not a substitute for that.
