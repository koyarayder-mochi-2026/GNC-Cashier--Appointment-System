# GNC Student Cashier Queue API

The system uses Supabase's generated REST API (PostgREST) and Supabase Auth API. No separate Express server is required. The browser calls these endpoints through `api.js` and `@supabase/supabase-js`; database authorization is enforced by PostgreSQL Row Level Security and `SECURITY DEFINER` RPC functions.

## Base URL and headers

Base URL:

```text
https://YOUR-PROJECT-REF.supabase.co
```

Every REST request includes:

```http
apikey: YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
Content-Type: application/json
```

Protected requests also require the signed-in user's access token:

```http
Authorization: Bearer USER_ACCESS_TOKEN
```

Use the public publishable/anon key in the frontend. Never expose the `service_role` key or a secret key in browser JavaScript, HTML, CSS, or a public repository.

## Authentication API

These are handled using `supabase.auth` in `app.js`:

| Operation | Supabase endpoint | Access |
|---|---|---|
| Register student | `POST /auth/v1/signup` | Public sign-up policy |
| Sign in | `POST /auth/v1/token?grant_type=password` | Public |
| Sign out | Supabase Auth SDK sign-out | Signed-in user |
| Restore session | Supabase Auth SDK session restore | Browser session |

At sign-up, the database trigger creates a `profiles` record and forces `role = 'student'`. The client cannot assign itself cashier/admin privileges.

## Read endpoints

| Operation | Method and path | Access | Response |
|---|---|---|---|
| List active cashier services | `GET /rest/v1/services?select=id,code,name,description&is_active=eq.true&order=name.asc` | Authenticated | Active services only |
| List active cashier windows | `GET /rest/v1/cashier_windows?select=id,code,name,location_description,is_active&is_active=eq.true&order=code.asc` | Authenticated | Active counters |
| Public counter board | `POST /rest/v1/rpc/get_public_queue_status` | Public publishable key | Counter name/code, open/closing flag, currently serving ticket, waiting count; no student data |
| Get my active ticket | `GET /rest/v1/queue_tickets?...` | Authenticated; RLS limits to own ticket | Student's waiting/serving ticket |
| Get staff queue | `GET /rest/v1/queue_tickets?...` | Cashier/admin; RLS limits to staff | Current counter's active queue |

The public board RPC is intentionally public so the television display can work without a staff login. It returns only aggregate counts, whether the counter is accepting new tickets, and the ticket currently being served. It does not reveal student names, student numbers, email addresses, or notes.

## Transaction RPC endpoints

### Issue a queue ticket

```http
POST /rest/v1/rpc/take_queue_number
Authorization: Bearer USER_ACCESS_TOKEN
Content-Type: application/json
```

```json
{
  "p_service_id": "SERVICE_UUID",
  "p_cashier_window_id": null,
  "p_student_note": "Optional note, max 240 characters"
}
```

Set `p_cashier_window_id` to a cashier UUID to select a specific counter, or `null` to automatically assign the shorter active line. The SQL RPC returns `result_ticket_id`, `result_ticket_code`, `result_cashier_window_id`, `result_cashier_window_name`, and `result_queue_date`; `api.js` maps these to the UI fields `ticket_id`, `ticket_code`, `cashier_window_id`, `cashier_window_name`, and `queue_date`.

### Get position in line

```http
POST /rest/v1/rpc/get_my_queue_position
```

```json
{ "p_ticket_id": "TICKET_UUID" }
```

Returns the ticket's one-based position among waiting tickets. `0` means the student is currently being served. The function verifies ticket ownership.

### Cancel my waiting ticket

```http
POST /rest/v1/rpc/cancel_my_queue_ticket
```

```json
{ "p_ticket_id": "TICKET_UUID" }
```

A student can cancel only their own ticket while it is waiting and dated today in `Asia/Manila`.

### Cashier calls the next ticket

```http
POST /rest/v1/rpc/staff_call_next
```

```json
{ "p_cashier_window_id": "CASHIER_WINDOW_UUID" }
```

Cashier/admin role required. Returns the called ticket UUID. The function locks the counter, refuses to call a second student while one is serving, and claims the oldest waiting ticket atomically.

### Cashier completes or skips a ticket

```http
POST /rest/v1/rpc/staff_update_queue_ticket
```

```json
{
  "p_ticket_id": "TICKET_UUID",
  "p_new_status": "completed",
  "p_staff_note": null
}
```

Allowed new statuses are `completed`, `no_show`, and `cancelled`, subject to the current ticket state. Cashier/admin role required.

## Example: direct REST request from a backend or API client

```bash
curl --request POST \
  --url 'https://YOUR-PROJECT-REF.supabase.co/rest/v1/rpc/get_public_queue_status' \
  --header 'apikey: YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{}'
```

For an authenticated operation, add:

```bash
--header 'Authorization: Bearer USER_ACCESS_TOKEN'
```

## API security model

- Supabase Auth issues the user access token.
- RLS limits profile and ticket reads to the owner or authorized staff.
- Students cannot directly insert, update, or delete queue ticket rows.
- Ticket creation, cancellation, call-next, and cashier status changes use database RPC functions that validate the caller.
- Ticket number generation uses a transactional counter; a day-scoped advisory lock keeps automatic shortest-line selection from racing against simultaneous requests.
- A partial unique index prevents more than one active ticket per student per Philippine calendar day and more than one currently-serving ticket per counter/day.
- The internal ticket counter table is not directly accessible to browser users.

## Error responses

Supabase returns standard PostgREST JSON error bodies with fields such as `code`, `message`, `details`, and `hint`. The frontend displays the returned message in the relevant form or toast. Common expected errors include:

- Student already has an active ticket today.
- No cashier counter is open.
- Selected cashier is unavailable.
- Ticket is no longer cancellable.
- Staff account is not authorized.
- A ticket is already being served at the selected cashier.

## Note on deployment

These endpoints become live only after `supabase_setup.sql` is run in the target Supabase project and the frontend `config.js` is populated with that project's URL and publishable key. This repository contains the implementation, but does not have access to deploy into or validate against the school's Supabase account.


### RPC ambiguity fix (2026-11-14)

The ticket creation RPC returns `result_cashier_window_id` and `result_queue_date` rather than output names that duplicate table columns. This avoids PL/pgSQL output-variable collisions in the atomic queue-counter upsert. The public queue summary RPC is implemented in SQL language and returns `cashier_window_id` safely. The current complete SQL setup already includes this correction; use `admin_call_rpc_and_notifications.sql` for the current missing admin-call RPC repair.

## Administrator API additions

| RPC | Access | Purpose |
|---|---|---|
| `POST /rest/v1/rpc/get_queue_system_status` | Public | Read the saved student-intake open/paused state and public message. |
| `POST /rest/v1/rpc/get_admin_auth_email` | Public, fixed username only | Resolve `GNCICashier2026` to its registered Supabase Auth email; the Auth API still verifies the password. |
| `POST /rest/v1/rpc/admin_set_queue_access` | Admin only | Persist pause/resume and record an audit event. |
| `POST /rest/v1/rpc/admin_call_queue_ticket` | Admin only | Call a selected waiting ticket when its cashier has no current serving ticket. |

`admin_set_queue_access` accepts `{ "p_enabled": false, "p_message": "..." }` to pause or `{ "p_enabled": true, "p_message": null }` to resume. `admin_call_queue_ticket` accepts `{ "p_ticket_id": "TICKET_UUID" }`. Existing staff RPCs remain available while student intake is paused.

The admin username is an identifier, not a password. Create the corresponding Supabase Auth user with a real school-controlled email and a privately configured password, then run `admin_account_setup.sql` to set its `username` and `role`.

### Explicit student-profile relationship

Queue list queries must select the student profile using the `student_id` foreign key:

```js
.select('id,ticket_code,status,created_at,student_note,profiles!queue_tickets_student_id_fkey(full_name,student_number),services(name)')
```

`queue_tickets` also references `profiles` through `called_by` and `handled_by`; an unqualified
`profiles(...)` embed is ambiguous in PostgREST.


## Queue-call notifications

The admin and cashier call-next workflows invoke the Supabase Edge Function `notify-student-turn` after the `staff_call_next` or `admin_call_queue_ticket` RPC succeeds. The Edge Function accepts `{ "ticket_id": "UUID" }`, verifies the signed-in staff role, verifies that the referenced ticket is in `serving` status, and confirms the caller is the staff member recorded in `called_by`. It then sends Web Push to that student's active subscriptions and email only when their `queue_notification_preferences.email_enabled` setting is true.

Students manage alert preferences and browser subscriptions from the My Queue page. Notification tables are private under RLS. Delivery requires deploying `supabase/functions/notify-student-turn` and configuring VAPID secrets for Web Push and/or Resend secrets for email. The browser contains only the public VAPID key and Supabase publishable key.


The notification preference row has `device_enabled` and `email_enabled` flags. In-tab browser alerts require the student to opt in and grant notification permission. Background Web Push additionally requires a saved `queue_push_subscriptions` row and VAPID secrets.


The exact admin RPC repair for an existing deployment is `admin_call_rpc_and_notifications.sql`. Run the entire script once in Supabase SQL Editor; it also installs the opt-in notification preference/subscription tables.

### Edge Function: notify the student whose number is called

```http
POST /functions/v1/notify-student-turn
Authorization: Bearer STAFF_ACCESS_TOKEN
Content-Type: application/json
```

```json
{ "ticket_id": "TICKET_UUID" }
```

Only an authenticated `admin` or `cashier` may call this function, and the ticket must already be in `serving` status. The function sends to the student attached to that ticket only. Device delivery is Web Push (VAPID + saved browser subscription); email delivery is opt-in and uses the student's current Supabase Auth email via a verified Resend sender. The response contains `push.sent`, `push.failed`, `push.skipped`, `email.sent`, and `email.skipped` so the cashier UI can report which channel delivered. The two channels fail independently.
