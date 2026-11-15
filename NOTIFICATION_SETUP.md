# GNC queue-call notification setup

This project contains the frontend notification controls and a protected Supabase Edge Function. For an existing GNC deployment, complete the steps below before expecting background push or email delivery.

## 1. Repair the admin RPC and create notification tables

In Supabase Dashboard, open **SQL Editor → New query**. Paste and run the entire `admin_call_rpc_and_notifications.sql` file (do not run a selected fragment).

Verify the exact RPC signature:

```sql
select to_regprocedure('public.admin_call_queue_ticket(uuid)') as admin_call_rpc;
```

Expected result: `admin_call_queue_ticket(uuid)`.

Verify the notification tables:

```sql
select
  to_regclass('public.queue_notification_preferences') as preferences_table,
  to_regclass('public.queue_push_subscriptions') as push_subscriptions_table;
```

Both values should be non-null.

## 2. Deploy the notification Edge Function

The included `supabase/config.toml` is already set to project ref `eqcpsoekurzfbgykhydo`. From this extracted project folder, install the Supabase CLI and run:

```bash
supabase login
supabase link --project-ref eqcpsoekurzfbgykhydo
supabase functions deploy notify-student-turn
```

Keep JWT verification enabled. The function also verifies the request token and checks that the caller has the `admin` or `cashier` role.

## 3. Configure background device push

Generate a VAPID key pair on your own computer:

```bash
npx web-push generate-vapid-keys
```

Copy the **public** key into `config.js`:

```js
vapidPublicKey: 'PASTE_PUBLIC_VAPID_KEY_HERE'
```

Keep the **private** key out of the website, ZIP deployment, Git repository, and browser code. Set both keys as Edge Function secrets, along with a real school-managed VAPID contact email:

```bash
supabase secrets set VAPID_PUBLIC_KEY="YOUR_PUBLIC_VAPID_KEY" VAPID_PRIVATE_KEY="YOUR_PRIVATE_VAPID_KEY" VAPID_SUBJECT="mailto:YOUR-SCHOOL-IT-EMAIL"
```

Deploy the Edge Function again after changing its secrets if the CLI requests it, and redeploy the static website after editing `config.js`.

Students must sign in on each device, open **My Queue**, click **Enable device alerts**, and allow notifications in their browser. HTTPS is required. Some mobile browsers require the website to be installed as a home-screen app for background push.

Without VAPID configured, in-portal foreground notifications can still appear while a student is signed in, has enabled device alerts, granted browser notification permission, and keeps the GNC site open. Background push after closing the site will not work until VAPID is configured.

## 4. Configure email alerts (optional)

Email uses Resend. The school must own and verify the sender domain in Resend. Create a Resend API key, then set these Supabase secrets:

```bash
supabase secrets set RESEND_API_KEY="YOUR_RESEND_API_KEY" EMAIL_FROM="GNC Cashier <notifications@YOUR-VERIFIED-SCHOOL-DOMAIN>"
```

Students open **My Queue**, enable **Email notification**, and click **Save email preference**. The function sends only to the current email on the student's Supabase Auth account. It does not send email unless the student opts in and the sender configuration is valid.

## 5. What happens when a number is called

Both the admin panel's **Call next number** and **Call this** actions, plus the cashier desk's **Call next number**, first call the database RPC. After the ticket has successfully changed to `serving`, the frontend invokes `notify-student-turn` with that ticket ID. The Edge Function verifies the staff role, ticket status, and that the caller matches the ticket’s `called_by` staff member, then attempts opted-in device push and email separately. A failure in one channel does not block the other or undo the queue call.

A cashier/admin message reports when no server-delivered alert was sent and includes the configured channel's skip reason. The actual queue call remains successful even when notification providers are not configured.

## 6. Final test

1. Sign in as a student on a phone or test browser.
2. Open **My Queue** and enable device alerts and/or email alerts.
3. Take a test queue number.
4. Sign in to `/admin` and call that exact waiting ticket, or use the cashier desk's **Call next** action.
5. Confirm the ticket changes to **Now serving** and that the opted-in notification channel receives the alert.

The SQL, frontend, Edge Function, and notification-provider settings must all be deployed in their respective services. Static source checks alone cannot confirm delivery through your live Supabase/Resend accounts.
