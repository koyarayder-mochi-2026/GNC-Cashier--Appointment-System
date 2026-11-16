# GNC Student Cashier Virtual Queue

A responsive HTML, CSS, and vanilla JavaScript frontend for a school cashier virtual queue, backed by Supabase Auth, PostgreSQL, the Supabase REST API (PostgREST), and database RPC endpoints.

Students sign in, select a cashier transaction, get a ticket for Cashier 1 or Cashier 2 (or choose the shorter active queue), and track their place without standing in the physical line just to get a number. Cashier staff call the next number and update the ticket after the student is served.

> This is a configurable demonstration implementation, not an official GNC deployment. The visual theme is based on the screenshots and campus footage supplied for this project. Confirm official school branding, cashier services, counter policy, and account eligibility with GNC before production use.

## Package contents

- `index.html` — student portal and cashier staff dashboard
- `styles.css` — responsive portal styles
- `app.js` — portal behavior and session handling
- `api.js` — shared Supabase API client and typed-by-convention API methods
- `config.js` — Supabase project URL and public publishable/anon key placeholders
- `supabase_setup.sql` — full PostgreSQL schema and queue APIs (same current complete setup as `supabase_setup_complete.sql`)
- `supabase_setup_complete.sql` — base schema plus the admin control-panel migration for a fresh project
- `display.html` — public TV/lobby queue display (works without a user login)
- `display.css` — display styles
- `display.js` — display polling and optional spoken announcements
- `admin/index.html` — protected administrator login and control panel at `/admin`
- `admin.js`, `admin.css` — admin authentication, pause/resume, queue calling, audit history
- `admin_panel_upgrade.sql` — additive database migration for system control and admin APIs
- `admin_account_setup.sql` — promotes the Supabase Auth account to the GNC admin role
- `_redirects`, `vercel.json` — clean `/admin` routing for Netlify and Vercel
- `assets/gnc-campus-loop.mp4` — compressed, muted campus hero video from the supplied reference footage
- `assets/gnc-campus-poster.jpg` — still image fallback while the hero video loads
- `admin_call_rpc_and_notifications.sql` — focused repair for the missing admin-call RPC plus opt-in notification tables on an existing deployment
- `sw.js`, `manifest.webmanifest`, `assets/pwa-*.png` — PWA support and device notification handling
- `supabase/functions/notify-student-turn/index.ts` — protected Supabase Edge Function for push/email delivery
- `supabase/config.toml` — Supabase CLI project and Edge Function configuration
- `API_REFERENCE.md` — REST/RPC endpoint documentation, JSON payloads, and access rules
- `NOTIFICATION_SETUP.md` — focused setup and test guide for device/email turn alerts

## 1. Create the Supabase project

1. Create a Supabase project.
2. Open **SQL Editor → New query**.
3. For a new database, paste and run the complete `supabase_setup_complete.sql` file. For an existing queue database that does not yet have the admin controls, run the entire `admin_panel_upgrade.sql`. For the current deployment shown in your screenshots (admin page loads but `admin_call_queue_ticket` is missing), run the focused `admin_call_rpc_and_notifications.sql` migration instead. Do not rerun the base schema over an existing database.
4. Open **Project Settings → API** and copy the **Project URL** and **publishable key** (or legacy anon key).
5. In **Database → Replication**, confirm `public.queue_tickets` is enabled for the `supabase_realtime` publication. The SQL script attempts to add it automatically; if your project reports it is already configured, no action is needed.

The script can run on a new project and includes compatibility steps for the earlier GNC appointment prototype: it adds/backfills `cashier_windows.ticket_prefix`, removes the earlier cashier-wide service/window write policies, and replaces the public queue summary RPC with its updated response. Existing appointment tables and their data are left in place; this queue frontend does not use them. Back up the project before applying schema changes to any database containing real records.

## 2. Configure the frontend

The `config.js` file in this package has already been populated with the Supabase project URL and publishable key supplied for this GNC deployment. Do not replace these values unless you are switching to a different Supabase project.

The publishable key is designed to be used in browser code. It does not bypass Row Level Security. Never put a Supabase `service_role` or secret key in `config.js`, any frontend file, a public Git repository, or a client-side API request.

This is a plain HTML/CSS/JavaScript project, not a Next.js app. Therefore, `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are represented by `url` and `anonKey` in `config.js`; a static host will not automatically inject Next.js environment variables into these files.

## 3. Run locally

Use a local HTTP server because the JavaScript files use ES modules:

- In VS Code, use the Live Server extension and open `index.html`; or
- From this folder, run `python -m http.server 5500` and visit `http://localhost:5500`.

Open `http://localhost:5500/display.html` on the TV / lobby monitor for the public queue board. The board refreshes every five seconds. Enable voice announcements by clicking the button once; browser audio policies require a user interaction before speech can play.

## 4. Create the administrator and cashier accounts securely

### Administrator account

The requested admin username is `GNCICashier2026`. The admin page accepts that username and the password is verified by Supabase Auth. The password is not stored in `config.js`, SQL, or browser code.

1. In Supabase Dashboard, open **Authentication → Users → Add user**.
2. Create the account using a real, school-controlled email address and set a strong password privately in Supabase Auth. Confirm the email if your Auth settings require it.
3. After the user exists, open `admin_account_setup.sql`, replace `REPLACE_WITH_REAL_ADMIN_EMAIL` with that exact email, and run the full script in SQL Editor.
4. The script promotes that profile to role `admin` and sets its username to `GNCICashier2026`.
5. Open `https://YOUR-DOMAIN/admin` and sign in using username `GNCICashier2026` and the password you configured in Supabase Auth.

Do not reuse a public/default password. The supplied request specified the username but did not provide a separate password or a school-controlled email, so neither has been invented or embedded in the website.

### Cashier accounts

Create cashier users in Supabase Auth, then promote the corresponding profile using its actual email:

```sql
update public.profiles set role = 'cashier' where email = 'cashier1@school.example';
update public.profiles set role = 'cashier' where email = 'cashier2@school.example';
```

Only the admin role can pause or resume student intake. Cashiers retain access to the operational desk.

## 5. Install the admin control-panel database upgrade

For an existing queue database that does not yet have admin controls, run the **entire** `admin_panel_upgrade.sql` file in Supabase SQL Editor after the base queue schema is installed. That upgrade installs the saved global intake switch, pause/resume audit log, admin username resolver, selected-ticket calling function, and the pause-aware `take_queue_number` RPC. For the already-installed admin page that reports `Could not find the function public.admin_call_queue_ticket(p_ticket_id) in the schema cache`, run `admin_call_rpc_and_notifications.sql` instead. That focused repair creates the exact selected-ticket RPC, restores its least-privilege grants, creates the student notification preference/subscription tables, and reloads the PostgREST schema cache. It does not recreate the global intake setting or username resolver because those belong to `admin_panel_upgrade.sql` and are already present in the existing admin deployment. **Important:** In SQL Editor, paste and execute the entire focused file from its first comment to its final verification block; do not execute a partial selection. Both migrations preserve profiles, services, cashier windows, tickets, and queue history.

The pause/resume RPC and ticket issuance use the same Manila-day advisory lock. This means an in-flight ticket request finishes before the pause operation takes effect, and requests started after it is paused are rejected. Staff call/complete/no-show actions remain enabled for already-issued tickets.

## 6. Configure actual cashier transactions

The SQL inserts sample service rows and two counters:

- `Cashier 1` (`C1` ticket prefix)
- `Cashier 2` (`C2` ticket prefix)

The sample transaction labels are placeholders, not a verified official GNC service list. In Supabase Table Editor, edit `services` to match the school cashier office's accepted transactions. Set a counter's `is_active` to `false` to stop assigning new students to it. Its existing waiting/serving tickets remain visible on the display, and staff can finish that queue. Set it to `true` when reopened.

## 7. Queue behavior and safeguards

- Ticket numbers reset at midnight in the `Asia/Manila` time zone: `C1-001`, `C2-001`, etc.
- A student can have only one active (`waiting` or `serving`) ticket per Manila calendar day.
- Students may select a particular counter or let the database choose the shorter open line.
- Automatic line assignment is serialized per day to avoid simultaneous requests both choosing a stale queue count.
- Ticket number allocation is transactional. Database constraints prevent duplicate ticket numbers, duplicate active tickets per student/day, and multiple serving tickets per counter/day.
- Students can cancel only their own waiting ticket. Called tickets cannot be cancelled by students.
- Cashier staff call the oldest waiting ticket. They must complete or mark the current ticket no-show before calling another student.
- Staff actions and ticket mutations occur through secured PostgreSQL RPC endpoints; students have no direct insert/update/delete permissions on queue tickets.
- The public display exposes only counter name/code, the ticket number currently being served, and the waiting count. It does not expose student identities.
- The student portal refreshes periodically and subscribes to Supabase Realtime when enabled. The public TV display polls every five seconds as a resilient fallback.
- Payment remains in person. The app does not collect payments, process card details, calculate balances, or store financial credentials.

## 8. API

Supabase automatically exposes:

- Auth endpoints under `/auth/v1/`
- Table REST endpoints under `/rest/v1/`
- Database function endpoints under `/rest/v1/rpc/`

The frontend calls these via `api.js`. Main RPC endpoints are:

| API route | Purpose |
|---|---|
| `POST /rest/v1/rpc/get_public_queue_status` | Safe public live counter summary |
| `POST /rest/v1/rpc/take_queue_number` | Student takes a ticket; null counter chooses shorter line |
| `POST /rest/v1/rpc/get_my_queue_position` | Student retrieves their own queue position |
| `POST /rest/v1/rpc/cancel_my_queue_ticket` | Student cancels own waiting ticket |
| `POST /rest/v1/rpc/staff_call_next` | Cashier/admin calls next waiting ticket |
| `POST /rest/v1/rpc/staff_update_queue_ticket` | Cashier/admin completes or skips ticket |

See `API_REFERENCE.md` for full payload schemas, standard REST headers, example cURL requests, and authorization rules.

## 9. Test before real use

Use test accounts and verify all of these before opening the system to students:

1. Student sign-up and email confirmation (if enabled).
2. Student A cannot view Student B's profile or ticket through REST.
3. Student cannot call staff RPCs or directly insert/update/delete ticket rows.
4. Two simultaneous ticket requests cannot allocate duplicate numbers or two active tickets to one student.
5. Shortest-line assignment selects the line with fewer active tickets.
6. Counter closure prevents new ticket assignment to that counter.
7. Cashier call-next claims only the oldest waiting ticket and does not allow two serving tickets at once.
8. Student cannot cancel a serving or another student's ticket.
9. Completed and no-show tickets no longer count as active.
10. Public display works signed out and does not reveal personal information.
11. Queue resets correctly at midnight Philippine time.
12. Realtime and five-second/12-second polling refreshes update the displayed state.

## 10. Production readiness and school approval

This project is not deployed or connected to the school's Supabase account from this workspace. Before real use, GNC must authorize the deployment, validate student identity against school records, approve the official service list and cashier procedures, set account eligibility rules, configure Auth email/redirect URLs and production domains, review data retention/privacy requirements, and perform load/security testing. The student number collected at sign-up is user-supplied in this baseline and is **not independently verified** against the registrar's database.

Also configure a production email provider / SMTP in Supabase Auth if student email verification is required. Use HTTPS hosting. Apply appropriate Supabase backups and project access controls.


## Visual theme

The portal uses a GNC-inspired forest-green, gold, and warm-ivory palette. The header includes the `Fides · Scientia · Patria` motto ribbon and a campus hero using the supplied aerial footage. The separate public display follows the same branding with high-contrast cashier panels for a lobby monitor.

The navigation and footer use the transparent GNC official seal supplied for this project. Confirm the school has approved this artwork for production publication. The supplied hero video is optional: replace `assets/gnc-campus-loop.mp4` and `assets/gnc-campus-poster.jpg` with school-approved media or remove the `<video>` element and keep the poster image.

## Run locally

Because the frontend uses JavaScript ES modules, run it from a local web server instead of opening the HTML file directly. For example, from this folder run:

```bash
python -m http.server 5500
```

Then open `http://localhost:5500`. VS Code Live Server also works.


## Database RPC ambiguity fix

The included `admin_panel_upgrade.sql` recreates `take_queue_number` with `result_*` output names and fully qualified table references. This avoids the earlier ambiguous `queue_date` and `cashier_window_id` output-variable collisions. Run the entire migration, not a partial function body. It also installs the pause/resume API and admin calling function.

### Official GNC crest

The website uses the supplied Guagua National Colleges seal at `assets/gnc-official-crest.png`. The white background has been removed and saved as a transparent PNG. The same crest is displayed in the student portal header, public queue display header, and student portal footer.


## 11. Administrator functions and access control

Open `https://YOUR-DOMAIN/admin` (or `/admin/`). The administrator can:

- Pause new student logins and queue number requests with a saved public message.
- Resume student access without deleting historical tickets.
- View the current/next queue for Cashier 1 and Cashier 2.
- Call the next ticket or call a selected waiting ticket.
- Repeat the current ticket announcement using browser speech.
- Complete or mark the current ticket as no-show.
- Review the latest pause/resume audit entries.

The main page checks the saved status every five seconds, including while signed out. When student access is paused (or the status service cannot be verified), the login/registration panel is hidden and the user sees the configured notice. Existing signed-in students can still track their already-issued queue ticket. The public display continues to show the active serving ticket while access is paused.

The `get_admin_auth_email` RPC resolves only the configured `GNCICashier2026` administrator username to its Supabase Auth email; Supabase Auth then verifies the submitted password. This does not bypass password authentication. Database role checks and RLS/RPC permissions remain authoritative even if someone manually opens `/admin`.

## 12. Hosting routes

- Netlify reads `_redirects` and serves `admin/index.html` at `/admin`.
- Vercel reads `vercel.json` and rewrites `/admin` to `admin/index.html`.
- Keep the root folder as the deployment directory so `config.js`, `api.js`, the shared assets, and `admin/` stay at the expected paths.


## Fix for ambiguous `queue_tickets` → `profiles` relationship

The queue table has multiple foreign keys to `profiles` (`student_id`, `called_by`, and `handled_by`).
The frontend therefore explicitly embeds the student profile through
`profiles!queue_tickets_student_id_fkey(full_name,student_number)` in `api.js`.
This is a frontend/PostgREST relationship disambiguation; it does not require a database migration.
Deploy the updated frontend files together so the admin and cashier dashboards stop receiving the
“more than one relationship was found” error.


## Admin selected-ticket RPC repair and student notifications

### Fix the current admin dashboard RPC error

On your existing project, run the complete `admin_call_rpc_and_notifications.sql` file in Supabase SQL Editor. It creates the exact `public.admin_call_queue_ticket(uuid)` RPC that the admin frontend calls, applies least-privilege grants, adds the opt-in notification tables, and refreshes the PostgREST schema cache. It does not delete existing queue records. It also reasserts least-privilege grants so browser users can update only safe profile fields, cannot self-change `role`/`username`, and cannot directly mutate queue tickets.

After execution, verify the RPC exists:

```sql
select to_regprocedure('public.admin_call_queue_ticket(uuid)') as rpc;
```

Expected value: `admin_call_queue_ticket(uuid)`.

### Student notification choices

The My Queue page now offers two opt-in alert methods:

- **Device alerts:** when the portal is open, Supabase Realtime can show a browser notification when the student's ticket changes from waiting to serving. For background delivery while the site is closed, configure Web Push with a VAPID key pair and deploy the Edge Function.
- **Email alerts:** sent to the student's registered email only after the student enables the email preference. Email delivery needs a Resend API key and a verified sender domain.

No service keys are placed in browser code. The database stores a per-student `device_enabled` and `email_enabled` preference.

### Current deployment: repair the missing admin RPC

For the error shown in the admin dashboard (`Could not find the function public.admin_call_queue_ticket(p_ticket_id) in the schema cache`), copy and run the **entire** `admin_call_rpc_and_notifications.sql` file in one Supabase SQL Editor query. It creates or replaces the exact `admin_call_queue_ticket(uuid)` function, restores the `authenticated` execute grant, creates the student notification tables, and sends `NOTIFY pgrst, 'reload schema'`. Verify with:

```sql
select to_regprocedure('public.admin_call_queue_ticket(uuid)') as rpc;
```

The result must be `admin_call_queue_ticket(uuid)`. If the function appears but the frontend still reports a schema-cache error, wait briefly, reload the page, and retry the call.

### Deploy the Supabase notification function

From the extracted project root, the `supabase/config.toml` is already configured for project `eqcpsoekurzfbgykhydo`. Install the Supabase CLI, then run:

```bash
supabase login
supabase link --project-ref eqcpsoekurzfbgykhydo
supabase functions deploy notify-student-turn
```

Keep `verify_jwt = true`. The function independently verifies the caller's access token and `admin`/`cashier` role before it can notify a student.

### Configure device push

1. Generate a VAPID key pair locally:

   ```bash
   npx web-push generate-vapid-keys
   ```

2. Put the **public** key in `config.js` as `vapidPublicKey`.
3. Keep the **private** key out of the frontend and source repository.
4. Deploy the Supabase Edge Function (from the project root):

   ```bash
   supabase login
   supabase link --project-ref eqcpsoekurzfbgykhydo
   supabase functions deploy notify-student-turn
   ```

5. Configure the Edge Function secrets in the Supabase project. Use a real school IT contact email for `VAPID_SUBJECT`:

   ```bash
   supabase secrets set VAPID_PUBLIC_KEY="YOUR_PUBLIC_VAPID_KEY" VAPID_PRIVATE_KEY="YOUR_PRIVATE_VAPID_KEY" VAPID_SUBJECT="mailto:YOUR-SCHOOL-IT-EMAIL"
   ```

   Use the same public/private VAPID pair in the site config and Edge Function secrets. The `VAPID_SUBJECT` should be a real contact email address managed by the school.

6. Redeploy the static frontend after updating `config.js`. Students then sign in on each device and click **Enable device alerts** in My Queue.

Web Push requires HTTPS and a supported browser. Some mobile browsers require the site to be installed as a home-screen app. Each student's device must subscribe separately. The student can disable device alerts from the same My Queue panel. Without VAPID configured, the device toggle still enables in-tab foreground notifications, but does not send after the site is closed.

### Configure email alerts (optional)

1. Create a Resend account and verify a sending domain that the school controls.
2. Create an API key.
3. Set secrets on the Supabase project:

   ```bash
   supabase secrets set RESEND_API_KEY="YOUR_RESEND_API_KEY"
   supabase secrets set EMAIL_FROM="GNC Cashier <notifications@your-verified-domain.edu>"
   ```

4. The student checks **Email notification** and clicks **Save email preference** in My Queue.

The Edge Function checks the authenticated caller's database role (`admin` or `cashier`), verifies that the ticket is currently `serving`, and sends only to the student attached to that ticket. The student's current Supabase Auth email is preferred over the profile's cached email. Push and email delivery are isolated, so a misconfigured VAPID key does not prevent a configured email channel from sending, and vice versa. Push subscriptions and email preferences are protected by row-level security. The service-role key is used only inside the Edge Function runtime.

### Notification behavior and delivery status

Both admin-panel call actions and the cashier desk's **Call next** action invoke `notify-student-turn` after the database successfully changes the ticket to `serving`. Queue operation success is not rolled back when a delivery provider is unavailable: the cashier still calls the number, and the admin/cashier interface reports that notification delivery needs configuration. The browser service worker displays push notifications and opens the My Queue page when clicked.

The project source can be statically checked in this workspace, but live database execution, push delivery, and email delivery must be tested after applying the SQL migration and configuring the Supabase Edge Function/provider secrets.


## Interactive campus map

The public home page now includes an interactive campus directory based on the reference image supplied by the school project owner. Students can select Beta Building, Banzali Hall, Tanjangco Hall, Goseco Hall, Puno Hall, Limlingan Hall, Narciso Hall, Parking 1, or Parking 2 from the directory or map markers. The Main Gate is the route origin and the home control returns the camera to it. Zoom controls and a reset control are included. The room guide preserves the supplied floor convention: 100 = 1st floor, 200 = 2nd floor, 300 = 3rd floor, and 400 = 4th floor.

**Map accuracy note:** the supplied reference is a rendered campus illustration, not a georeferenced or surveyed plan. The highlighted paths are illustrative visual guides only; confirm exact pedestrian access and room locations with campus staff before relying on them for wayfinding.


## Interactive campus map — final 2D / 3D edition

The campus directory opens in **2D** by default. Visitors can switch between **2D** and **3D** using the map toolbar. The 2D view remains available when WebGL is unavailable; Three.js and OrbitControls load only when the visitor chooses 3D. If the CDN or WebGL cannot initialize, the map reports the issue and returns to 2D rather than remaining stuck on a loading screen.

### 2D image quality

The original supplied map artwork is 351 × 570 pixels. `assets/gnc-campus-map-reference-hd.png` is a 6× Lanczos enlargement (2106 × 3420) with restrained contrast, color, and sharpening adjustments. This improves interpolation and reduces visible pixel edges when zooming, but it cannot recreate fine details that were not present in the small original. The original JPG is retained in `assets/` as the untouched source.

### 3D architectural model

The 3D view is not a tilted screenshot. It builds separate extruded building meshes from the supplied campus plan and adds facade details: instanced multi-floor windows with frames and mullions, floor bands, corner pilasters, roof parapets, and cast shadows. Tanjangco, the upper Limlingan wing, Puno, Goseco wings, and Main Gate use sloped hip-roof meshes. Goseco is modeled as a U-shaped complex around an open courtyard. The separate basketball gym uses a raised curved Philippine-flag canopy; Beta remains an enclosed cashier building with a green roof. Parking 1 and Parking 2 have raised decks and painted parking-bay lines. Main Gate is an open, column-supported portico so the route can pass through the entrance instead of floating above a solid roof.

The camera starts in a full-campus isometric view. Selecting a destination animates the camera toward that building; zoom, orbit, pan, reset, and return-to-gate controls are available. Destination labels and transparent hit areas support both directory selection and direct map selection.

### Walking routes

The 2D and 3D modes keep separate waypoint sets so the lines can fit each view's visible walkways. All nine routes are orthogonal, with no spline curves or diagonal shortcuts. The 3D path is a thin red center line with a white edge and moving white direction markers, placed close to the ground plane. The Main Gate is the common origin; destinations are Beta Building, Banzali Hall, Tanjangco Hall, Goseco Hall, Puno Hall, Limlingan Hall, Narciso Hall, Parking 1, and Parking 2.

### Accuracy and technical notes

The source plan is an illustration, not a surveyed architectural drawing or GIS map. Building heights, facade details, camera paths, and pedestrian routes are modeled interpretations of the supplied video and route examples. GNCI should verify building footprints, entrances, pedestrian access, and room locations before treating the map as official wayfinding or safety guidance.

The 3D map requires WebGL and an internet connection to load Three.js r161 and OrbitControls from jsDelivr. The 2D mode does not depend on Three.js. No Supabase database migration is required for this campus-map update; existing authentication, cashier queue, admin controls, and notification code remain separate and unchanged.


## Beta Building, separate flag-roof gym, and Rizal Monument correction

Beta Building is the enclosed green cashier/administration building. It is modeled separately from the adjacent open-sided basketball gym. Beta has a three-storey facade, individual framed windows, floor bands, three cashier service windows, a public entrance and porch, a physical cashier sign, and a horizontal red/blue two-field roof.

The basketball gym is a separate open-sided structure. Beta Building is positioned behind it toward the north-west, rather than directly alongside the gym. The gym's curved canopy carries a procedurally generated Philippine flag matching the supplied close-up reference: blue on the left, red on the right, and the white triangle with the sun and stars at the near/south end. The flag material is rendered only on the exterior roof surface; the underside is a plain warm soffit, and the original flag artwork is masked out of the 3D ground texture beneath the gym/Beta area. Beneath the canopy is a raised school-event stage at the north end, with a platform, broad steps, backdrop, curtains, lectern and microphone; the basketball court begins farther south so the stage and court do not overlap.

The supplied Rizal statue cutout remains in the Goseco courtyard with a ground shadow and monument label. The gym spectator bleachers face east toward the court: the lowest row is nearest the playing surface, while the rear rows rise toward the west; the backrests and access stair are oriented accordingly. The Limlingan Hall pedestrian bridges remain independent and unchanged. The approved 2D map and its routes, plus Supabase cashier/admin/notification integrations, are preserved. No database migration is required.


## November 15 update — Beta Gym and Rizal Monument

### Beta Building
- Earlier prototype incorrectly combined Beta with the gym; the current model separates the enclosed cashier building from the adjacent flag-roof gym.
- Added a red gym apron and inset blue playing court.
- Added straight court boundary lines, centre line and centre circle, free-throw boxes and arcs, two backboards, and two basket rims.
- Added six green structural supports so the flag canopy reads as a roof over the gym rather than a flag painted on a solid classroom block.
- Beta's roof is solid school green. The Philippine flag is reserved for the separate gym canopy, not Beta's roof or the court floor.

### Rizal Monument
- Added the supplied Rizal statue photograph as a transparent cutout sprite with camera-facing orientation, so its likeness remains visible while users orbit the 3D campus.
- Positioned the monument in the center of the open Goseco courtyard between Goseco Hall and Beta Building.
- Added a soft ground shadow and a `RIZAL MONUMENT` plaque.
- The statue asset is `assets/rizal-statue-cutout.png`.

### Compatibility and deployment
- No Supabase schema change is required.
- No cashier, administrator, authentication, notification, or queue API code was changed.
- The source 2D campus artwork and both 2D/3D route point arrays are preserved.
- Deploy the ZIP contents at the root of the Vercel project.

Note: the statue uses the supplied photo as a camera-facing 3D scene sprite rather than a sculpted polygon mesh. This preserves the recognizable photographic likeness, but it is not a fully sculpted 360-degree statue model.


## Limlingan pedestrian bridge correction

The 3D campus model includes two covered pedestrian spans matching the blue corridor locations in the supplied campus plan: a central covered bridge between Tanjangco and Goseco leading toward Limlingan, and a Limlingan-to-Beta side bridge. See `LIMLINGAN_BRIDGE_FIX_NOTES.md`. No Supabase migration is required.


## Latest visual refinement: parking, flag canopy, and 2D map

- Parking 1 and Parking 2 use generated fine-grain asphalt materials, higher-contrast bay markings, drive-aisle guidance, curbs, wheel stops, planted corner islands, low-poly parked vehicles, lighting poles, and parking identifiers.
- The Philippine flag canopy is now an elevated arched roof above the separate open gym, with the flag correctly oriented as red upper field, blue lower field, and white triangle at the end. Raised fascia, canopy ribs and underside beams make the overhead structure visibly separate from the playing surface.
- The supplied 2D campus layout is unchanged; its high-resolution derivative has mild sharpening and the display size has been increased while preserving its aspect ratio.
- No Supabase migration is required.

The 2D map is still the best fallback on unsupported devices. The 3D campus requires WebGL and the configured Three.js CDN imports.


## Parking and Philippine-flag canopy refinement

- Parking 1 and Parking 2 have a procedurally generated asphalt surface (no screenshot texture), higher-contrast stall lines, row boundaries, center-aisle guidance, arrows, curbs, wheel stops, pedestrian crossing marks, planting islands, light poles, parking identifiers and a small number of low-poly parked vehicles.
- The gym's Philippine-flag canopy is raised above the court with a higher arched profile, fascia, underside beams and extended structural supports. The flag texture is oriented red-over-blue, with the white triangle and sun/stars toward the end of the canopy.
- The source campus illustration used by 2D remains unchanged in layout. Its high-resolution derivative is gently sharpened and the responsive 2D display is larger.
- Existing cashier, admin, Supabase, and notification modules are retained. No database migration is needed for this visual-only update.


## Final Beta placement and gym stage correction

- Repositioned the enclosed Beta cashier building to the north-west/back of the basketball gym (3D footprint x=204..232, z=285..377).
- Updated the Beta 3D hit area, selected-map focus, and 3D route endpoint to match the new cashier entrance approach. The approved 2D route linework remains orthogonal.
- Explicitly fixed the flag texture orientation: red at the far/north edge, blue at the near/south edge, and the white triangle with sun/stars on the right/east end, matching the latest supplied screenshot.
- Added a raised indoor/outdoor event stage under the canopy: platform, fascia, broad steps, backdrop wall, folded curtain panels, side wings, school-stage sign, lectern and microphone.
- Shifted the basketball court start line south to keep the stage and court geometry separate.
- No Supabase schema or notification changes are required.


## Latest gym canopy and Beta roof correction

- Philippine-flag canopy texture now follows the supplied top-down orientation: blue left, red right, and the white triangle with sun/stars at the near end.
- The flag remains exclusively on the raised gym canopy; the basketball court floor is a clean blue playing surface.
- Three rows of stepped spectator benches with seat boards, backrests, support tiers, and access steps are added along the gym sideline.
- Beta Building's cashier-office roof is now entirely school green; the separate red/blue flag canopy belongs to the gym only.

No database migration is required for these visual changes.


## Latest Philippine-flag canopy, spectator seating and Beta roof correction

- Gym canopy flag now matches the supplied close-up orientation: blue left, red right, and the white triangle with sun/stars at the near end of the long roof.
- The national flag is only on the elevated canopy; the basketball court is an unmarked blue playing surface with court lines, not a flag graphic.
- Added three stepped spectator bench rows with seat slats, backrests, solid supports and a separate access stair.
- Changed the entire Beta Building cashier roof to school green. Red/blue flag-colored panels were removed from Beta; the gym retains the separate flag canopy.

No Supabase database migration is required.


## November 15 correction — flag surface and spectator seating

- The Philippine flag remains on the raised curved gym canopy only. Its layout is blue on the left, red on the right, with the white triangle, sun and three stars at the near/south end, following the latest close-up reference.
- The roof flag uses corrected UV direction and a front-face exterior material. A plain cream soffit is placed below it so the flag is not visible as a mirrored image from inside the gym.
- The 2D planning graphic's flag footprint is masked from the 3D ground texture across the full Beta/gym apron, then replaced with a subtle concrete joint pattern. The 2D source image itself remains unchanged.
- Spectator benches now face east toward the basketball court. The front/lowest row is nearest the court; the middle and rear rows step progressively higher toward the west. Backrests are placed on the west/rear edge, and the access stair climbs from the court side toward the back rows.
- No database migration is required. Cashier, admin, authentication, queue, and notification integrations are unchanged.


## Student email verification callback

New student registrations send a Supabase email confirmation link to `/email-verified.html`. After Supabase confirms the email, this page clears the callback session and shows a GNC-branded message: “Your email is now verified. You may now log in.” The button returns to the main portal with the Login tab selected.

In Supabase Dashboard, open **Authentication → URL Configuration** and add the deployed callback URL to **Redirect URLs**, for example:

`https://YOUR-VERCEL-DOMAIN/email-verified.html`

Also add the local development callback URL if needed, e.g. `http://localhost:5500/email-verified.html`. Replace `YOUR-VERCEL-DOMAIN` with the exact live hostname. If the callback URL is not allow-listed, Supabase may reject or redirect the confirmation flow to the Site URL.

## Pause / resume reliability

The admin dashboard reads the global setting independently of the cashier and audit panels. Pause and Resume now perform a read-after-write verification against `get_queue_system_status()` before displaying a success message. The student homepage polls the public status every four seconds and refreshes immediately when the tab regains focus. The student auth and ticket forms remain disabled whenever status is paused or cannot be verified.

## Existing Supabase project: pause/resume migration

For an already-deployed GNC database, run `gnc_pause_resume_reliability_patch.sql` once in Supabase SQL Editor. It ensures the global `queue_system_settings` row exists, recreates the public status read and admin-only pause/resume RPCs, reapplies their execute grants, and reloads the PostgREST schema cache. It does not delete queue tickets or profiles.

## Supabase email confirmation URL allow-list

This build requests the Supabase confirmation callback at:

`https://gnc-cashier-appointment-system.vercel.app/email-verified.html`

In Supabase Dashboard → Authentication → URL Configuration, add that exact URL to **Redirect URLs**. Set the **Site URL** to `https://gnc-cashier-appointment-system.vercel.app`. For local testing, also allow the exact local URL you use, such as `http://127.0.0.1:5500/email-verified.html` or `http://localhost:5500/email-verified.html`.

Registration sends the student to the branded confirmation page. On successful confirmation, the callback page clears the temporary confirmation session and displays a verified message. The student then clicks **Continue to sign in**, returning to `index.html?verified=1#authPanel` with the Login tab selected. Unverified sign-in attempts show a resend-verification action.
