import { createClient } from "npm:@supabase/supabase-js@2.49.8";
import webpush from "npm:web-push@3.6.7";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[char]!));
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Supabase Edge Function secrets are incomplete." }, 500);
    }

    const authorization = request.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return jsonResponse({ error: "Authentication required." }, 401);

    // Verify the caller's access token, then verify the caller's database role.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData.user) return jsonResponse({ error: "Invalid or expired session." }, 401);

    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: callerProfile, error: callerProfileError } = await serviceClient
      .from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    if (callerProfileError) throw callerProfileError;
    if (!callerProfile || !["admin", "cashier"].includes(callerProfile.role)) {
      return jsonResponse({ error: "Only authorized cashier staff can send queue-call notifications." }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const ticketId = String(body.ticket_id || "");
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ticketId)) {
      return jsonResponse({ error: "A valid ticket_id is required." }, 400);
    }

    const { data: ticket, error: ticketError } = await serviceClient
      .from("queue_tickets")
      .select("id,ticket_code,status,called_at,called_by,student_id,profiles!queue_tickets_student_id_fkey(full_name,email),cashier_windows(name),services(name)")
      .eq("id", ticketId)
      .maybeSingle();
    if (ticketError) throw ticketError;
    if (!ticket || ticket.status !== "serving" || !ticket.called_at) {
      return jsonResponse({ error: "The ticket is not currently being served. No notification was sent." }, 409);
    }
    if (ticket.called_by !== userData.user.id) {
      return jsonResponse({ error: "Only the staff member who called this ticket can send its turn notification." }, 403);
    }

    const student = Array.isArray(ticket.profiles) ? ticket.profiles[0] : ticket.profiles;
    const cashier = Array.isArray(ticket.cashier_windows) ? ticket.cashier_windows[0] : ticket.cashier_windows;
    const fullName = student?.full_name || "Student";
    const ticketCode = ticket.ticket_code;
    const cashierName = cashier?.name || "the cashier counter";
    const message = `Your queue number ${ticketCode} is now being served at ${cashierName}. Please proceed to the cashier.`;

    const results = {
      push: { sent: 0, failed: 0, skipped: false as boolean | string },
      email: { sent: false, skipped: false as boolean | string },
    };
    const { data: preference, error: preferenceError } = await serviceClient
      .from("queue_notification_preferences")
      .select("email_enabled,device_enabled")
      .eq("user_id", ticket.student_id)
      .maybeSingle();
    if (preferenceError) throw preferenceError;

    // DEVICE PUSH: only active subscriptions owned by this student are selected.
    // Channel failures are isolated so a broken push configuration cannot stop email.
    const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY")?.trim();
    const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY")?.trim();
    const vapidSubject = Deno.env.get("VAPID_SUBJECT")?.trim();
    if (!preference?.device_enabled) {
      results.push.skipped = "Student has not enabled device alerts.";
    } else if (!vapidPublic || !vapidPrivate || !vapidSubject) {
      results.push.skipped = "Web Push is not fully configured. Set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, and a real VAPID_SUBJECT contact.";
    } else {
      try {
        webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
        const { data: subscriptions, error: subscriptionError } = await serviceClient
          .from("queue_push_subscriptions")
          .select("id,endpoint,p256dh,auth")
          .eq("user_id", ticket.student_id)
          .eq("is_active", true);
        if (subscriptionError) throw subscriptionError;
        if (!subscriptions?.length) {
          results.push.skipped = "Student enabled device alerts but has not subscribed this browser to background push yet.";
        }
        for (const sub of subscriptions || []) {
          try {
            await webpush.sendNotification({
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            }, JSON.stringify({
              title: "GNC Cashier — Your turn",
              body: message,
              url: "/?view=myQueueView",
              icon: "/assets/gnc-official-crest.png",
              badge: "/assets/gnc-official-crest.png",
              tag: `gnc-${ticket.id}-${ticket.called_at}`,
            }));
            results.push.sent += 1;
          } catch (pushError) {
            results.push.failed += 1;
            const statusCode = Number((pushError as { statusCode?: number })?.statusCode || 0);
            if (statusCode === 404 || statusCode === 410) {
              await serviceClient.from("queue_push_subscriptions")
                .update({ is_active: false }).eq("id", sub.id);
            }
            console.error("Push delivery failed for subscription", sub.id, statusCode);
          }
        }
        if (results.push.failed > 0 && results.push.sent === 0) {
          results.push.skipped = "All saved device subscriptions rejected the push notification. The student should re-enable device alerts.";
        } else if (results.push.failed > 0) {
          results.push.skipped = `${results.push.failed} device subscription(s) could not be reached.`;
        }
      } catch (pushError) {
        console.error("Device push channel failed:", pushError);
        results.push.skipped = "Device push could not be sent. Check VAPID settings and the student's device subscription.";
      }
    }

    // EMAIL: opt-in only. The sender domain must be verified with Resend.
    const resendKey = Deno.env.get("RESEND_API_KEY");
    const emailFrom = Deno.env.get("EMAIL_FROM");
    if (!preference?.email_enabled) {
      results.email.skipped = "Student has not enabled email alerts.";
    } else if (!resendKey || !emailFrom) {
      results.email.skipped = "Email provider secrets are not configured.";
    } else {
      try {
        const { data: authStudent, error: authStudentError } = await serviceClient.auth.admin.getUserById(ticket.student_id);
        if (authStudentError) console.error("Could not read student Auth email", authStudentError.message);
        // Supabase Auth is the source of truth if a student has changed their login email.
        const recipient = String(authStudent?.user?.email || student?.email || "").trim();
        if (!recipient) {
          results.email.skipped = "No email address is saved for this student.";
        } else {
          const emailHtml = `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:28px;color:#153c2b"><p style="font-size:12px;letter-spacing:2px;color:#a27b10;font-weight:bold">GUAGUA NATIONAL COLLEGES, INC.</p><h1 style="font-size:24px">Your cashier number is being called</h1><p>Hello ${escapeHtml(fullName)},</p><p>${escapeHtml(message)}</p><p style="font-size:30px;font-weight:bold;color:#0b4a31;letter-spacing:2px">${escapeHtml(ticketCode)}</p><p>Please proceed to <strong>${escapeHtml(cashierName)}</strong> now. Payment is completed in person at the cashier.</p><p style="font-size:12px;color:#66776d">GNC Student Cashier Virtual Queue</p></div>`;
          const emailResponse = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: emailFrom,
              to: [recipient],
              subject: `GNC Cashier: ${ticketCode} is now being served`,
              html: emailHtml,
              text: `Hello ${fullName}. ${message}`,
            }),
          });
          if (emailResponse.ok) results.email.sent = true;
          else {
            const responseText = await emailResponse.text();
            console.error("Email provider rejected notification", emailResponse.status, responseText);
            results.email.skipped = `Email provider error (${emailResponse.status}).`;
          }
        }
      } catch (emailError) {
        console.error("Email channel failed:", emailError);
        results.email.skipped = "Email delivery failed. Check the Resend API key, sender verification, and provider logs.";
      }
    }

    return jsonResponse({ ok: true, ticket_code: ticketCode, push: results.push, email: results.email });
  } catch (error) {
    console.error("notify-student-turn failed:", error);
    return jsonResponse({ error: error?.message || "Unable to send queue notification." }, 500);
  }
});
