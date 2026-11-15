# GNC Beta / Gym / Stage QA report

## Static checks
- `node --check campus-map-3d.js`: passed.
- Beta building and gym footprints: non-overlapping; Beta is north-west/back of the gym.
- Stage footprint: inside the gym canopy and does not intersect the shifted basketball court start.
- Stage steps: finish before the court start line.
- Beta route endpoint: terminates at the relocated building's south/front entrance approach.
- Flag texture: explicit CanvasTexture flipY=false; UV v=0 maps the north/back edge to the canvas top (red), UV v=1 maps the south/front edge to the canvas bottom (blue), and the east end maps to the white triangle.
- 2D route data: retained; existing axis-aligned route geometry is unchanged.
- Supabase/database files: unchanged.

## Geometry values
- Beta footprint: x=204..232, z=285..377.
- Gym footprint: x=251.5..302.5, z=300..474.
- Stage: centered at the north end of the gym; stage platform depth 25 model units.
- Basketball court start: z=346 (gym local z1 + 46), south of the stage and stair run.
- Flag canopy edge: 56.5 model units; curved crown approximately 63.7 model units.

## Rendering limitation
The project source passed static checks. A full live WebGL render could not be completed in this environment because Chromium's GPU/EGL initialization failed; verify the final 3D appearance in the deployed browser/GPU after upload.
