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
