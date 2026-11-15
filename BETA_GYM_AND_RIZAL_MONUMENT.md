# GNC campus model correction — Beta Building, basketball gym, and Rizal monument

## Beta Building — cashier and administration
- Beta Building is an enclosed, separate building; it is **not** the basketball gym.
- The 3D footprint is separated from the gym so the two structures no longer overlap or share a roof.
- Its model uses a multi-storey green facade, framed blue-tinted windows, floor bands, a public entrance, a small covered porch, three cashier service windows, and a physical `BETA BUILDING · CASHIER` sign.
- The flat roof has two physical colour panels: red at the north/back half and blue at the south/front half. The roof fields are horizontal geometry, not vertical slabs or a screenshot texture.

## Basketball gym — separate flag-roof structure
- The gym is a distinct open-sided structure immediately east of Beta Building.
- Its roof is a shallow curved canopy with a procedurally drawn Philippine flag material: blue and red fields, white triangle, sun, and three stars.
- The canopy has curved structural ribs, perimeter rails, green support columns, and a front fascia sign.
- The floor is a red perimeter apron around a blue basketball court, with white sidelines, end lines, center line and circle, key areas, free-throw circles, backboards, and basket rims.
- The flag artwork is generated as a canvas texture and mapped onto curved geometry; it is not a cropped map screenshot pasted onto a box.

## Limlingan Hall pedestrian bridges
- Both covered bridge spans from the prior revision remain in place: the central connector and the Limlingan-side corridor bridge.
- Bridge geometry remains independent from Beta and the gym, with raised decks, handrails, glazing, supports, roof structure, and landing platforms.

## Rizal monument
- The supplied background-removed statue remains in the Goseco courtyard between Goseco Hall and the Beta/gym area.
- The statue uses a camera-facing transparent cutout with a ground shadow and a monument label; it is not a full 360-degree sculpted model.

## 2D / 3D behavior
- The approved 2D campus image and its 2D routes are unchanged.
- The 3D Beta route ends at the cashier building's south entrance approach. Gym geometry does not replace or rename the Beta destination.
- No Supabase migration is required. Existing cashier, administrator, authentication, queue, and notification code remains unchanged.

## Accuracy note
The campus plan is an illustration and the detailed 3D geometry is an interpretation of the supplied screenshots/video. GNCI should confirm building footprints, cashier entrance, gym boundaries, and walkways before using the map as official wayfinding.
