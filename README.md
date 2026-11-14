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
- `supabase_setup.sql` — complete PostgreSQL schema, security policies, database API (RPCs), starter services and counters
- `display.html` — public TV/lobby queue display (works without a user login)
- `display.css` — display styles
- `display.js` — display polling and optional spoken announcements
- `assets/gnc-campus-loop.mp4` — compressed, muted campus hero video from the supplied reference footage
- `assets/gnc-campus-poster.jpg` — still image fallback while the hero video loads
- `API_REFERENCE.md` — REST/RPC endpoint documentation, JSON payloads, and access rules

## 1. Create the Supabase project

1. Create a Supabase project.
2. Open **SQL Editor → New query**.
3. Paste the complete `supabase_setup.sql` file and run it.
4. Open **Project Settings → API** and copy the **Project URL** and **publishable key** (or legacy anon key).
5. In **Database → Replication**, confirm `public.queue_tickets` is enabled for the `supabase_realtime` publication. The SQL script attempts to add it automatically; if your project reports it is already configured, no action is needed.

The script can run on a new project and includes compatibility steps for the earlier GNC appointment prototype: it adds/backfills `cashier_windows.ticket_prefix`, removes the earlier cashier-wide service/window write policies, and replaces the public queue summary RPC with its updated response. Existing appointment tables and their data are left in place; this queue frontend does not use them. Back up the project before applying schema changes to any database containing real records.

## 2. Configure the frontend

Edit `config.js`:

```js
window.GNC_SUPABASE_CONFIG = {
  url: 'https://YOUR-PROJECT-REF.supabase.co',
  anonKey: 'YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY'
};
```

Only the public **publishable/anon** key belongs in the browser. Never place a `service_role` or secret key in `config.js`, any frontend file, a public Git repository, or a client-side API request.

## 3. Run locally

Use a local HTTP server because the JavaScript files use ES modules:

- In VS Code, use the Live Server extension and open `index.html`; or
- From this folder, run `python -m http.server 5500` and visit `http://localhost:5500`.

Open `http://localhost:5500/display.html` on the TV / lobby monitor for the public queue board. The board refreshes every five seconds. Enable voice announcements by clicking the button once; browser audio policies require a user interaction before speech can play.

## 4. Create staff accounts securely

1. Create the administrator account using the sign-up form (or a school-controlled Supabase Auth invitation process).
2. In Supabase SQL Editor, promote the account using its actual registered email:

```sql
update public.profiles
set role = 'admin'
where email = 'school-admin@example.com';
```

3. Create cashier accounts and promote them:

```sql
update public.profiles
set role = 'cashier'
where email = 'cashier1@example.com';

update public.profiles
set role = 'cashier'
where email = 'cashier2@example.com';
```

Cashier and admin accounts can manage both cashier windows in this baseline. Students cannot choose or change their role. Keep admin accounts limited to designated school personnel.

## 5. Configure actual cashier transactions

The SQL inserts sample service rows and two counters:

- `Cashier 1` (`C1` ticket prefix)
- `Cashier 2` (`C2` ticket prefix)

The sample transaction labels are placeholders, not a verified official GNC service list. In Supabase Table Editor, edit `services` to match the school cashier office's accepted transactions. Set a counter's `is_active` to `false` to stop assigning new students to it. Its existing waiting/serving tickets remain visible on the display, and staff can finish that queue. Set it to `true` when reopened.

## 6. Queue behavior and safeguards

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

## 7. API

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

## 8. Test before real use

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

## 9. Production readiness and school approval

This project is not deployed or connected to the school's Supabase account from this workspace. Before real use, GNC must authorize the deployment, validate student identity against school records, approve the official service list and cashier procedures, set account eligibility rules, configure Auth email/redirect URLs and production domains, review data retention/privacy requirements, and perform load/security testing. The student number collected at sign-up is user-supplied in this baseline and is **not independently verified** against the registrar's database.

Also configure a production email provider / SMTP in Supabase Auth if student email verification is required. Use HTTPS hosting. Apply appropriate Supabase backups and project access controls.


## Visual theme

The portal uses a GNC-inspired forest-green, gold, and warm-ivory palette. The header includes the `Fides · Scientia · Patria` motto ribbon and a campus hero using the supplied aerial footage. The separate public display follows the same branding with high-contrast cashier panels for a lobby monitor.

The circular `GNC` mark in the navigation is a typographic placeholder, not an official school crest. Replace it with an approved transparent PNG/SVG from the school before public production. The supplied hero video is optional: replace `assets/gnc-campus-loop.mp4` and `assets/gnc-campus-poster.jpg` with school-approved media or remove the `<video>` element and keep the poster image.

## Run locally

Because the frontend uses JavaScript ES modules, run it from a local web server instead of opening the HTML file directly. For example, from this folder run:

```bash
python -m http.server 5500
```

Then open `http://localhost:5500`. VS Code Live Server also works.
