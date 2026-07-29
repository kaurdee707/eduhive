// supabase/functions/send-due-date-reminders/index.ts
//
// Deploy with: supabase functions deploy send-due-date-reminders
// Requires these secrets set first:
//   supabase secrets set RESEND_API_KEY=your_resend_api_key
//   supabase secrets set RESEND_FROM="Your App <reminders@yourdomain.com>"
// (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are already available
// automatically inside every Edge Function — no need to set those yourself.)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const RESEND_FROM = Deno.env.get("RESEND_FROM") || "Reminders <onboarding@resend.dev>";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: RESEND_FROM, to, subject, html }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Resend API error (${res.status}): ${text}`);
  }
}

Deno.serve(async (_req) => {
  try {
    // Window: assignments due within the next 24 hours from right now.
    const now = new Date();
    const windowEnd = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const todayStr = now.toISOString().slice(0, 10);
    const windowEndStr = windowEnd.toISOString().slice(0, 10);

    // Assignments due today or tomorrow (date-only column), already open
    // (start_date passed or not set), still active.
    const { data: assignments, error: aErr } = await supabase
      .from("assignments")
      .select("id, title, subject, due_date, start_date, class_id, teacher_id")
      .eq("status", "active")
      .gte("due_date", todayStr)
      .lte("due_date", windowEndStr);

    if (aErr) throw aErr;
    if (!assignments?.length) {
      return new Response(JSON.stringify({ sent: 0, message: "No assignments due in window." }), { status: 200 });
    }

    // Skip any assignment that hasn't opened yet
    const eligible = assignments.filter(a => !a.start_date || a.start_date <= todayStr);

    let sentCount = 0;
    const errors: string[] = [];

    for (const a of eligible) {
      // Who is this assignment assigned to?
      const { data: assignedTo } = await supabase
        .from("assignment_students")
        .select("student_id")
        .eq("assignment_id", a.id);
      if (!assignedTo?.length) continue;

      const studentIds = assignedTo.map(x => x.student_id);

      // Who has already submitted (or has a review pending) — skip these
      const { data: submissions } = await supabase
        .from("submissions")
        .select("student_id, status")
        .eq("assignment_id", a.id)
        .in("student_id", studentIds);
      const doneIds = new Set((submissions || [])
        .filter(s => s.status === "submitted" || s.status === "pending_review")
        .map(s => s.student_id));

      // Who's already been reminded for this assignment — skip these too
      const { data: alreadySent } = await supabase
        .from("assignment_reminders_sent")
        .select("student_id")
        .eq("assignment_id", a.id);
      const remindedIds = new Set((alreadySent || []).map(r => r.student_id));

      const toRemind = studentIds.filter(sid => !doneIds.has(sid) && !remindedIds.has(sid));
      if (toRemind.length === 0) continue;

      const { data: students } = await supabase
        .from("students")
        .select("id, name, email")
        .in("id", toRemind);

      const { data: teacherRows } = await supabase
        .from("teachers")
        .select("name")
        .eq("id", a.teacher_id)
        .limit(1);
      const teacherName = teacherRows?.[0]?.name || "your teacher";

      for (const s of students || []) {
        if (!s.email) continue; // no contact email on file — nothing to send to
        try {
          await sendEmail(
            s.email,
            `Reminder: "${a.title}" is due soon`,
            `
              <p>Hi,</p>
              <p><strong>${s.name}</strong> has an assignment due soon:</p>
              <ul>
                <li><strong>${a.title}</strong> (${a.subject})</li>
                <li>Due: ${a.due_date}</li>
                <li>Teacher: ${teacherName}</li>
              </ul>
              <p>Please make sure it's completed before the due date.</p>
            `
          );
          await supabase.from("assignment_reminders_sent").insert({ assignment_id: a.id, student_id: s.id });
          sentCount++;
        } catch (e) {
          errors.push(`${s.name} (${a.title}): ${e.message}`);
        }
      }
    }

    return new Response(JSON.stringify({ sent: sentCount, errors }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { status: 500 });
  }
});
