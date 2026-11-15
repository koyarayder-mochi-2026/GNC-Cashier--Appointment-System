# GNC Limlingan pedestrian bridge correction

## What was wrong
The previous 3D model placed one narrow bridge at x=151, z=278..378. That put it on the west side of Limlingan Hall, not on the blue bridge corridors shown in the school's supplied campus plan. The span was too narrow and visually blended into nearby building geometry.

## What changed
`campus-map-3d.js` now creates two separate covered pedestrian spans from modeled geometry (not image overlays):

1. **Central covered bridge** — x=187, z=157..242, width 10.5 map units. It follows the blue corridor between Tanjangco and Goseco and lands beside the Limlingan north wing.
2. **Limlingan Hall bridge** — x=205, z=315..362, width 9.5 map units. It follows the narrow blue corridor between Limlingan Hall and Beta Building.

Both spans have a raised structural deck, dark steel edge beams, blue translucent side glazing, repeated vertical mullions, continuous handrails, glazed canopy panels, roof cross-rafters, paired support piers, and end landing platforms. The bridge is added after the building geometry, and its placement was checked against the supplied map's building footprints so it is not hidden inside the adjacent halls.

## What was preserved
- The original 2D campus artwork and route definitions are unchanged.
- The Beta Building cashier model and Rizal monument are unchanged.
- Supabase, authentication, admin/cashier pages, and notification code are unchanged.
- No database migration is required.

## Deployment
Replace the contents of the deployed project with this ZIP and let Vercel redeploy. Hard-refresh the page, switch to 3D, and view the area beside Limlingan Hall.

The bridge locations are interpreted from the supplied campus illustration and reference close-ups; GNC should confirm exact pedestrian connections on site before using them as official wayfinding.
