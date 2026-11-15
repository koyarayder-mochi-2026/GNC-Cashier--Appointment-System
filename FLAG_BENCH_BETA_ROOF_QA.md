# GNC Gym Flag Surface and Spectator Seating QA

## Corrections implemented
- Flag canopy UVs now map the canvas top to the north end and the canvas base to the near/south end: blue field on the left, red field on the right, white triangle with sun and stars at the near end.
- The flag material is front-face only on the raised curved canopy. A separate plain cream soffit is visible from inside the gym, preventing the flag from appearing as a mirrored floor/ceiling graphic.
- The base campus artwork contains a flag illustration below the Beta/gym complex. That complete footprint is masked from the 3D ground texture and replaced by a light concrete apron with subtle joints; the 2D reference itself is untouched.
- Spectator benches now face east toward the court. The lowest/front row is at the east edge nearest the court, middle and rear rows rise toward the west, and backrests are on the west/rear edge.
- The access stair now climbs from the court/east side toward the higher west/rear seating rows.

## Source-level checks
- `node --check` passed for all seven JavaScript files.
- 2D and 3D route waypoint arrays remain present and unchanged.
- Bench seat rows are ordered front-to-back with decreasing X positions and increasing seat heights; each backrest is on the west side of its seat.
- Front row seat envelope ends at x=263.025 while the court begins at x=263.5, leaving a 0.475-unit aisle clearance. The row centers step westward as seat height increases.
- Flag canvas remains 1024 × 3072, blue left/red right, triangular hoist white field at the near/south end.
- `flagTexture` is applied only to the raised canopy material; canopy is `FrontSide`; underside is untextured cream.
- Ground texture mask covers x=198..312 and y=278..486 map coordinates, which includes the complete underlying flag artwork footprint under the Beta/gym complex.
- HTML IDs, local asset paths, CSS braces, and ZIP integrity checked.

## Runtime limitation
The project requires a real browser with WebGL to confirm final lighting and material appearance. Static geometry/source checks do not replace a live GPU render on the deployed Vercel site.
