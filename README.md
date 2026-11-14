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
