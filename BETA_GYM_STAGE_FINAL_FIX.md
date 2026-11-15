# Beta Building, Philippine-flag canopy and gym stage correction

## Spatial layout
- Beta Building remains the enclosed cashier/administration building, not the gym.
- Its 3D footprint is now x=204..232, z=285..377, placing it north-west/behind the basketball gym.
- The gym remains a separate open-sided structure at x=251.5..302.5, z=300..474.
- The Beta 3D selection footprint and route endpoint were moved with the building. The route still uses right-angle waypoints and approaches the south/front entrance.

## Flag canopy orientation
- Red field: far/north half of the roof (explicit `flipY=false` keeps canvas top mapped to UV v=0).
- Blue field: near/south half of the roof.
- White triangle with sun and three stars: right/east end of the roof.
- The flag remains a generated CanvasTexture mapped to the curved canopy geometry, not a screenshot pasted onto a box.

## Gym stage
- Added a raised stage at the north end beneath the canopy.
- Separate geometry includes the platform, front fascia, three broad steps, backdrop, curtain panels, side wings, title plaque, lectern and microphone.
- Moved the basketball court south so stage steps and court markings do not overlap.

## Scope
- Existing 2D campus image and 2D route polylines are retained.
- Cashier, admin, Supabase, authentication, queue and notification logic are unchanged.
- No database migration is required.
