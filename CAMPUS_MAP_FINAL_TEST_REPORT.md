# GNC Campus Map QA Report — Beta Cashier Building + Separate Flag-Roof Gym

## Current model changes
- Beta Building is a separate enclosed cashier/administration building with a green multi-storey facade, physically framed windows, two floor bands, a covered front porch, a main entrance, three cashier service windows, a physical front sign, and a horizontal red/blue roof treatment.
- A separate open-sided basketball gym is placed immediately east of Beta Building. It has a red perimeter apron, blue playing surface, orthogonal court lines, center line/circle, key and free-throw markings, two backboards/rims, green columns, curved roof ribs, and a curved canopy carrying a procedurally generated Philippine flag.
- The flag design is a canvas-generated material on custom curved geometry, not a screenshot texture pasted onto a rectangular block.
- Beta's 3D footprint, destination focus/hotspot, and final route endpoint are adjusted to the cashier building and its south-side entrance approach.
- Previous Limlingan pedestrian bridges and the Goseco Rizal monument remain in the project.
- The approved 2D campus image and 2D route set are unchanged.

## Static validation performed
- `node --check` on every project JavaScript file.
- HTML IDs checked for duplicates in `index.html`, `display.html`, and `admin/index.html`.
- Relative HTML script, stylesheet, image, and manifest references checked.
- CSS stylesheets parsed with `tinycss2`.
- 2D and 3D route definitions checked for coordinates within the 351 × 570 map and horizontal/vertical-only segments.
- Beta, gym, Banzali, Limlingan, Puno, bridge, and gate footprints checked for intended non-overlap/clearance.
- Confirmed the Beta cashier model and independent gym construction are each defined and called exactly once.
- Confirmed the gym has separate court, flag canopy, roof ribs, support columns, and basketball markings.
- Confirmed no gym code changes the approved 2D source image.
- ZIP integrity checked; `index.html` is at the archive root.

## Runtime limitation
A live GPU/WebGL render test against the user's Vercel site is not available in this environment. The source-level syntax, geometry invariants, and project packaging checks passed, but actual visual rendering of the canopy UV orientation, lighting, shadows, and close-up camera composition should be confirmed in the deployed browser.

## Accuracy note
The provided campus drawing and screenshots are illustrative, not surveyed architectural plans. The new gym and Beta footprints are modeled interpretations of the supplied video and close-up images. GNCI should verify locations, dimensions, entrances, and pedestrian access before using the map as official navigation.


## Latest gym flag and seating correction
- Reversed/normalized canopy UV mapping so the flag composition is aligned to the roof long axis: blue left, red right, white triangle at the near end.
- Made the flag material exterior-facing only and added a solid cream soffit underneath; the flag is not shown on the gym underside.
- Masked the full embedded flag illustration out of the 3D ground texture below the Beta/gym apron and replaced it with neutral concrete paving. The original 2D plan image remains unchanged.
- Reoriented spectator benches toward the basketball court: lowest row in front/east, higher rows behind/west, backrests on the west side; the access stair ascends from east to west.
- No Supabase files, queue code, authentication, or database schema were changed.
