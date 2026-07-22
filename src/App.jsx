// EduHive v3 — All fixes applied
// BEFORE replacing: run eduhive-v3-fixes.sql in Supabase + npm install katex

import { useState, useEffect, useRef } from "react";
// import katex from "katex";
// import "katex/dist/katex.min.css";

// ── Supabase ──────────────────────────────────────────────────────────────────
const SB_URL = "https://cvvyumuzkuqtmtamnjoq.supabase.co";
const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN2dnl1bXV6a3VxdG10YW1uam9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNDExNDIsImV4cCI6MjA5OTgxNzE0Mn0.u_XKfm-GfplolAHTFqpOxP2ED5iUNZQYGlgsOKw6UXo";
let TOKEN = SB_KEY;

async function db(table, method = "GET", filter = "", body = null) {
  const url = `${SB_URL}/rest/v1/${table}${filter ? "?" + filter : ""}`;
  const res = await fetch(url, {
    method,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", Prefer: "return=representation" },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const text = await res.text();
  if (!res.ok) { let m; try { m = JSON.parse(text).message; } catch { m = text; } throw new Error(m || "Failed"); }
  return text ? JSON.parse(text) : null;
}

async function upsertDB(table, body) {
  const url = `${SB_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { apikey: SB_KEY, Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", Prefer: "return=representation,resolution=merge-duplicates" },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  if (!res.ok) { let m; try { m = JSON.parse(text).message; } catch { m = text; } throw new Error(m); }
  return text ? JSON.parse(text) : null;
}
async function saveAnswer(studentId, assignmentId, questionId, selectedAnswer, isCorrect = null) {
  const url = `${SB_URL}/rest/v1/student_answers?on_conflict=student_id,question_id`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=merge-duplicates"
    },
    body: JSON.stringify({
      student_id: studentId, assignment_id: assignmentId,
      question_id: questionId, selected_answer: selectedAnswer,
      is_correct: isCorrect, saved_at: new Date().toISOString()
    })
  });
  if (!res.ok) { const t = await res.text(); let m; try { m = JSON.parse(t).message; } catch { m = t; } throw new Error(m); }
  return res.json();
}
async function saveSubmission(studentId, assignmentId, data) {
  const url = `${SB_URL}/rest/v1/submissions?on_conflict=student_id,assignment_id`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=merge-duplicates"
    },
    body: JSON.stringify({ student_id: studentId, assignment_id: assignmentId, ...data })
  });
  if (!res.ok) { const t = await res.text(); let m; try { m = JSON.parse(t).message; } catch { m = t; } throw new Error(m); }
  return res.json();
}
// Shuffle an array (Fisher-Yates)
function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Get attempt number for a student on a topic (returns 1 if first time)
async function getAttemptNumber(studentId, grade, subject, topic) {
  try {
    const rows = await db(
      "student_progress", "GET",
      `student_id=eq.${studentId}&grade=eq.${encodeURIComponent(grade)}&subject=eq.${encodeURIComponent(subject)}&topic=eq.${encodeURIComponent(topic)}`
    );
    return rows && rows.length > 0 ? rows[0].attempt_number : 1;
  } catch (e) {
    return 1; // default to first attempt
  }
}

// Save/update a student's retake session (in-progress or submitted) so it survives navigating away
async function saveRetakeSession(studentId, assignmentId, data) {
  const url = `${SB_URL}/rest/v1/retake_sessions?on_conflict=student_id,assignment_id,attempt_number`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=merge-duplicates"
    },
    body: JSON.stringify({ student_id: studentId, assignment_id: assignmentId, updated_at: new Date().toISOString(), ...data })
  });
  if (!res.ok) console.error("Failed to save retake session:", await res.text());
}

// Save/update progress after a topic attempt
async function saveTopicProgress(studentId, grade, subject, topic, attemptNumber, score, percentage) {
  const url = `${SB_URL}/rest/v1/student_progress?on_conflict=student_id,grade,subject,topic`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=merge-duplicates"
    },
    body: JSON.stringify({
      student_id: studentId,
      grade, subject, topic,
      attempt_number: attemptNumber + 1, // increment for next time
      last_score: score,
      last_percentage: percentage,
      last_attempted_at: new Date().toISOString()
    })
  });
  if (!res.ok) console.error("Failed to save progress:", await res.text());
}

// Extract a YouTube video ID from any common URL shape (watch, youtu.be, shorts, embed)
function getYouTubeId(url) {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

// Read the highest set_number that exists in question_library for this topic.
// Makes the "how many sets before we shuffle" behavior dynamic instead of
// hardcoded — upload Set 4, 5, etc. and it's picked up automatically.
async function getMaxSetNumber(grade, subject, topic) {
  try {
    const rows = await db(
      "question_library", "GET",
      `grade=eq.${encodeURIComponent(grade)}&subject=eq.${encodeURIComponent(subject)}&topic=eq.${encodeURIComponent(topic)}&select=set_number&order=set_number.desc&limit=1`
    );
    return rows && rows.length > 0 ? (rows[0].set_number || 1) : 1;
  } catch (e) {
    console.error("getMaxSetNumber error:", e);
    return 1; // safe fallback — behaves like a single-set topic
  }
}

// THE KEY FUNCTION: Get the right 10 questions for this student's attempt
async function getQuestionsForStudent(grade, subject, topic, studentId) {
  try {
    const [attemptNum, maxSet] = await Promise.all([
      getAttemptNumber(studentId, grade, subject, topic),
      getMaxSetNumber(grade, subject, topic)
    ]);

    if (attemptNum <= maxSet) {
      // Still within uploaded sets: give Set 1, Set 2, ... Set maxSet in order
      const rows = await db(
        "question_library", "GET",
        `grade=eq.${encodeURIComponent(grade)}&subject=eq.${encodeURIComponent(subject)}&topic=eq.${encodeURIComponent(topic)}&set_number=eq.${attemptNum}&order=created_at.asc`
      );
      return { questions: rows || [], attemptNumber: attemptNum, maxSet };
    } else {
      // Beyond the last uploaded set: shuffle 10 random questions from ALL sets for this topic
      const allRows = await db(
        "question_library", "GET",
        `grade=eq.${encodeURIComponent(grade)}&subject=eq.${encodeURIComponent(subject)}&topic=eq.${encodeURIComponent(topic)}&order=created_at.asc`
      );
      const shuffled = shuffleArray(allRows || []);
      return { questions: shuffled.slice(0, 10), attemptNumber: attemptNum, maxSet };
    }
  } catch (e) {
    console.error("getQuestionsForStudent error:", e);
    return { questions: [], attemptNumber: 1, maxSet: 1 };
  }
}


async function uploadFile(file, userId, assignmentId) {
  const ext = file.name.split(".").pop();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${userId}/${assignmentId}/${safeName}`;
  const res = await fetch(`${SB_URL}/storage/v1/object/assignments/${path}`, {
    method: "POST",
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "true"
    },
    body: file
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error("File upload failed: " + t);
  }
  // Return the public URL
  return `${SB_URL}/storage/v1/object/public/assignments/${path}`;
}


async function sbSignUp(email, password, name) {
  const r = await fetch(`${SB_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: SB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, data: { name } })
  });
  const data = await r.json();
  return { ...data, _ok: r.ok, _status: r.status };
}
function getAuthError(res) {
  // Handles both old format {error, error_description}
  // and new GoTrue v2 format {msg, error_code, code}
  return (
    res.msg ||
    res.error_description ||
    res.message ||
    res.error?.message ||
    (typeof res.error === "string" ? res.error : null) ||
    `Auth error (status ${res._status || "?"})`
  );
}



async function sbSignIn(email, password) {
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SB_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  const data = await r.json();
  // Attach HTTP status so callers can detect errors reliably
  // regardless of which Supabase error format is returned
  return { ...data, _ok: r.ok, _status: r.status };
}

async function sbSignOut() {
  await fetch(`${SB_URL}/auth/v1/logout`, { method: "POST", headers: { apikey: SB_KEY, Authorization: `Bearer ${TOKEN}` } });
}

async function loadTeacherData(uid) {
  const [classes, students, assignments] = await Promise.all([
    db("classes", "GET", `teacher_id=eq.${uid}&order=created_at.asc`),
    db("students", "GET", `teacher_id=eq.${uid}&order=name.asc`),
    db("assignments", "GET", `teacher_id=eq.${uid}&order=created_at.desc`)
  ]);
  const cids = classes.map(c => c.id).join(",");
  const aids = assignments.map(a => a.id).join(",");
  const [cs, as2, questions, accts, subs, retakeSessions, studentAnswers] = await Promise.all([
    cids ? db("class_students", "GET", `class_id=in.(${cids})`) : Promise.resolve([]),
    aids ? db("assignment_students", "GET", `assignment_id=in.(${aids})`) : Promise.resolve([]),
    aids ? db("questions", "GET", `assignment_id=in.(${aids})&order=order_index.asc`) : Promise.resolve([]),
    db("student_accounts", "GET", `select=student_id,invite_token,invite_accepted,auth_user_id,student_name`),
    aids ? db("submissions", "GET", `assignment_id=in.(${aids})`) : Promise.resolve([]),
    aids ? db("retake_sessions", "GET", `assignment_id=in.(${aids})&order=attempt_number.asc`) : Promise.resolve([]),
    aids ? db("student_answers", "GET", `assignment_id=in.(${aids})`) : Promise.resolve([])
  ]);
  return {
    classes: classes.map(c => ({ ...c, subjects: c.subjects || [], students: cs.filter(x => x.class_id === c.id).map(x => x.student_id) })),
    students: students.map(s => ({ ...s, classes: cs.filter(x => x.student_id === s.id).map(x => x.class_id), account: accts.find(a => a.student_id === s.id) })),
    assignments: assignments.map(a => ({ ...a, assignedTo: as2.filter(x => x.assignment_id === a.id).map(x => x.student_id), questions: questions.filter(q => q.assignment_id === a.id), submissions: subs.filter(s => s.assignment_id === a.id), retakeSessions: retakeSessions.filter(rs => rs.assignment_id === a.id), studentAnswers: studentAnswers.filter(sa => sa.assignment_id === a.id) }))
  };
}

async function loadStudentData(authUserId) {
  const accounts = await db("student_accounts", "GET", `auth_user_id=eq.${authUserId}&select=*`);
  if (!accounts?.length) throw new Error("Student account not found");
  const acct = accounts[0];
  const sid = acct.student_id;

  const studentRows = await db("students", "GET", `id=eq.${sid}`);
  const student = studentRows?.[0] || { id: sid, name: acct.student_name || "Student" };

  const [cs, as2] = await Promise.all([
    db("class_students", "GET", `student_id=eq.${sid}`),
    db("assignment_students", "GET", `student_id=eq.${sid}`)
  ]);

  const classIds = cs.map(x => x.class_id).join(",");
  const assignmentIds = as2.map(x => x.assignment_id).join(",");

  const [classes, assignments, submissions, savedAnswers, questions, retakeSessions] = await Promise.all([
    classIds ? db("classes", "GET", `id=in.(${classIds})`) : Promise.resolve([]),
    assignmentIds ? db("assignments", "GET", `id=in.(${assignmentIds})&order=created_at.desc`) : Promise.resolve([]),
    assignmentIds ? db("submissions", "GET", `student_id=eq.${sid}`) : Promise.resolve([]),
    assignmentIds ? db("student_answers", "GET", `student_id=eq.${sid}`) : Promise.resolve([]),
    // ✅ FIX: load questions so the Start button appears
    assignmentIds ? db("questions", "GET", `assignment_id=in.(${assignmentIds})&order=order_index.asc`) : Promise.resolve([]),
    assignmentIds ? db("retake_sessions", "GET", `student_id=eq.${sid}`) : Promise.resolve([])
  ]);

  return {
    student: { ...student, studentId: sid },
    classes,
    assignments: assignments.map(a => {
      const attempts = retakeSessions
        .filter(rs => rs.assignment_id === a.id)
        .sort((x, y) => x.attempt_number - y.attempt_number);
      // "Current" session: an unfinished retake takes priority; otherwise the latest one
      const current = attempts.find(rs => rs.status === "in_progress") || attempts[attempts.length - 1] || null;
      return {
        ...a,
        submission: submissions.find(s => s.assignment_id === a.id) || null,
        savedAnswers: savedAnswers.filter(sa => sa.assignment_id === a.id),
        questions: questions.filter(q => q.assignment_id === a.id),  // ✅ FIX: attach questions
        retakeSession: current
      };
    })
  };
}


// ── Constants ─────────────────────────────────────────────────────────────────
const SUBJECTS = ["Math","English","Science","History","Art","Punjabi","Physical Ed","Computer Science"];
const GRADES = ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"];
const SUBJECT_COLORS = { Math:{bg:"#EDE9FE",text:"#5B21B6",dot:"#7C3AED"}, English:{bg:"#DBEAFE",text:"#1E40AF",dot:"#3B82F6"}, Science:{bg:"#D1FAE5",text:"#065F46",dot:"#10B981"}, History:{bg:"#FEF3C7",text:"#92400E",dot:"#F59E0B"}, Art:{bg:"#FCE7F3",text:"#9D174D",dot:"#EC4899"}, Punjabi:{bg:"#FFF7ED",text:"#9A3412",dot:"#EA580C"}, "Physical Ed":{bg:"#F0FDF4",text:"#14532D",dot:"#22C55E"}, "Computer Science":{bg:"#F0F9FF",text:"#0C4A6E",dot:"#0EA5E9"} };
const AC = ["#4F46E5","#059669","#D97706","#DC2626","#7C3AED","#0891B2"];
const getAC = id => AC[Math.abs((id||"").charCodeAt(0)||0) % AC.length];
const sc = s => SUBJECT_COLORS[s] || {bg:"#F1F5F9",text:"#475569",dot:"#94A3B8"};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-thumb{background:#C7D2E8;border-radius:3px}
.ni{display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:10px;cursor:pointer;transition:all 0.18s;color:#94A3B8;font-size:14px;font-weight:500}
.ni:hover{background:rgba(255,255,255,0.08);color:#E2E8F0} .ni.on{background:rgba(79,70,229,0.3);color:#fff;font-weight:600}
.card{background:#fff;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.06)}
.btn1{background:#4F46E5;color:#fff;border:none;padding:10px 20px;border-radius:10px;cursor:pointer;font-weight:600;font-size:14px;transition:all 0.18s;font-family:inherit}
.btn1:hover{background:#4338CA;transform:translateY(-1px)} .btn1:disabled{background:#A5B4FC;cursor:wait;transform:none}
.btn2{background:#F1F5F9;color:#475569;border:none;padding:10px 20px;border-radius:10px;cursor:pointer;font-weight:500;font-size:14px;font-family:inherit} .btn2:hover{background:#E2E8F0}
.btnd{background:#FEE2E2;color:#DC2626;border:none;padding:7px 14px;border-radius:8px;cursor:pointer;font-weight:500;font-size:13px;font-family:inherit}
.btng{background:#D1FAE5;color:#065F46;border:none;padding:7px 14px;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;font-family:inherit}
.btno{background:#FEF3C7;color:#92400E;border:none;padding:7px 14px;border-radius:8px;cursor:pointer;font-weight:600;font-size:13px;font-family:inherit}
.inp{width:100%;padding:10px 14px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:14px;outline:none;transition:border 0.15s;font-family:inherit} .inp:focus{border-color:#4F46E5}
.sel{width:100%;padding:10px 14px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:14px;outline:none;background:#fff;font-family:inherit}
.lbl{font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;display:block}
.bdg{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600}
.ovl{position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:100;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
.modal{background:#fff;border-radius:20px;padding:32px;width:600px;max-width:95vw;max-height:92vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.25)}
.cc{background:#fff;border-radius:14px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.06);cursor:pointer;transition:all 0.18s;border:2px solid transparent}
.cc:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1)}
.sr{display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid #F1F5F9} .sr:last-child{border-bottom:none}
.av{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff;flex-shrink:0}
.ai{padding:16px;border-radius:12px;background:#F8FAFF;border:1.5px solid #E8EEFF;margin-bottom:10px;transition:all 0.15s}
.chip{display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:500}
.ckl{display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;cursor:pointer} .ckl:hover{background:#F8FAFF}
.tab{padding:8px 16px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;color:#64748B;transition:all 0.15s;border:none;background:none;font-family:inherit} .tab.on{background:#4F46E5;color:#fff}
.err{background:#FEE2E2;color:#DC2626;padding:10px 14px;border-radius:10px;font-size:13px;margin-bottom:12px}
.qcard{background:#F8FAFF;border:2px solid #E2E8F0;border-radius:14px;padding:20px;margin-bottom:12px;transition:border 0.15s}
.qcard.answered{border-color:#4F46E5;background:#EEF2FF}
.opt{display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:10px;border:2px solid #E2E8F0;cursor:pointer;margin-bottom:8px;transition:all 0.15s;background:#fff}
.opt:hover{border-color:#818CF8;background:#F5F3FF}
.opt.selected{border-color:#4F46E5;background:#EEF2FF}
.opt.correct{border-color:#10B981;background:#D1FAE5}
.opt.wrong{border-color:#EF4444;background:#FEE2E2}
.explanation-box{background:#FFFBEB;border:1.5px solid #FCD34D;border-radius:10px;padding:12px 16px;margin-top:10px;font-size:13px;color:#92400E;line-height:1.5}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.fade{animation:fadeIn 0.3s ease}
`;

// ── FIX 1: Math Text Renderer ─────────────────────────────────────────────────
function MathText({ text }) {
  if (!text) return null;
  const k = window.katex;
  if (!k) return <span>{text}</span>;
  const parts = text.split(/(\$(?:[^$\\]|\\.)+?\$)/g);
  return (
    <span>
      {parts.map((part, i) => {
        if (part.startsWith("$") && part.endsWith("$") && part.length > 2) {
          const math = part.slice(1, -1);
          try {
            const html = k.renderToString(math, { throwOnError: false, output: "html", trust: true });
            return <span key={i} dangerouslySetInnerHTML={{ __html: html }} />;
          } catch { return <span key={i}>{part}</span>; }
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}


function Loader({ text = "Loading…" }) {
  return <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "60vh", gap: 16 }}><div style={{ width: 40, height: 40, border: "3px solid #E2E8F0", borderTopColor: "#4F46E5", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /><div style={{ color: "#64748B", fontSize: 14 }}>{text}</div></div>;
}

// ── FIX 6: Invite Setup Screen (name now from student_name field) ─────────────
function InviteSetupScreen({ token, onLogin }) {
  const [studentInfo, setStudentInfo] = useState(null);
  const [pass, setPass] = useState(""); const [pass2, setPass2] = useState("");
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const rows = await db("student_accounts", "GET", `invite_token=eq.${token}&select=id,email,auth_email,username,student_name,invite_accepted,student_id`);
        if (!rows?.length) setError("Invalid or expired invite link. Ask your teacher for a new one.");
        else if (rows[0].invite_accepted) setError("This invite has already been used. Go back and log in with your username and password.");
        else setStudentInfo(rows[0]);
      } catch (e) { setError(e.message); }
      finally { setLoading(false); }
    })();
  }, [token]);

  const setup = async () => {
    if (pass.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (pass !== pass2) { setError("Passwords don't match."); return; }
    setSaving(true); setError("");
    try {
      const signupEmail = studentInfo.auth_email || studentInfo.email;
      if (!signupEmail) throw new Error("No login email found. Ask your teacher to resend the invite link.");

      const res = await sbSignUp(signupEmail, pass, studentInfo.student_name);

      if (!res._ok) {
        // If account already exists, try signing in instead
        if (res._status === 400 && (res.msg || "").toLowerCase().includes("already")) {
          const signIn = await sbSignIn(signupEmail, pass);
          if (!signIn._ok) throw new Error("Account already exists. Try logging in directly.");
          TOKEN = signIn.access_token;
          const data = await loadStudentData(signIn.user.id);
          onLogin({ type: "student", session: signIn, data });
          window.history.replaceState({}, "", window.location.pathname);
          return;
        }
        throw new Error(getAuthError(res));
      }

      if (!res.access_token) {
        setError("Please check your email to confirm your account, then log in with your username and password.");
        return;
      }

      TOKEN = res.access_token;
      const data = await loadStudentData(res.user.id);
      onLogin({ type: "student", session: res, data });
      window.history.replaceState({}, "", window.location.pathname);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };


  if (loading) return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#0F172A,#1E1B4B)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <style>{CSS}</style><Loader text="Loading your invite…" />
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#0F172A 0%,#1E1B4B 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter','Outfit',sans-serif" }}>
      <style>{CSS}</style>
      <div style={{ background: "#fff", borderRadius: 24, padding: 40, width: 440, maxWidth: "95vw", boxShadow: "0 24px 80px rgba(0,0,0,0.4)" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ fontSize: 48, marginBottom: 8 }}>🎓</div>
          <div style={{ fontFamily: "Outfit,sans-serif", fontSize: 24, fontWeight: 800, color: "#0F172A" }}>Welcome to EduHive!</div>
          {studentInfo && <div style={{ color: "#64748B", fontSize: 15, marginTop: 6 }}>Hi <strong style={{ color: "#4F46E5" }}>{studentInfo.student_name || "Student"}</strong>! Set a password to get started.</div>}
          {error && !studentInfo && <div style={{ color: "#DC2626", marginTop: 12, fontSize: 14, background: "#FEE2E2", padding: "10px 14px", borderRadius: 10 }}>{error}</div>}
        </div>

        {studentInfo && <>
          {/* Show username prominently */}
          <div style={{ background: "linear-gradient(135deg,#EEF2FF,#E0E7FF)", borderRadius: 12, padding: "14px 18px", marginBottom: 20, border: "2px solid #C7D2FE" }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "#4338CA", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>🔑 Your Login Username</div>
            <div style={{ fontFamily: "Outfit,sans-serif", fontSize: 22, fontWeight: 800, color: "#0F172A" }}>{studentInfo.username || studentInfo.student_name?.toLowerCase().replace(/\s+/g, "_")}</div>
            <div style={{ fontSize: 12, color: "#64748B", marginTop: 4 }}>Remember this! You'll need it every time you log in.</div>
          </div>

          {error && <div className="err">{error}</div>}
          <div style={{ marginBottom: 14 }}><label className="lbl">Set Your Password</label><input className="inp" type="password" placeholder="Minimum 6 characters" value={pass} onChange={e => setPass(e.target.value)} /></div>
          <div style={{ marginBottom: 24 }}><label className="lbl">Confirm Password</label><input className="inp" type="password" placeholder="Repeat password" value={pass2} onChange={e => setPass2(e.target.value)} onKeyDown={e => e.key === "Enter" && setup()} /></div>
          <button className="btn1" onClick={setup} disabled={saving} style={{ width: "100%", padding: 13, fontSize: 15, background: "#059669" }}>
            {saving ? "Creating your account…" : "Create Account & Login 🚀"}
          </button>
        </>}
      </div>
    </div>
  );
}

// ── Auth Screen ───────────────────────────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [tab, setTab] = useState("teacher");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleTeacher = async () => {
    setLoading(true); setError("");
    try {
      if (tab === "signup") {
        const res = await sbSignUp(email, pass, name);
        if (!res._ok) { setError(getAuthError(res)); return; }
        if (!res.access_token) {
          setError("Check your email to confirm your account, then log in.");
          return;
        }
        TOKEN = res.access_token;
        const data = await loadTeacherData(res.user.id);
        onLogin({ type: "teacher", session: res, data });
      } else {
        const res = await sbSignIn(email, pass);
        if (!res._ok) { throw new Error(getAuthError(res)); }
        if (!res.user?.id) throw new Error("Login failed — please try again.");
        TOKEN = res.access_token;
        // Check if this person is a student
        const studentAccts = await db("student_accounts", "GET", `auth_user_id=eq.${res.user.id}`);
        if (studentAccts?.length) {
          const data = await loadStudentData(res.user.id);
          onLogin({ type: "student", session: res, data });
        } else {
          const data = await loadTeacherData(res.user.id);
          onLogin({ type: "teacher", session: res, data });
        }
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };



   const handleStudent = async () => {
    if (!username.trim()) { setError("Please enter your username."); return; }
    if (!pass.trim()) { setError("Please enter your password."); return; }
    setLoading(true); setError("");
    try {
      // Look up student account by username
      const accts = await db("student_accounts", "GET", `username=eq.${username.trim().toLowerCase()}`);
      if (!accts?.length) {
        throw new Error(`No student found with username "${username.trim()}". Check with your teacher.`);
      }
      const acct = accts[0];

      // Try auth_email first (new system), then fall back to real email (old system)
      const primaryEmail = acct.auth_email;
      const fallbackEmail = acct.email;

      let res = null;

      // Attempt 1: auth_email (new invite system)
      if (primaryEmail) {
        res = await sbSignIn(primaryEmail, pass);
      }

      // Attempt 2: if first failed or no auth_email, try real email
      if ((!res || !res._ok) && fallbackEmail && fallbackEmail !== primaryEmail) {
        res = await sbSignIn(fallbackEmail, pass);
      }

      if (!res) {
        throw new Error("No login email found for this account. Ask your teacher to resend the invite link.");
      }

      if (!res._ok) {
        throw new Error("Incorrect password. Please try again.");
      }

      if (!res.user?.id) {
        throw new Error("Login failed — unexpected response. Please try again.");
      }

      TOKEN = res.access_token;
      const data = await loadStudentData(res.user.id);
      onLogin({ type: "student", session: res, data });

    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };



  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#0F172A 0%,#1E1B4B 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Inter','Outfit',sans-serif" }}>
      <style>{CSS}</style>
      <div style={{ background: "#fff", borderRadius: 24, padding: 40, width: 440, maxWidth: "95vw", boxShadow: "0 24px 80px rgba(0,0,0,0.4)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, background: "linear-gradient(135deg,#4F46E5,#7C3AED)", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 12px" }}>🎓</div>
          <div style={{ fontFamily: "Outfit,sans-serif", fontSize: 26, fontWeight: 800, color: "#0F172A" }}>EduHive</div>
          <div style={{ color: "#64748B", fontSize: 14, marginTop: 4 }}>Smart Tutoring Platform</div>
        </div>

        {/* Top tabs: Teacher / Student */}
        <div style={{ display: "flex", background: "#F1F5F9", borderRadius: 12, padding: 4, marginBottom: 24, gap: 4 }}>
          <button onClick={() => { setTab("login"); setError(""); }} style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit", background: tab === "login" || tab === "signup" ? "#fff" : "transparent", color: tab === "login" || tab === "signup" ? "#0F172A" : "#64748B", transition: "all 0.18s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            👩‍🏫 Teacher
          </button>
          <button onClick={() => { setTab("student"); setError(""); }} style={{ flex: 1, padding: "10px", borderRadius: 9, border: "none", cursor: "pointer", fontSize: 14, fontWeight: 600, fontFamily: "inherit", background: tab === "student" ? "#fff" : "transparent", color: tab === "student" ? "#0F172A" : "#64748B", transition: "all 0.18s", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            👨‍🎓 Student
          </button>
        </div>

        {/* Student Login */}
        {tab === "student" && <>
          <div style={{ background: "#F0F9FF", borderRadius: 12, padding: "12px 16px", marginBottom: 20, fontSize: 13, color: "#0369A1" }}>
            Students: enter the <strong>username</strong> your teacher gave you + your password.
          </div>
          <div style={{ marginBottom: 14 }}>
            <label className="lbl">Username</label>
            <input className="inp" placeholder="e.g. arjun_singh" value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label className="lbl">Password</label>
            <input className="inp" type="password" placeholder="••••••••" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === "Enter" && handleStudent()} />
          </div>
          {error && <div className="err">{error}</div>}
          <button className="btn1" onClick={handleStudent} disabled={loading} style={{ width: "100%", padding: 13, fontSize: 15, background: "#059669" }}>
            {loading ? "Signing in…" : "Login as Student"}
          </button>
        </>}

        {/* Teacher Login / Signup */}
        {tab !== "student" && <>
          <div style={{ display: "flex", background: "#F8FAFF", borderRadius: 10, padding: 4, marginBottom: 20, gap: 4, border: "1px solid #E2E8F0" }}>
            {["login", "signup"].map(t => <button key={t} onClick={() => { setTab(t); setError(""); }} style={{ flex: 1, padding: "8px", borderRadius: 7, border: "none", cursor: "pointer", fontSize: 13, fontWeight: 600, fontFamily: "inherit", background: tab === t ? "#4F46E5" : "transparent", color: tab === t ? "#fff" : "#64748B", transition: "all 0.18s" }}>{t === "login" ? "Login" : "Sign Up"}</button>)}
          </div>
          {tab === "signup" && <div style={{ marginBottom: 14 }}><label className="lbl">Your Name</label><input className="inp" placeholder="e.g. Mrs. Kaur" value={name} onChange={e => setName(e.target.value)} /></div>}
          <div style={{ marginBottom: 14 }}><label className="lbl">Email</label><input className="inp" type="email" placeholder="teacher@school.com" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div style={{ marginBottom: 20 }}><label className="lbl">Password</label><input className="inp" type="password" placeholder="••••••••" value={pass} onChange={e => setPass(e.target.value)} onKeyDown={e => e.key === "Enter" && handleTeacher()} /></div>
          {error && <div className="err">{error}</div>}
          <button className="btn1" onClick={handleTeacher} disabled={loading} style={{ width: "100%", padding: 13, fontSize: 15 }}>
            {loading ? "Please wait…" : tab === "login" ? "Login to EduHive" : "Create Teacher Account"}
          </button>
        </>}
      </div>
    </div>
  );
}

// ── Root ──────────────────────────────────────────────────────────────────────
export default function TutoringApp() {
  const [inviteToken, setInviteToken] = useState(null);
  const [appUser, setAppUser] = useState(null);
  useEffect(() => { const p = new URLSearchParams(window.location.search); const t = p.get("invite"); if (t) setInviteToken(t); }, []);
  const handleLogin = info => setAppUser(info);
  const handleLogout = async () => { await sbSignOut(); TOKEN = SB_KEY; setAppUser(null); setInviteToken(null); };
  if (!appUser && inviteToken) return <InviteSetupScreen token={inviteToken} onLogin={handleLogin} />;
  if (!appUser) return <AuthScreen onLogin={handleLogin} />;
  if (appUser.type === "student") return <StudentApp initialData={appUser.data} session={appUser.session} onLogout={handleLogout} />;
  return <TeacherApp initialData={appUser.data} session={appUser.session} onLogout={handleLogout} />;
}

// ── Teacher App ───────────────────────────────────────────────────────────────
function TeacherApp({ initialData, session, onLogout }) {
  const [classes, setClasses] = useState(initialData.classes);
  const [students, setStudents] = useState(initialData.students);
  const [assignments, setAssignments] = useState(initialData.assignments);
  const [appLoading, setAppLoading] = useState(false);
  const [view, setView] = useState("dashboard");
  const [modal, setModal] = useState(null); const [modalData, setModalData] = useState({});
  const [sidebar, setSidebar] = useState(true);
  const user = { id: session.user.id, email: session.user.email, name: session.user.user_metadata?.name || session.user.email.split("@")[0] };
  const reload = async () => { setAppLoading(true); try { const d = await loadTeacherData(user.id); setClasses(d.classes); setStudents(d.students); setAssignments(d.assignments); } catch (e) { console.error(e); } finally { setAppLoading(false); } };
  const openModal = (type, data = {}) => { setModal(type); setModalData(data); };
  const closeModal = () => { setModal(null); setModalData({}); };
  const ctx = { classes, students, assignments, openModal, reload, userId: user.id };
  const navItems = [{ id: "dashboard", label: "Dashboard", icon: "⊞" }, { id: "classes", label: "My Classes", icon: "🏫" }, { id: "students", label: "Students", icon: "👨‍🎓" }, { id: "assignments", label: "Assignments", icon: "📋" }, { id: "results", label: "Results", icon: "📊" }, { id: "subjects", label: "Subjects & Grades", icon: "📚" }];
  return (
    <div style={{ fontFamily: "'Inter','Outfit',sans-serif", display: "flex", height: "100vh", background: "#F0F2F8", overflow: "hidden" }}>
      <style>{CSS}</style>
      <div style={{ width: sidebar ? 240 : 72, background: "linear-gradient(180deg,#0F172A 0%,#1E1B4B 100%)", display: "flex", flexDirection: "column", padding: "20px 12px", transition: "width 0.25s", flexShrink: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 24, padding: "0 4px" }}>
          <div style={{ width: 36, height: 36, background: "linear-gradient(135deg,#4F46E5,#7C3AED)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 18 }}>🎓</div>
          {sidebar && <div><div style={{ fontFamily: "Outfit,sans-serif", color: "#fff", fontWeight: 800, fontSize: 16 }}>EduHive</div><div style={{ color: "#475569", fontSize: 10 }}>Teacher Portal</div></div>}
        </div>
        <nav style={{ flex: 1 }}>{navItems.map(n => <div key={n.id} className={`ni${view === n.id ? " on" : ""}`} onClick={() => setView(n.id)} title={n.label}><span style={{ fontSize: 18, flexShrink: 0 }}>{n.icon}</span>{sidebar && <span>{n.label}</span>}</div>)}</nav>
        {sidebar && <div style={{ marginTop: 16, padding: "8px 4px", borderTop: "1px solid #1E293B" }}><div style={{ color: "#475569", fontSize: 11, marginBottom: 4 }}>Signed in as</div><div style={{ color: "#94A3B8", fontSize: 11, marginBottom: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name}</div><button onClick={onLogout} style={{ background: "rgba(239,68,68,0.15)", color: "#FCA5A5", border: "none", padding: "7px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, width: "100%", fontFamily: "inherit" }}>Sign Out</button></div>}
        <div style={{ marginTop: 12, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, padding: "6px 4px" }} onClick={() => setSidebar(!sidebar)}><span style={{ color: "#475569", fontSize: 16 }}>{sidebar ? "◀" : "▶"}</span>{sidebar && <span style={{ color: "#475569", fontSize: 12 }}>Collapse</span>}</div>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
        {appLoading ? <Loader text="Refreshing…" /> : <>
          {view === "dashboard" && <TeacherDashboard {...ctx} setView={setView} user={user} />}
          {view === "classes" && <ClassesView {...ctx} />}
          {view === "students" && <StudentsView {...ctx} />}
          {view === "assignments" && <AssignmentsView {...ctx} />}
          {view === "results" && <ResultsView {...ctx} />}
          {view === "subjects" && <SubjectsView {...ctx} />}
        </>}
      </div>
      {modal && <div className="ovl" onClick={closeModal}><div className="modal" onClick={e => e.stopPropagation()}>
        {modal === "addClass" && <AddClassModal {...ctx} close={closeModal} />}
        {modal === "addStudent" && <AddStudentModal {...ctx} close={closeModal} />}
        {modal === "addAssignment" && <AddAssignmentModal {...ctx} data={modalData} close={closeModal} />}
        {modal === "editAssignment" && <EditAssignmentModal {...ctx} data={modalData} close={closeModal} />}
        {modal === "viewAssignment" && <ViewAssignmentModal assignment={modalData.assignment} students={students} classes={classes} close={closeModal} />}
        {modal === "viewClass" && <ViewClassModal cls={modalData.cls} students={students} assignments={assignments} close={closeModal} />}
        {modal === "assignStudents" && <AssignStudentsModal cls={modalData.cls} {...ctx} close={closeModal} />}
        {modal === "studentInvite" && <StudentInviteModal student={modalData.student} {...ctx} close={closeModal} />}
        {modal === "assignmentResults" && <AssignmentResultsModal assignment={modalData.assignment} students={students} close={closeModal} />}
      </div></div>}
    </div>
  );
}

// ── Teacher Dashboard ─────────────────────────────────────────────────────────
function TeacherDashboard({ classes, students, assignments, openModal, setView, user }) {
  const active = assignments.filter(a => a.status === "active");
  return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
      <div><div style={{ fontFamily: "Outfit,sans-serif", fontSize: 28, fontWeight: 800, color: "#0F172A", letterSpacing: "-0.03em" }}>Good morning, {user.name} 👋</div><div style={{ color: "#64748B", fontSize: 15, marginTop: 4 }}>Here's your tutoring hub overview.</div></div>
      <button className="btn1" onClick={() => openModal("addAssignment")}>+ New Assignment</button>
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 16, marginBottom: 28 }}>
      {[{ label: "Total Classes", value: classes.length, icon: "🏫", color: "#4F46E5", bg: "#EDE9FE" }, { label: "Students", value: students.length, icon: "👨‍🎓", color: "#059669", bg: "#D1FAE5" }, { label: "Active Assignments", value: active.length, icon: "📋", color: "#D97706", bg: "#FEF3C7" }, { label: "Subjects Taught", value: [...new Set(classes.flatMap(c => c.subjects))].length, icon: "📚", color: "#7C3AED", bg: "#EDE9FE" }].map(s => (
        <div key={s.label} style={{ background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", borderLeft: `4px solid ${s.color}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontSize: 13, color: "#64748B", fontWeight: 500 }}>{s.label}</div><div style={{ fontFamily: "Outfit,sans-serif", fontSize: 32, fontWeight: 800, color: "#0F172A", lineHeight: 1.1, marginTop: 4 }}>{s.value}</div></div><div style={{ width: 44, height: 44, background: s.bg, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{s.icon}</div></div>
        </div>
      ))}
    </div>
    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 20 }}>
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}><div style={{ fontFamily: "Outfit,sans-serif", fontSize: 17, fontWeight: 700, color: "#0F172A" }}>Your Classes</div><button className="btn2" style={{ fontSize: 13, padding: "6px 14px" }} onClick={() => setView("classes")}>View all</button></div>
        {classes.length === 0 && <div style={{ textAlign: "center", color: "#94A3B8", padding: "20px 0" }}>No classes yet.</div>}
        {classes.map(cls => (<div key={cls.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 0", borderBottom: "1px solid #F1F5F9" }}><div style={{ width: 42, height: 42, borderRadius: 12, background: cls.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontFamily: "Outfit,sans-serif", fontWeight: 800, fontSize: 16, flexShrink: 0 }}>{cls.name[0]}</div><div style={{ flex: 1 }}><div style={{ fontWeight: 600, color: "#0F172A", fontSize: 14 }}>{cls.name}</div><div style={{ color: "#64748B", fontSize: 12 }}>{cls.grade} · {cls.students.length} students</div></div><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{cls.subjects.slice(0, 2).map(s => <span key={s} className="chip" style={{ background: sc(s).bg, color: sc(s).text }}>{s}</span>)}{cls.subjects.length > 2 && <span className="chip" style={{ background: "#F1F5F9", color: "#64748B" }}>+{cls.subjects.length - 2}</span>}</div></div>))}
      </div>
      <div className="card">
        <div style={{ fontFamily: "Outfit,sans-serif", fontSize: 17, fontWeight: 700, color: "#0F172A", marginBottom: 18 }}>Active Assignments</div>
        {active.length === 0 && <div style={{ textAlign: "center", color: "#94A3B8", padding: "20px 0" }}>No active assignments.</div>}
        {active.slice(0, 4).map(a => { const cls = classes.find(c => c.id === a.class_id); const d = Math.ceil((new Date(a.due_date) - new Date()) / 86400000); return <div key={a.id} className="ai"><div style={{ display: "flex", justifyContent: "space-between" }}><div style={{ flex: 1 }}><div style={{ fontWeight: 600, color: "#0F172A", fontSize: 14 }}>{a.title}</div><div style={{ color: "#64748B", fontSize: 12, marginTop: 2 }}>{cls?.name}{a.questions?.length > 0 && <span style={{ color: "#4F46E5" }}> · {a.questions.length}Q</span>}</div></div><span className="bdg" style={{ background: sc(a.subject).bg, color: sc(a.subject).text, fontSize: 11 }}>{a.subject}</span></div><div style={{ marginTop: 8, fontSize: 11, color: d <= 2 ? "#DC2626" : "#64748B", fontWeight: 600 }}>{d <= 0 ? "Past due" : `Due in ${d}d`}</div></div>; })}
      </div>
    </div>
  </div>);
}

// ── FIX 4 & 5: Student Invite Modal ──────────────────────────────────────────
function StudentInviteModal({ student, reload, close }) {
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedUser, setCopiedUser] = useState(false);
  const [resending, setResending] = useState(false);
  const [alreadyActive, setAlreadyActive] = useState(false);
  const [error, setError] = useState("");

  const loadOrCreateInvite = async () => {
    setLoading(true); setError("");
    try {
      // Check if account already exists for this student
      const existing = await db("student_accounts", "GET", `student_id=eq.${student.id}`);
      if (existing?.length) {
        setToken(existing[0].invite_token);
        setAlreadyActive(!!existing[0].invite_accepted);
        return;
      }
      // Create new account with username-based auth email
      const authEmail = `${student.id}@eduhive.student`;
      const studentUsername = student.username || student.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").substring(0, 20);
      const res = await fetch(`${SB_URL}/rest/v1/student_accounts`, {
        method: "POST",
        headers: { apikey: SB_KEY, Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", Prefer: "return=representation,resolution=ignore-duplicates" },
        body: JSON.stringify({ student_id: student.id, email: student.email || "", auth_email: authEmail, username: studentUsername, student_name: student.name }),
      });
      const text = await res.text();
      const created = text ? JSON.parse(text) : null;
      if (created?.length) {
        setToken(created[0].invite_token);
      } else {
        // Conflict — refetch
        const refetch = await db("student_accounts", "GET", `student_id=eq.${student.id}`);
        if (refetch?.length) { setToken(refetch[0].invite_token); setAlreadyActive(!!refetch[0].invite_accepted); }
        else setError("Could not create invite. Run eduhive-student-fix.sql in Supabase and try again.");
      }
      await reload();
    } catch (e) { setError("Error: " + e.message); }
    finally { setLoading(false); }
  };

  const resendInvite = async () => {
    if (!confirm("Generate a new invite link? The old link will stop working.")) return;
    setResending(true);
    try {
      const newToken = Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, "0")).join("");
      await db("student_accounts", "PATCH", `student_id=eq.${student.id}`, { invite_token: newToken, invite_accepted: false });
      setToken(newToken); setAlreadyActive(false); await reload();
    } catch (e) { setError("Error: " + e.message); }
    finally { setResending(false); }
  };

  const cancelInvite = async () => {
    if (!confirm(`Cancel ${student.name}'s invite?`)) return;
    try { await db("student_accounts", "DELETE", `student_id=eq.${student.id}`); await reload(); close(); }
    catch (e) { setError("Error: " + e.message); }
  };

  useEffect(() => { loadOrCreateInvite(); }, []);

  const studentUsername = student.username || student.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").substring(0, 20);
  const inviteLink = token ? `${window.location.origin}?invite=${token}` : null;
  const qrUrl = inviteLink ? `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(inviteLink)}&bgcolor=ffffff&color=4F46E5&qzone=2` : null;
  const copy = () => { navigator.clipboard.writeText(inviteLink); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  const copyUsername = () => { navigator.clipboard.writeText(studentUsername); setCopiedUser(true); setTimeout(() => setCopiedUser(false), 2000); };

  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ fontFamily: "Outfit,sans-serif", fontSize: 22, fontWeight: 800, color: "#0F172A", marginBottom: 4 }}>Student Invite</div>
      <div style={{ color: "#64748B", fontSize: 14, marginBottom: 20 }}>Share this with <strong>{student.name}</strong> or their parent</div>

      {error && <div className="err" style={{ textAlign: "left" }}>{error}</div>}
      {loading && <Loader text="Setting up invite…" />}

      {!loading && token && <>
        {alreadyActive && <div style={{ background: "#D1FAE5", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#065F46", marginBottom: 16 }}>✓ {student.name} already has an active account.</div>}

        {/* Username highlight box */}
        <div style={{ background: "linear-gradient(135deg,#EEF2FF,#E0E7FF)", borderRadius: 14, padding: "16px 20px", marginBottom: 16, border: "2px solid #C7D2FE" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#4338CA", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>🔑 Student Login Credentials</div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fff", borderRadius: 10, padding: "10px 14px", marginBottom: 8 }}>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 11, color: "#64748B", fontWeight: 600 }}>USERNAME</div>
              <div style={{ fontFamily: "Outfit,sans-serif", fontSize: 20, fontWeight: 800, color: "#0F172A" }}>{studentUsername}</div>
            </div>
            <button onClick={copyUsername} style={{ background: "#EEF2FF", color: "#4F46E5", border: "none", padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>{copiedUser ? "✓" : "Copy"}</button>
          </div>
          <div style={{ fontSize: 12, color: "#64748B", textAlign: "left" }}>Password: set by student when they click the invite link below</div>
        </div>

        {qrUrl && <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}><div style={{ padding: 12, background: "#F8FAFF", borderRadius: 16, border: "2px solid #E8EEFF" }}><img src={qrUrl} alt="QR Code" style={{ width: 160, height: 160, display: "block" }} /></div></div>}
        <div style={{ background: "#F8FAFF", borderRadius: 10, padding: "10px 14px", marginBottom: 14, wordBreak: "break-all", fontSize: 11, color: "#4F46E5", border: "1.5px solid #C7D2FE", textAlign: "left" }}>{inviteLink}</div>

        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <button className="btn1" onClick={copy} style={{ minWidth: 110 }}>{copied ? "✓ Copied!" : "Copy Invite Link"}</button>
          <button className="btn2" onClick={() => window.open(qrUrl, "_blank")}>QR Code</button>
          <button className="btno" onClick={resendInvite} disabled={resending}>{resending ? "…" : "🔄 New Link"}</button>
          <button className="btnd" onClick={cancelInvite}>Cancel</button>
        </div>

        <div style={{ background: "#FEF3C7", borderRadius: 10, padding: "12px 16px", fontSize: 13, color: "#92400E", textAlign: "left" }}>
          <strong>📋 What to share with {student.name}:</strong><br />
          1. Click the invite link (or scan QR) → set a password<br />
          2. After that, log in at <strong>{window.location.origin}</strong><br />
          3. Click <strong>Student</strong> tab → enter username <strong>{studentUsername}</strong> + password
        </div>
      </>}
      <div style={{ marginTop: 20 }}><button className="btn2" onClick={close}>Close</button></div>
    </div>
  );
}


// ── Students View ─────────────────────────────────────────────────────────────
function StudentsView({ students, classes, openModal, reload, userId }) {
  const [search, setSearch] = useState(""); const [fg, setFg] = useState("All");
  const filtered = students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) && (fg === "All" || s.grade === fg));
  const remove = async (id) => { if (!confirm("Remove this student?")) return; await db("students", "DELETE", `id=eq.${id}`); reload(); };
  return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}><div><div style={{ fontFamily: "Outfit,sans-serif", fontSize: 26, fontWeight: 800, color: "#0F172A" }}>Students</div><div style={{ color: "#64748B", fontSize: 14, marginTop: 3 }}>{students.length} enrolled</div></div><button className="btn1" onClick={() => openModal("addStudent")}>+ Add Student</button></div>
    <div style={{ display: "flex", gap: 12, marginBottom: 20 }}><input className="inp" style={{ maxWidth: 280 }} placeholder="🔍  Search students…" value={search} onChange={e => setSearch(e.target.value)} /><select className="sel" style={{ width: 160 }} value={fg} onChange={e => setFg(e.target.value)}><option value="All">All Grades</option>{GRADES.map(g => <option key={g}>{g}</option>)}</select></div>
    <div className="card">
      {filtered.length === 0 && <div style={{ textAlign: "center", color: "#94A3B8", padding: "28px 0" }}>No students found.</div>}
      {filtered.map(s => {
        const accepted = s.account?.invite_accepted; const hasAccount = !!s.account;
        return (<div key={s.id} className="sr">
          <div className="av" style={{ background: getAC(s.id) }}>{s.avatar || s.name[0]}</div>
          <div style={{ flex: 1 }}><div style={{ fontWeight: 600, color: "#0F172A", fontSize: 14 }}>{s.name}</div><div style={{ fontSize: 12, color: "#64748B" }}>{s.grade} · {s.email}</div></div>
          <div>{accepted ? <span style={{ fontSize: 12, color: "#059669", background: "#D1FAE5", padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>✓ Active</span> : hasAccount ? <span style={{ fontSize: 12, color: "#D97706", background: "#FEF3C7", padding: "3px 10px", borderRadius: 20, fontWeight: 600 }}>⏳ Invited</span> : <span style={{ fontSize: 12, color: "#94A3B8", background: "#F1F5F9", padding: "3px 10px", borderRadius: 20 }}>No invite</span>}</div>
          <button className="btng" onClick={() => openModal("studentInvite", { student: s })}>🔗 Invite</button>
          <button className="btnd" onClick={() => remove(s.id)}>Remove</button>
        </div>);
      })}
    </div>
  </div>);
}

// ── Classes View ──────────────────────────────────────────────────────────────
function ClassesView({ classes, students, assignments, openModal, reload, userId }) {
  return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}><div><div style={{ fontFamily: "Outfit,sans-serif", fontSize: 26, fontWeight: 800, color: "#0F172A" }}>My Classes</div><div style={{ color: "#64748B", fontSize: 14, marginTop: 3 }}>Manage your classrooms</div></div><button className="btn1" onClick={() => openModal("addClass")}>+ Create Class</button></div>
    {classes.length === 0 && <div className="card" style={{ textAlign: "center", padding: 48 }}><div style={{ fontSize: 48 }}>🏫</div><div style={{ fontFamily: "Outfit,sans-serif", fontSize: 20, fontWeight: 700, color: "#0F172A", marginTop: 12 }}>No classes yet</div><button className="btn1" style={{ marginTop: 20 }} onClick={() => openModal("addClass")}>Create your first class</button></div>}
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 18 }}>
      {classes.map(cls => { const cs = students.filter(s => cls.students.includes(s.id)); const ca = assignments.filter(a => a.class_id === cls.id); return (<div key={cls.id} className="cc" style={{ borderTop: `4px solid ${cls.color}` }} onClick={() => openModal("viewClass", { cls })}><div style={{ display: "flex", justifyContent: "space-between" }}><div style={{ width: 48, height: 48, borderRadius: 14, background: cls.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: "#fff", fontFamily: "Outfit,sans-serif", fontWeight: 800 }}>{cls.name[0]}</div><span style={{ background: "#F1F5F9", color: "#475569", padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>{cls.grade}</span></div><div style={{ marginTop: 14 }}><div style={{ fontFamily: "Outfit,sans-serif", fontSize: 18, fontWeight: 700, color: "#0F172A" }}>{cls.name}</div><div style={{ color: "#64748B", fontSize: 13, marginTop: 4 }}>{cs.length} students · {ca.length} assignments</div></div><div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 14 }}>{cls.subjects.map(s => <span key={s} className="chip" style={{ background: sc(s).bg, color: sc(s).text }}>{s}</span>)}</div><div style={{ marginTop: 14, display: "flex", gap: 8 }}><button className="btn2" style={{ flex: 1, fontSize: 12, padding: "7px 0" }} onClick={e => { e.stopPropagation(); openModal("assignStudents", { cls }); }}>Students</button><button className="btn1" style={{ flex: 1, fontSize: 12, padding: "7px 0" }} onClick={e => { e.stopPropagation(); openModal("addAssignment", { classId: cls.id }); }}>+ Assignment</button></div></div>); })}
    </div>
  </div>);
}

// ── FIX 3: Assignments View with Edit button ──────────────────────────────────
function AssignmentsView({ assignments, classes, students, openModal, reload }) {
  const [tab, setTab] = useState("active");
  const filtered = assignments.filter(a => a.status === tab);
  const remove = async (id) => { if (!confirm("Delete assignment?")) return; await db("assignments", "DELETE", `id=eq.${id}`); reload(); };
  return (<div>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}><div><div style={{ fontFamily: "Outfit,sans-serif", fontSize: 26, fontWeight: 800, color: "#0F172A" }}>Assignments</div><div style={{ color: "#64748B", fontSize: 14, marginTop: 3 }}>Create and manage assignments with question banks</div></div><button className="btn1" onClick={() => openModal("addAssignment")}>+ New Assignment</button></div>
    <div style={{ display: "flex", gap: 6, marginBottom: 20, background: "#fff", padding: 6, borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", width: "fit-content" }}>
      <button className={`tab${tab === "active" ? " on" : ""}`} onClick={() => setTab("active")}>Active ({assignments.filter(a => a.status === "active").length})</button>
      <button className={`tab${tab === "past" ? " on" : ""}`} onClick={() => setTab("past")}>Past ({assignments.filter(a => a.status === "past").length})</button>
    </div>
    {filtered.length === 0 && <div className="card" style={{ textAlign: "center", padding: 40 }}><div style={{ fontSize: 40 }}>📋</div><div style={{ color: "#94A3B8", marginTop: 12 }}>No {tab} assignments</div></div>}
    {filtered.map(a => {
      const cls = classes.find(c => c.id === a.class_id); const d = Math.ceil((new Date(a.due_date) - new Date()) / 86400000);
      const hasQ = a.questions?.length > 0; const subCount = a.submissions?.length || 0;
      return (<div key={a.id} className="card" style={{ display: "flex", alignItems: "center", gap: 16, padding: "18px 24px", marginBottom: 12 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: sc(a.subject).bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{hasQ ? "📝" : "📄"}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: "#0F172A", fontSize: 15 }}>{a.title}</div>
          <div style={{ color: "#64748B", fontSize: 13, marginTop: 3 }}>{cls?.name} · {a.assignedTo.length} students</div>
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            {hasQ && <span style={{ fontSize: 11, color: "#4F46E5", background: "#EEF2FF", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>{a.questions.length} questions</span>}
            {subCount > 0 && <span style={{ fontSize: 11, color: "#059669", background: "#D1FAE5", padding: "2px 8px", borderRadius: 6, fontWeight: 600 }}>{subCount} submitted</span>}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}><span className="bdg" style={{ background: sc(a.subject).bg, color: sc(a.subject).text }}>{a.subject}</span><div style={{ fontSize: 12, marginTop: 8, color: d <= 2 && tab === "active" ? "#DC2626" : "#64748B", fontWeight: d <= 2 ? 600 : 400 }}>{tab === "past" ? `Due ${a.due_date}` : d <= 0 ? "Past due" : `Due in ${d}d`}</div></div>
        {/* FIX 3: Edit button */}
        <button className="btno" onClick={() => openModal("editAssignment", { assignment: a })}>✏️ Edit</button>
        {hasQ && subCount > 0 && <button className="btng" onClick={() => openModal("assignmentResults", { assignment: a })}>Results</button>}
        <button className="btnd" onClick={() => remove(a.id)}>Delete</button>
      </div>);
    })}
  </div>);
}

// ── Results View ──────────────────────────────────────────────────────────────
function ResultsView({ assignments, students, classes, openModal }) {
  const withSubs = assignments.filter(a => a.submissions?.length > 0);
  return (<div>
    <div style={{ marginBottom: 28 }}><div style={{ fontFamily: "Outfit,sans-serif", fontSize: 26, fontWeight: 800, color: "#0F172A" }}>Results & Grades</div><div style={{ color: "#64748B", fontSize: 14, marginTop: 3 }}>Auto-graded assignment results</div></div>
    {withSubs.length === 0 && <div className="card" style={{ textAlign: "center", padding: 48 }}><div style={{ fontSize: 48 }}>📊</div><div style={{ color: "#94A3B8", marginTop: 12 }}>No submissions yet.</div></div>}
    {withSubs.map(a => {
      const cls = classes.find(c => c.id === a.class_id); const subs = a.submissions || []; const avg = subs.length ? Math.round(subs.reduce((s, x) => s + (x.percentage || 0), 0) / subs.length) : 0;
      return (<div key={a.id} className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}><div><div style={{ fontFamily: "Outfit,sans-serif", fontSize: 17, fontWeight: 700, color: "#0F172A" }}>{a.title}</div><div style={{ color: "#64748B", fontSize: 13 }}>{cls?.name} · {a.questions?.length || 0} questions</div></div><div style={{ textAlign: "right" }}><div style={{ fontFamily: "Outfit,sans-serif", fontSize: 28, fontWeight: 800, color: avg >= 70 ? "#059669" : avg >= 50 ? "#D97706" : "#DC2626" }}>{avg}%</div><div style={{ fontSize: 12, color: "#64748B" }}>Class average</div></div></div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {subs.map(sub => { const st = students.find(s => s.id === sub.student_id); return (<div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", background: sub.percentage >= 70 ? "#D1FAE5" : sub.percentage >= 50 ? "#FEF3C7" : "#FEE2E2", borderRadius: 10 }}><div className="av" style={{ background: getAC(sub.student_id), width: 28, height: 28, fontSize: 10 }}>{st?.avatar || st?.name?.[0] || "?"}</div><div><div style={{ fontWeight: 600, fontSize: 13, color: "#0F172A" }}>{st?.name || "Unknown"}</div><div style={{ fontSize: 12, color: "#475569" }}>{sub.score}/{sub.total_points} · {sub.percentage}%</div></div></div>); })}
        </div>
        <button className="btn2" style={{ marginTop: 12, fontSize: 13 }} onClick={() => openModal("assignmentResults", { assignment: a })}>View Details</button>
      </div>);
    })}
  </div>);
}

// ── Subjects View ─────────────────────────────────────────────────────────────
function SubjectsView({ classes }) {
  return (<div>
    <div style={{ marginBottom: 28 }}><div style={{ fontFamily: "Outfit,sans-serif", fontSize: 26, fontWeight: 800, color: "#0F172A" }}>Subjects & Grades</div></div>
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div className="card"><div style={{ fontFamily: "Outfit,sans-serif", fontSize: 16, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>Subjects Being Taught</div>{SUBJECTS.map(sub => { const cnt = classes.filter(c => c.subjects.includes(sub)).length; const c2 = sc(sub); return (<div key={sub} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid #F8FAFF" }}><div style={{ width: 10, height: 10, borderRadius: "50%", background: c2.dot, flexShrink: 0 }} /><div style={{ flex: 1, fontWeight: 500, color: "#0F172A", fontSize: 14 }}>{sub}</div>{cnt > 0 ? <span className="bdg" style={{ background: c2.bg, color: c2.text }}>{cnt} class{cnt !== 1 ? "es" : ""}</span> : <span style={{ color: "#CBD5E1", fontSize: 12 }}>Not assigned</span>}</div>); })}</div>
      <div className="card"><div style={{ fontFamily: "Outfit,sans-serif", fontSize: 16, fontWeight: 700, color: "#0F172A", marginBottom: 16 }}>Classes by Grade</div>{classes.length === 0 && <div style={{ color: "#94A3B8", textAlign: "center", padding: 20 }}>No classes yet.</div>}{GRADES.map(grade => { const gc = classes.filter(c => c.grade === grade); if (!gc.length) return null; return (<div key={grade} style={{ marginBottom: 16 }}><div style={{ fontSize: 12, fontWeight: 700, color: "#94A3B8", textTransform: "uppercase", marginBottom: 8 }}>{grade}</div>{gc.map(cls => <div key={cls.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#F8FAFF", borderRadius: 10, marginBottom: 6 }}><div style={{ width: 10, height: 10, borderRadius: 3, background: cls.color, flexShrink: 0 }} /><span style={{ fontWeight: 500, fontSize: 14, color: "#0F172A", flex: 1 }}>{cls.name}</span><div style={{ display: "flex", gap: 4 }}>{cls.subjects.slice(0, 2).map(s => <span key={s} className="chip" style={{ background: sc(s).bg, color: sc(s).text, fontSize: 11 }}>{s}</span>)}</div></div>)}</div>); })}</div>
    </div>
  </div>);
}

// ── Add Class Modal ───────────────────────────────────────────────────────────
function AddClassModal({ reload, userId, close }) {
  const [name, setName] = useState(""); const [grade, setGrade] = useState(GRADES[4]); const [subs, setSubs] = useState([]); const [color, setColor] = useState("#4F46E5"); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");
  const colors = ["#4F46E5", "#059669", "#D97706", "#DC2626", "#7C3AED", "#0891B2", "#DB2777"];
  const toggle = s => setSubs(p => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  const save = async () => { if (!name.trim()) return; setLoading(true); setErr(""); try { await db("classes", "POST", "", { teacher_id: userId, name: name.trim(), grade, color, subjects: subs }); await reload(); close(); } catch (e) { setErr(e.message); } finally { setLoading(false); } };
  return (<div><div style={{ fontFamily: "Outfit,sans-serif", fontSize: 22, fontWeight: 800, color: "#0F172A", marginBottom: 24 }}>Create New Class</div>{err && <div className="err">{err}</div>}<div style={{ marginBottom: 16 }}><label className="lbl">Class Name</label><input className="inp" placeholder="e.g. Morning Stars" value={name} onChange={e => setName(e.target.value)} /></div><div style={{ marginBottom: 16 }}><label className="lbl">Grade Level</label><select className="sel" value={grade} onChange={e => setGrade(e.target.value)}>{GRADES.map(g => <option key={g}>{g}</option>)}</select></div><div style={{ marginBottom: 20 }}><label className="lbl">Subjects</label><div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>{SUBJECTS.map(s => { const c2 = sc(s); const chk = subs.includes(s); return (<label key={s} className="ckl" style={{ background: chk ? c2.bg : "#F8FAFF" }}><input type="checkbox" checked={chk} onChange={() => toggle(s)} style={{ accentColor: "#4F46E5" }} /><span style={{ fontSize: 13, fontWeight: 500, color: chk ? c2.text : "#475569" }}>{s}</span></label>); })}</div></div><div style={{ marginBottom: 24 }}><label className="lbl">Class Color</label><div style={{ display: "flex", gap: 10 }}>{colors.map(c2 => <div key={c2} onClick={() => setColor(c2)} style={{ width: 32, height: 32, borderRadius: "50%", background: c2, cursor: "pointer", border: color === c2 ? "3px solid #0F172A" : "3px solid transparent", transition: "border 0.15s" }} />)}</div></div><div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}><button className="btn2" onClick={close}>Cancel</button><button className="btn1" onClick={save} disabled={loading}>{loading ? "Saving…" : "Create Class"}</button></div></div>);
}

// ── Add Student Modal ─────────────────────────────────────────────────────────
function AddStudentModal({ reload, userId, close }) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [grade, setGrade] = useState(GRADES[4]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  // Auto-generate username from name
  const autoUsername = (n) => n.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "").substring(0, 20);

  const save = async () => {
    setErr("");
    if (!name.trim()) { setErr("Student name is required."); return; }
    if (!username.trim()) { setErr("Username is required — students use this to log in."); return; }
    if (!/^[a-z0-9_]+$/.test(username)) { setErr("Username can only contain lowercase letters, numbers and underscores."); return; }
    setLoading(true);
    try {
      const initials = name.split(" ").map(w => w[0]).join("").toUpperCase().substring(0, 2);
      await db("students", "POST", "", {
        teacher_id: userId,
        name: name.trim(),
        username: username.trim().toLowerCase(),
        email: email.trim().toLowerCase() || "",
        grade,
        avatar: initials
      });
      await reload();
      close();
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div>
      <div style={{ fontFamily: "Outfit,sans-serif", fontSize: 22, fontWeight: 800, color: "#0F172A", marginBottom: 6 }}>Add New Student</div>
      <div style={{ color: "#64748B", fontSize: 13, marginBottom: 20 }}>Students log in with their username + password — no email needed.</div>
      {err && <div className="err">{err}</div>}
      <div style={{ marginBottom: 16 }}>
        <label className="lbl">Full Name *</label>
        <input className="inp" placeholder="e.g. Arjun Singh" value={name} onChange={e => { setName(e.target.value); if (!username) setUsername(autoUsername(e.target.value)); }} />
      </div>
      <div style={{ marginBottom: 16 }}>
        <label className="lbl">Username * <span style={{ color: "#94A3B8", fontWeight: 400, fontSize: 11, textTransform: "none" }}>(student uses this to log in)</span></label>
        <input className="inp" placeholder="e.g. arjun_singh" value={username} onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} />
        {username && <div style={{ fontSize: 11, color: "#64748B", marginTop: 4 }}>Student logs in at EduHive with: <strong>{username}</strong> + their password</div>}
      </div>
      <div style={{ marginBottom: 16 }}>
        <label className="lbl">Contact Email <span style={{ color: "#94A3B8", fontWeight: 400, fontSize: 11, textTransform: "none" }}>(optional — for teacher reference only)</span></label>
        <input className="inp" type="email" placeholder="parent@gmail.com (optional)" value={email} onChange={e => setEmail(e.target.value)} />
      </div>
      <div style={{ marginBottom: 24 }}>
        <label className="lbl">Grade</label>
        <select className="sel" value={grade} onChange={e => setGrade(e.target.value)}>{GRADES.map(g => <option key={g}>{g}</option>)}</select>
      </div>
      <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
        <button className="btn2" onClick={close}>Cancel</button>
        <button className="btn1" onClick={save} disabled={loading}>{loading ? "Saving…" : "Add Student"}</button>
      </div>
    </div>
  );
}
// ── FIX 2 & 3: Question Builder (shared between Add and Edit) ─────────────────
function QuestionBuilder({ questions, setQuestions }) {
  const [showLibrary, setShowLibrary] = useState(false);

  const addQuestion = (type) => {
    setQuestions(p => [...p, {
      id: Date.now(),
      type, text: "",
      options: type === "multiple_choice" ? ["", "", "", ""] : [],
      correct: type === "true_false" ? "true" : "",
      explanation: "",
      fromLibrary: false // teacher-authored — gets auto-synced to question_library on save
    }]);
  };

  const updateQ = (id, field, val) =>
    setQuestions(p => p.map(q => q.id === id ? { ...q, [field]: val } : q));

  const updateOpt = (qid, idx, val) =>
    setQuestions(p => p.map(q => q.id === qid
      ? { ...q, options: q.options.map((o, i) => i === idx ? val : o) }
      : q
    ));

  const removeQ = (id) => setQuestions(p => p.filter(q => q.id !== id));

  const addFromLibrary = (newQuestions) => {
    setQuestions(p => [...p, ...newQuestions]);
  };

  return (
    <>
      {/* Library Browser Modal */}
      {showLibrary && (
        <div className="ovl" onClick={() => setShowLibrary(false)}>
          <div className="modal" style={{ width: 680 }} onClick={e => e.stopPropagation()}>
            <LibraryBrowser onAdd={addFromLibrary} close={() => setShowLibrary(false)} />
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button className="btn1" onClick={() => addQuestion("multiple_choice")} style={{ fontSize: 13 }}>
          + Multiple Choice
        </button>
        <button className="btn1" onClick={() => addQuestion("true_false")} style={{ fontSize: 13, background: "#059669" }}>
          + True / False
        </button>
        <button
          onClick={() => setShowLibrary(true)}
          style={{
            padding: "10px 18px", borderRadius: 10, border: "2px solid #4F46E5",
            background: "#EEF2FF", color: "#4F46E5", cursor: "pointer",
            fontSize: 13, fontWeight: 600, fontFamily: "inherit",
            display: "flex", alignItems: "center", gap: 6, transition: "all 0.18s"
          }}
        >
          📚 Browse Library
        </button>
        {questions.length > 0 && (
          <div style={{ marginLeft: "auto", fontSize: 13, color: "#64748B", display: "flex", alignItems: "center" }}>
            {questions.length} question{questions.length !== 1 ? "s" : ""} added
          </div>
        )}
      </div>

      {/* Empty state */}
      {questions.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#94A3B8", background: "#F8FAFF", borderRadius: 12 }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>❓</div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No questions yet</div>
          <div style={{ fontSize: 13 }}>Add manually above or browse the question library</div>
        </div>
      )}

      {/* Question cards */}
      {questions.map((q, qi) => (
        <div key={q.id} className="qcard">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span className="bdg" style={{
              background: q.type === "true_false" ? "#D1FAE5" : "#EDE9FE",
              color: q.type === "true_false" ? "#065F46" : "#5B21B6"
            }}>
              {q.type === "true_false" ? "True / False" : "Multiple Choice"} · Q{qi + 1}
            </span>
            <button className="btnd" onClick={() => removeQ(q.id)} style={{ padding: "4px 10px", fontSize: 12 }}>
              Remove
            </button>
          </div>

          {/* Question text */}
          <textarea
            className="inp"
            rows={2}
            placeholder="Enter question text… (use $formula$ for math, e.g. $x^2 + 3$)"
            value={q.text}
            onChange={e => updateQ(q.id, "text", e.target.value)}
            style={{ marginBottom: 8, resize: "vertical" }}
          />

          {/* Math preview */}
          {q.text && q.text.includes("$") && (
            <div style={{ background: "#F0F9FF", border: "1.5px solid #BAE6FD", borderRadius: 8, padding: "8px 12px", marginBottom: 10, fontSize: 14, color: "#0369A1" }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#0284C7", textTransform: "uppercase", letterSpacing: "0.05em", marginRight: 8 }}>Preview:</span>
              <MathText text={q.text} />
            </div>
          )}

          {/* Multiple choice options */}
          {q.type === "multiple_choice" && (
            <>
              <div style={{ marginBottom: 8 }}>
                {["A", "B", "C", "D"].map((opt, i) => (
                  <div key={opt} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span
                      onClick={() => updateQ(q.id, "correct", opt)}
                      style={{
                        width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                        background: q.correct === opt ? "#4F46E5" : "#E2E8F0",
                        color: q.correct === opt ? "#fff" : "#64748B",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700, cursor: "pointer"
                      }}
                    >
                      {opt}
                    </span>
                    <input
                      className="inp"
                      style={{ flex: 1 }}
                      placeholder={`Option ${opt}`}
                      value={q.options[i] || ""}
                      onChange={e => updateOpt(q.id, i, e.target.value)}
                    />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: "#64748B", marginBottom: 10 }}>
                Click a letter to mark correct answer. Current: <strong style={{ color: "#4F46E5" }}>{q.correct || "None"}</strong>
              </div>
            </>
          )}

          {/* True/False */}
          {q.type === "true_false" && (
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              {["true", "false"].map(v => (
                <button
                  key={v}
                  onClick={() => updateQ(q.id, "correct", v)}
                  style={{
                    flex: 1, padding: "10px", borderRadius: 10,
                    border: `2px solid ${q.correct === v ? "#4F46E5" : "#E2E8F0"}`,
                    background: q.correct === v ? "#EEF2FF" : "#fff",
                    color: q.correct === v ? "#4F46E5" : "#475569",
                    fontWeight: 600, cursor: "pointer", fontSize: 14,
                    fontFamily: "inherit", textTransform: "capitalize"
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          )}

          {/* Explanation */}
          <div>
            <label className="lbl" style={{ color: "#D97706" }}>💡 Explanation <span style={{ fontWeight: 400, textTransform: "none", color: "#94A3B8" }}>(shown to student after submission)</span></label>
            <textarea
              className="inp"
              rows={2}
              placeholder="Explain why the answer is correct…"
              value={q.explanation || ""}
              onChange={e => updateQ(q.id, "explanation", e.target.value)}
              style={{ resize: "vertical", borderColor: q.explanation ? "#FCD34D" : "#E2E8F0" }}
            />
          </div>
        </div>
      ))}
    </>
  );
}

// ── Topic Video Picker (shared between Add and Edit Assignment) ──────────────
// Lets a teacher pick an existing YouTube video linked to this topic, or add a
// new one inline. Videos are matched by grade+subject+topic, same as question_library.
function TopicVideoPicker({ grade, subject, topic, videoId, setVideoId }) {
  const [videos, setVideos] = useState([]);
  const [loadingVideos, setLoadingVideos] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setErr(""); setAdding(false); setNewTitle(""); setNewUrl("");
    if (!grade || !subject || !topic) { setVideos([]); return; }
    setLoadingVideos(true);
    (async () => {
      try {
        const rows = await db(
          "topic_videos", "GET",
          `grade=eq.${encodeURIComponent(grade)}&subject=eq.${encodeURIComponent(subject)}&topic=eq.${encodeURIComponent(topic)}&order=display_order.asc`
        );
        setVideos(rows || []);
        // If the currently selected video isn't part of this topic's list, clear it
        if (videoId && !(rows || []).some(v => v.id === videoId)) setVideoId(null);
      } catch (e) {
        console.error("Load videos error:", e);
        setVideos([]);
      } finally {
        setLoadingVideos(false);
      }
    })();
  }, [grade, subject, topic]);

  const saveNewVideo = async () => {
    if (!newUrl.trim()) { setErr("Paste a YouTube URL first."); return; }
    if (!getYouTubeId(newUrl.trim())) { setErr("That doesn't look like a valid YouTube URL."); return; }
    setSaving(true); setErr("");
    try {
      const nextOrder = videos.length > 0 ? Math.max(...videos.map(v => v.display_order || 1)) + 1 : 1;
      const [row] = await db("topic_videos", "POST", "", {
        grade, subject, topic,
        title: newTitle.trim() || null,
        youtube_url: newUrl.trim(),
        display_order: nextOrder
      });
      setVideos(p => [...p, row]);
      setVideoId(row.id);
      setAdding(false); setNewTitle(""); setNewUrl("");
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!topic) return null;

  return (
    <div style={{ marginBottom: 16, padding: 14, border: "1.5px solid #E2E8F0", borderRadius: 12, background: "#F8FAFC" }}>
      <label className="lbl">Video <span style={{ color: "#94A3B8", fontWeight: 400, textTransform: "none" }}>(optional — shown to students for this topic)</span></label>

      {loadingVideos ? (
        <div style={{ fontSize: 13, color: "#64748B" }}>Loading videos…</div>
      ) : !adding ? (
        <>
          <select className="sel" value={videoId || ""} onChange={e => e.target.value === "__add__" ? setAdding(true) : setVideoId(e.target.value || null)}>
            <option value="">No video</option>
            {videos.map(v => <option key={v.id} value={v.id}>{v.title || v.youtube_url}</option>)}
            <option value="__add__">+ Add new video…</option>
          </select>
          {videoId && getYouTubeId(videos.find(v => v.id === videoId)?.youtube_url) && (
            <div style={{ marginTop: 10, borderRadius: 10, overflow: "hidden", aspectRatio: "16/9", maxWidth: 360 }}>
              <iframe
                width="100%" height="100%"
                src={`https://www.youtube.com/embed/${getYouTubeId(videos.find(v => v.id === videoId)?.youtube_url)}`}
                title="Video preview" frameBorder="0" allowFullScreen
              />
            </div>
          )}
        </>
      ) : (
        <div style={{ marginTop: 8 }}>
          {err && <div className="err" style={{ marginBottom: 8 }}>{err}</div>}
          <input className="inp" placeholder="YouTube URL" value={newUrl} onChange={e => setNewUrl(e.target.value)} style={{ marginBottom: 8 }} />
          <input className="inp" placeholder="Title (optional)" value={newTitle} onChange={e => setNewTitle(e.target.value)} style={{ marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn2" onClick={() => { setAdding(false); setErr(""); }} style={{ fontSize: 12 }}>Cancel</button>
            <button className="btn1" onClick={saveNewVideo} disabled={saving} style={{ fontSize: 12 }}>{saving ? "Saving…" : "Save Video"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Add Assignment Modal ──────────────────────────────────────────────────────
function AddAssignmentModal({ classes, students, reload, userId, data, close }) {
  const [step, setStep] = useState(1);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [topic, setTopic] = useState("");
  const [topicOptions, setTopicOptions] = useState([]);
  const [loadingTopics, setLoadingTopics] = useState(false);
  const [videoId, setVideoId] = useState(null);
  const [classId, setClassId] = useState(data.classId || classes[0]?.id || "");
  const [dueDate, setDueDate] = useState("");
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState(null);          // actual File object
  const [fileName, setFileName] = useState(null);   // display name
  const [assignedTo, setAssignedTo] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [err, setErr] = useState("");
  const fileRef = useRef();

  const selClass = classes.find(c => c.id === classId);
  const classStudents = students.filter(s => selClass?.students.includes(s.id));

  // Load topics that actually exist in question_library for this grade+subject,
  // so teachers can't typo a topic name that has no questions behind it.
  useEffect(() => {
    if (!selClass?.grade || !subject) { setTopicOptions([]); return; }
    setLoadingTopics(true);
    setTopic("");
    (async () => {
      try {
        const rows = await db(
          "question_library", "GET",
          `grade=eq.${encodeURIComponent(selClass.grade)}&subject=eq.${encodeURIComponent(subject)}&select=topic`
        );
        setTopicOptions([...new Set((rows || []).map(r => r.topic))].sort());
      } catch (e) {
        console.error("Load topics error:", e);
        setTopicOptions([]);
      } finally {
        setLoadingTopics(false);
      }
    })();
  }, [selClass?.grade, subject]);

  const handleFile = (e) => {
    const f = e.target.files[0];
    if (f) { setFile(f); setFileName(f.name); }
  };

  const save = async () => {
    if (!title.trim() || !classId) { setErr("Title and class are required."); return; }
    setLoading(true); setErr(""); setUploadProgress("");
    try {
      // 1. Create assignment record
      setUploadProgress("Creating assignment…");
      const [newA] = await db("assignments", "POST", "", {
        teacher_id: userId, class_id: classId, subject,
        title: title.trim(), description: desc,
        topic: topic.trim() || null,
        topic_video_id: videoId || null,
        due_date: dueDate || null,
        file_name: fileName || null,
        status: "active"
      });

      // 2. Upload file if one was selected
      let fileUrl = null;
      if (file && newA.id) {
        setUploadProgress("Uploading file… please wait");
        try {
          fileUrl = await uploadFile(file, userId, newA.id);
          // Update assignment with file URL
          await db("assignments", "PATCH", `id=eq.${newA.id}`, { file_url: fileUrl });
        } catch (uploadErr) {
          // Don't fail the whole assignment if upload fails — just warn
          console.error("File upload failed:", uploadErr);
          setErr("Assignment saved but file upload failed: " + uploadErr.message);
        }
      }

      // 3. Assign to students
      setUploadProgress("Assigning to students…");
      const targets = assignedTo.length ? assignedTo : classStudents.map(s => s.id);
      await Promise.all(targets.map(sid =>
        db("assignment_students", "POST", "", { assignment_id: newA.id, student_id: sid })
      ));

      // 4. Save questions
      const validQuestions = questions.filter(q => q.text.trim() && q.correct);
      let insertedQuestions = [];
      if (validQuestions.length > 0) {
        setUploadProgress("Saving questions…");
        insertedQuestions = await Promise.all(validQuestions.map((q, i) =>
          db("questions", "POST", "", {
            assignment_id: newA.id, question_text: q.text,
            question_type: q.type,
            options: q.type === "multiple_choice" ? q.options : null,
            correct_answer: q.correct,
            explanation: q.explanation || null,
            points: 1, order_index: i,
            synced_to_library: !!q.fromLibrary
          }).then(rows => ({ row: rows[0], src: q }))
        ));
      }

      // 5. Auto-add teacher-authored (non-library) questions to the shared question library,
      // so future retakes/other assignments can draw from them too.
      const gradeForLib = selClass?.grade;
      if (topic.trim() && gradeForLib) {
        const toSync = insertedQuestions.filter(iq => !iq.src.fromLibrary);
        if (toSync.length > 0) {
          setUploadProgress("Adding your questions to the library…");
          try {
            const setNum = await getMaxSetNumber(gradeForLib, subject, topic.trim());
            await Promise.all(toSync.map(iq =>
              db("question_library", "POST", "", {
                grade: gradeForLib, subject, topic: topic.trim(),
                set_number: setNum,
                question_type: iq.src.type, question_text: iq.src.text,
                options: iq.src.type === "multiple_choice" ? iq.src.options : null,
                correct_answer: iq.src.correct, explanation: iq.src.explanation || null
              })
            ));
            await Promise.all(toSync.map(iq =>
              db("questions", "PATCH", `id=eq.${iq.row.id}`, { synced_to_library: true })
            ));
          } catch (syncErr) {
            // Non-fatal — the assignment itself is already saved successfully
            console.error("Library sync failed:", syncErr);
          }
        }
      }

      await reload();
      close();
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); setUploadProgress(""); }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontFamily: "Outfit,sans-serif", fontSize: 22, fontWeight: 800, color: "#0F172A" }}>
          {step === 1 ? "New Assignment" : "Question Builder"}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[{ n: 1, label: "① Details" }, { n: 2, label: `② Questions${questions.length > 0 ? ` (${questions.length})` : ""}` }].map(t => (
            <button key={t.n} onClick={() => setStep(t.n)} style={{ padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, background: step === t.n ? "#4F46E5" : "#F1F5F9", color: step === t.n ? "#fff" : "#475569" }}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="err">{err}</div>}
      {uploadProgress && (
        <div style={{ background: "#EEF2FF", color: "#4F46E5", padding: "10px 14px", borderRadius: 10, marginBottom: 12, fontSize: 13, fontWeight: 500 }}>
          ⏳ {uploadProgress}
        </div>
      )}

      {step === 1 && <>
        <div style={{ marginBottom: 16 }}>
          <label className="lbl">Title</label>
          <input className="inp" placeholder="e.g. Geometry Practice Test 1" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label className="lbl">Class</label>
            <select className="sel" value={classId} onChange={e => { setClassId(e.target.value); setAssignedTo([]); }}>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">Subject</label>
            <select className="sel" value={subject} onChange={e => setSubject(e.target.value)}>
              {(selClass?.subjects.length ? selClass.subjects : SUBJECTS).map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label className="lbl">Topic <span style={{ color: "#94A3B8", fontWeight: 400, textTransform: "none" }}>(optional — links to your question library so students can retake with a new set)</span></label>
          <select className="sel" value={topic} onChange={e => setTopic(e.target.value)} disabled={loadingTopics || topicOptions.length === 0}>
            <option value="">{loadingTopics ? "Loading topics…" : topicOptions.length === 0 ? "No topics found for this grade/subject" : "None (no retake)"}</option>
            {topicOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <TopicVideoPicker grade={selClass?.grade} subject={subject} topic={topic.trim()} videoId={videoId} setVideoId={setVideoId} />
        <div style={{ marginBottom: 16 }}>
          <label className="lbl">Due Date</label>
          <input className="inp" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label className="lbl">Instructions</label>
          <textarea className="inp" rows={2} placeholder="Describe the assignment…" value={desc} onChange={e => setDesc(e.target.value)} style={{ resize: "vertical" }} />
        </div>

        {/* File Upload */}
        <div style={{ marginBottom: 16 }}>
          <label className="lbl">Attach File <span style={{ color: "#94A3B8", fontWeight: 400, textTransform: "none" }}>(optional — PDF, DOCX, images, etc.)</span></label>
          <div
            onClick={() => fileRef.current.click()}
            style={{ border: `2px dashed ${file ? "#4F46E5" : "#C7D2FE"}`, borderRadius: 12, padding: 20, textAlign: "center", cursor: "pointer", background: file ? "#EEF2FF" : "#F5F3FF", transition: "all 0.18s" }}
          >
            {file ? (
              <div>
                <div style={{ fontSize: 28, marginBottom: 4 }}>📄</div>
                <div style={{ fontWeight: 600, color: "#4F46E5", fontSize: 14 }}>{file.name}</div>
                <div style={{ color: "#64748B", fontSize: 12, marginTop: 2 }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB · Click to change
                </div>
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 28, marginBottom: 8 }}>📁</div>
                <div style={{ fontWeight: 600, color: "#4F46E5", fontSize: 14 }}>Click to upload a file</div>
                <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 4 }}>Students will be able to download it</div>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" style={{ display: "none" }} onChange={handleFile} />
          {file && (
            <button onClick={() => { setFile(null); setFileName(null); fileRef.current.value = ""; }} style={{ fontSize: 12, color: "#DC2626", background: "none", border: "none", cursor: "pointer", marginTop: 6 }}>
              ✕ Remove file
            </button>
          )}
        </div>

        {/* Assign To */}
        {classStudents.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <label className="lbl" style={{ margin: 0 }}>Assign To</label>
              <button style={{ fontSize: 12, color: "#4F46E5", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                onClick={() => setAssignedTo(classStudents.map(s => s.id))}>
                Select All
              </button>
            </div>
            <div style={{ maxHeight: 130, overflowY: "auto", background: "#F8FAFF", borderRadius: 10, padding: 8 }}>
              {classStudents.map(s => (
                <label key={s.id} className="ckl">
                  <input type="checkbox" checked={assignedTo.includes(s.id)}
                    onChange={() => setAssignedTo(p => p.includes(s.id) ? p.filter(x => x !== s.id) : [...p, s.id])}
                    style={{ accentColor: "#4F46E5" }} />
                  <div className="av" style={{ background: getAC(s.id), width: 28, height: 28, fontSize: 10 }}>{s.avatar || s.name[0]}</div>
                  <span style={{ fontSize: 13, fontWeight: 500, color: "#0F172A" }}>{s.name}</span>
                </label>
              ))}
            </div>
            {assignedTo.length === 0 && <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 4 }}>No selection = assign to all students</div>}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn2" onClick={close}>Cancel</button>
          <button className="btn2" onClick={() => setStep(2)}>Add Questions →</button>
          <button className="btn1" onClick={save} disabled={loading}>{loading ? "Saving…" : "Save Assignment"}</button>
        </div>
      </>}

      {step === 2 && <>
        <QuestionBuilder questions={questions} setQuestions={setQuestions} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn2" onClick={() => setStep(1)}>← Back</button>
          <button className="btn1" onClick={save} disabled={loading}>{loading ? "Saving…" : `Save (${questions.length} question${questions.length !== 1 ? "s" : ""})`}</button>
        </div>
      </>}
    </div>
  );
}


// ── FIX 3: Edit Assignment Modal ──────────────────────────────────────────────
function EditAssignmentModal({ assignments, classes, students, reload, userId, data, close }) {
  const a = data.assignment;

  // Details state
  const [title, setTitle] = useState(a.title);
  const [subject, setSubject] = useState(a.subject);
  const [topic, setTopic] = useState(a.topic || "");
  const [videoId, setVideoId] = useState(a.topic_video_id || null);
  const [dueDate, setDueDate] = useState(a.due_date || "");
  const [desc, setDesc] = useState(a.description || "");

  // Questions state — pre-load existing questions
  const [questions, setQuestions] = useState(
    (a.questions || []).map(q => ({
      id: q.id,
      type: q.question_type,
      text: q.question_text,
      options: q.options || ["", "", "", ""],
      correct: q.correct_answer,
      explanation: q.explanation || "",
      // Already-synced questions (from the library or a prior save) won't be re-synced.
      // Legacy rows without this column default to false, so they'll sync on next save.
      fromLibrary: !!q.synced_to_library
    }))
  );

  // Assign To state — pre-load existing assignees
  const selClass = classes.find(c => c.id === a.class_id);
  const classStudents = students.filter(s => selClass?.students.includes(s.id));
  const [assignedTo, setAssignedTo] = useState(new Set(a.assignedTo || []));

  const [topicOptions, setTopicOptions] = useState([]);
  const [loadingTopics, setLoadingTopics] = useState(false);

  // Load topics that actually exist in question_library for this grade+subject.
  // Doesn't force-clear `topic` on load so the assignment's existing topic stays
  // selected if it's still valid for the (possibly changed) subject.
  useEffect(() => {
    if (!selClass?.grade || !subject) { setTopicOptions([]); return; }
    setLoadingTopics(true);
    (async () => {
      try {
        const rows = await db(
          "question_library", "GET",
          `grade=eq.${encodeURIComponent(selClass.grade)}&subject=eq.${encodeURIComponent(subject)}&select=topic`
        );
        setTopicOptions([...new Set((rows || []).map(r => r.topic))].sort());
      } catch (e) {
        console.error("Load topics error:", e);
        setTopicOptions([]);
      } finally {
        setLoadingTopics(false);
      }
    })();
  }, [selClass?.grade, subject]);

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const toggleStudent = (id) => setAssignedTo(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const save = async () => {
    setLoading(true); setErr("");
    try {
      // 1. Update assignment details
      await db("assignments", "PATCH", `id=eq.${a.id}`, {
        title: title.trim(),
        subject,
        topic: topic.trim() || null,
        topic_video_id: videoId || null,
        due_date: dueDate || null,
        description: desc
      });

      // 2. Update questions (delete all, re-insert)
      await db("questions", "DELETE", `assignment_id=eq.${a.id}`);
      const validQuestions = questions.filter(q => q.text.trim() && q.correct);
      let insertedQuestions = [];
      if (validQuestions.length > 0) {
        insertedQuestions = await Promise.all(
          validQuestions.map((q, i) =>
            db("questions", "POST", "", {
              assignment_id: a.id,
              question_text: q.text,
              question_type: q.type,
              options: q.type === "multiple_choice" ? q.options : null,
              correct_answer: q.correct,
              explanation: q.explanation || null,
              points: 1,
              order_index: i,
              synced_to_library: !!q.fromLibrary
            }).then(rows => ({ row: rows[0], src: q }))
          )
        );
      }

      // 2b. Auto-add teacher-authored (not-yet-synced) questions to the shared question library
      if (topic.trim() && selClass?.grade) {
        const toSync = insertedQuestions.filter(iq => !iq.src.fromLibrary);
        if (toSync.length > 0) {
          try {
            const setNum = await getMaxSetNumber(selClass.grade, subject, topic.trim());
            await Promise.all(toSync.map(iq =>
              db("question_library", "POST", "", {
                grade: selClass.grade, subject, topic: topic.trim(),
                set_number: setNum,
                question_type: iq.src.type, question_text: iq.src.text,
                options: iq.src.type === "multiple_choice" ? iq.src.options : null,
                correct_answer: iq.src.correct, explanation: iq.src.explanation || null
              })
            ));
            await Promise.all(toSync.map(iq =>
              db("questions", "PATCH", `id=eq.${iq.row.id}`, { synced_to_library: true })
            ));
          } catch (syncErr) {
            console.error("Library sync failed:", syncErr);
          }
        }
      }

      // 3. Update assignment_students (diff old vs new)
      const current = new Set(a.assignedTo || []);
      const toAdd = [...assignedTo].filter(id => !current.has(id));
      const toRemove = [...current].filter(id => !assignedTo.has(id));

      await Promise.all([
        ...toAdd.map(sid =>
          db("assignment_students", "POST", "", { assignment_id: a.id, student_id: sid })
        ),
        ...toRemove.map(sid =>
          db("assignment_students", "DELETE", `assignment_id=eq.${a.id}&student_id=eq.${sid}`)
        )
      ]);

      await reload();
      close();
    } catch (e) { setErr(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div>
      {/* Header with step tabs */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div style={{ fontFamily: "Outfit,sans-serif", fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Edit Assignment</div>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { n: 1, label: "① Details" },
            { n: 2, label: `② Questions${questions.length > 0 ? ` (${questions.length})` : ""}` },
            { n: 3, label: `③ Students (${assignedTo.size})` }
          ].map(t => (
            <button
              key={t.n}
              onClick={() => setStep(t.n)}
              style={{
                padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer",
                fontFamily: "inherit", fontSize: 13, fontWeight: 600,
                background: step === t.n ? "#4F46E5" : "#F1F5F9",
                color: step === t.n ? "#fff" : "#475569"
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="err">{err}</div>}

      {/* ── Step 1: Details ── */}
      {step === 1 && <>
        <div style={{ marginBottom: 16 }}>
          <label className="lbl">Title</label>
          <input className="inp" value={title} onChange={e => setTitle(e.target.value)} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label className="lbl">Subject</label>
            <select className="sel" value={subject} onChange={e => setSubject(e.target.value)}>
              {SUBJECTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="lbl">Due Date</label>
            <input className="inp" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <label className="lbl">Topic <span style={{ color: "#94A3B8", fontWeight: 400, textTransform: "none" }}>(optional — links to your question library so students can retake with a new set)</span></label>
          <select className="sel" value={topic} onChange={e => setTopic(e.target.value)} disabled={loadingTopics || topicOptions.length === 0}>
            <option value="">{loadingTopics ? "Loading topics…" : topicOptions.length === 0 ? "No topics found for this grade/subject" : "None (no retake)"}</option>
            {topicOptions.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <TopicVideoPicker grade={selClass?.grade} subject={subject} topic={topic.trim()} videoId={videoId} setVideoId={setVideoId} />
        <div style={{ marginBottom: 20 }}>
          <label className="lbl">Instructions</label>
          <textarea className="inp" rows={3} value={desc} onChange={e => setDesc(e.target.value)} style={{ resize: "vertical" }} />
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn2" onClick={close}>Cancel</button>
          <button className="btn2" onClick={() => setStep(2)}>Edit Questions →</button>
          <button className="btn1" onClick={save} disabled={loading}>{loading ? "Saving…" : "Save Changes"}</button>
        </div>
      </>}

      {/* ── Step 2: Questions ── */}
      {step === 2 && <>
        <div style={{ background: "#FEF3C7", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#92400E" }}>
          ⚠️ Saving will replace all existing questions. Student answers already submitted will remain.
        </div>
        <QuestionBuilder questions={questions} setQuestions={setQuestions} />
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 16 }}>
          <button className="btn2" onClick={() => setStep(1)}>← Back</button>
          <button className="btn1" onClick={save} disabled={loading}>{loading ? "Saving…" : "Save Changes"}</button>
        </div>
      </>}

      {/* ── Step 3: Assign To ── */}
      {step === 3 && <>
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <label className="lbl" style={{ margin: 0 }}>
              Select students to assign · <span style={{ color: "#4F46E5" }}>{assignedTo.size} selected</span>
            </label>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                style={{ fontSize: 12, color: "#4F46E5", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                onClick={() => setAssignedTo(new Set(classStudents.map(s => s.id)))}
              >
                Select All
              </button>
              <button
                style={{ fontSize: 12, color: "#94A3B8", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
                onClick={() => setAssignedTo(new Set())}
              >
                Clear All
              </button>
            </div>
          </div>

          {classStudents.length === 0 ? (
            <div style={{ textAlign: "center", color: "#94A3B8", padding: "20px 0" }}>
              No students enrolled in this class yet.
            </div>
          ) : (
            <div style={{ maxHeight: 300, overflowY: "auto", background: "#F8FAFF", borderRadius: 12, padding: 8 }}>
              {classStudents.map(s => (
                <label
                  key={s.id}
                  className="ckl"
                  style={{ background: assignedTo.has(s.id) ? "#EEF2FF" : "transparent" }}
                >
                  <input
                    type="checkbox"
                    checked={assignedTo.has(s.id)}
                    onChange={() => toggleStudent(s.id)}
                    style={{ accentColor: "#4F46E5" }}
                  />
                  <div className="av" style={{ background: getAC(s.id), width: 32, height: 32, fontSize: 11 }}>
                    {s.avatar || s.name[0]}
                  </div>
                  <div>
                    <div style={{ fontWeight: 500, fontSize: 14, color: "#0F172A" }}>{s.name}</div>
                    <div style={{ fontSize: 11, color: "#64748B" }}>{s.grade}</div>
                  </div>
                  {assignedTo.has(s.id) && (
                    <span style={{ marginLeft: "auto", fontSize: 11, color: "#4F46E5", fontWeight: 600 }}>✓ Assigned</span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button className="btn2" onClick={() => setStep(1)}>← Back</button>
          <button className="btn1" onClick={save} disabled={loading}>
            {loading ? "Saving…" : `Save & Assign to ${assignedTo.size} student${assignedTo.size !== 1 ? "s" : ""}`}
          </button>
        </div>
      </>}
    </div>
  );
}


// ── View Assignment / Results / Assign Students / View Class Modals ────────────
function ViewAssignmentModal({ assignment: a, students, classes, close }) {
  if (!a) return null;
  const cls = classes.find(c => c.id === a.class_id); const as2 = students.filter(s => a.assignedTo.includes(s.id));
  return (<div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}><div><span className="bdg" style={{ background: sc(a.subject).bg, color: sc(a.subject).text, marginBottom: 8, display: "inline-flex" }}>{a.subject}</span><div style={{ fontFamily: "Outfit,sans-serif", fontSize: 22, fontWeight: 800, color: "#0F172A" }}>{a.title}</div><div style={{ color: "#64748B", fontSize: 13, marginTop: 4 }}>{cls?.name} · Due {a.due_date}</div></div><button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#94A3B8" }} onClick={close}>✕</button></div>{a.description && <div style={{ background: "#F8FAFF", borderRadius: 10, padding: 14, marginBottom: 16, color: "#475569", fontSize: 14 }}>{a.description}</div>}{a.questions?.length > 0 && <div style={{ marginBottom: 16 }}><div style={{ fontWeight: 600, fontSize: 14, color: "#0F172A", marginBottom: 8 }}>Questions ({a.questions.length})</div>{a.questions.map((q, i) => <div key={q.id} style={{ padding: "8px 12px", background: "#F8FAFF", borderRadius: 8, marginBottom: 6, fontSize: 13 }}><strong>Q{i + 1}:</strong> <MathText text={q.question_text} /> <span style={{ color: "#4F46E5", fontWeight: 600 }}>→ {q.correct_answer}</span></div>)}</div>}<div style={{ fontWeight: 700, fontSize: 14, color: "#0F172A", marginBottom: 10 }}>Assigned to ({as2.length})</div>{as2.map(s => <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #F1F5F9" }}><div className="av" style={{ background: getAC(s.id) }}>{s.avatar || s.name[0]}</div><div style={{ fontWeight: 500, fontSize: 14, color: "#0F172A" }}>{s.name}</div></div>)}<div style={{ marginTop: 20, textAlign: "right" }}><button className="btn2" onClick={close}>Close</button></div></div>);
}

function AssignmentResultsModal({ assignment: a, students, close }) {
  const [expandedSub, setExpandedSub] = useState(null); // student_id whose original submission is expanded
  const [expandedRetake, setExpandedRetake] = useState(null); // retake_session id that's expanded
  if (!a) return null;
  const subs = a.submissions || [];
  const retakes = a.retakeSessions || [];
  const studentAnswers = a.studentAnswers || [];
  // Union of every student who has either an original submission or at least one retake attempt
  const studentIds = [...new Set([...subs.map(s => s.student_id), ...retakes.map(r => r.student_id)])];

  const QuestionBreakdown = ({ questions, getSelected }) => (
    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
      {(questions || []).map((q, i) => {
        const selected = getSelected(q);
        const correct = selected?.toLowerCase() === q.correct_answer?.toLowerCase();
        return (
          <div key={q.id || i} style={{ padding: "8px 10px", background: correct ? "#F0FDF4" : "#FEF2F2", borderRadius: 8, fontSize: 12.5, border: `1px solid ${correct ? "#BBF7D0" : "#FECACA"}` }}>
            <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <span>{correct ? "✅" : "❌"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ color: "#0F172A", fontWeight: 500 }}><MathText text={q.question_text} /></div>
                <div style={{ color: "#64748B", marginTop: 2 }}>
                  Student answered: <strong style={{ color: correct ? "#059669" : "#DC2626" }}>{selected || "(no answer)"}</strong>
                  {!correct && <> · Correct: <strong style={{ color: "#059669" }}>{q.correct_answer}</strong></>}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (<div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><div><div style={{ fontFamily: "Outfit,sans-serif", fontSize: 20, fontWeight: 800, color: "#0F172A" }}>{a.title} — Results</div><div style={{ color: "#64748B", fontSize: 13 }}>{a.questions?.length || 0} questions · {subs.length} submissions</div></div><button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#94A3B8" }} onClick={close}>✕</button></div>{studentIds.length === 0 && <div style={{ textAlign: "center", padding: 32, color: "#94A3B8" }}>No submissions yet.</div>}{studentIds.map(sid => {
    const st = students.find(s => s.id === sid);
    const sub = subs.find(s => s.student_id === sid);
    const myRetakes = retakes.filter(r => r.student_id === sid).sort((x, y) => x.attempt_number - y.attempt_number);
    const pct = sub?.percentage ?? 0;
    const subExpanded = expandedSub === sid;
    return (
      <div key={sid} style={{ padding: "14px 0", borderBottom: "1px solid #F1F5F9" }}>
        <div
          style={{ display: "flex", alignItems: "center", gap: 14, cursor: sub ? "pointer" : "default" }}
          onClick={() => sub && setExpandedSub(subExpanded ? null : sid)}
        >
          <div className="av" style={{ background: getAC(sid) }}>{st?.avatar || st?.name?.[0] || "?"}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: "#0F172A" }}>{st?.name || "Unknown"}</div>
            <div style={{ fontSize: 12, color: "#64748B" }}>
              {sub ? `Original · ${new Date(sub.submitted_at).toLocaleDateString()}` : "No original submission"}
              {sub && <span style={{ color: "#4F46E5", marginLeft: 6 }}>{subExpanded ? "▲ Hide answers" : "▼ View answers"}</span>}
            </div>
          </div>
          {sub && (
            <div style={{ textAlign: "right" }}>
              <div style={{ fontFamily: "Outfit,sans-serif", fontSize: 22, fontWeight: 800, color: pct >= 70 ? "#059669" : pct >= 50 ? "#D97706" : "#DC2626" }}>{pct}%</div>
              <div style={{ fontSize: 12, color: "#64748B" }}>{sub.score}/{sub.total_points} pts</div>
            </div>
          )}
        </div>

        {subExpanded && sub && (
          <div style={{ marginLeft: 54 }}>
            <QuestionBreakdown
              questions={a.questions}
              getSelected={q => studentAnswers.find(sa => sa.student_id === sid && sa.question_id === q.id)?.selected_answer}
            />
          </div>
        )}

        {myRetakes.length > 0 && (
          <div style={{ marginLeft: 54, marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
            {myRetakes.map(r => {
              const rExpanded = expandedRetake === r.id;
              return (
                <div key={r.id}>
                  <div
                    style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, background: "#F8FAFF", borderRadius: 8, padding: "6px 10px", cursor: r.status === "submitted" ? "pointer" : "default" }}
                    onClick={() => r.status === "submitted" && setExpandedRetake(rExpanded ? null : r.id)}
                  >
                    <span style={{ fontWeight: 600, color: "#4F46E5" }}>Retake {r.attempt_number}</span>
                    {r.status === "submitted" ? (
                      <>
                        <span style={{ fontWeight: 700, color: (r.percentage || 0) >= 70 ? "#059669" : (r.percentage || 0) >= 50 ? "#D97706" : "#DC2626" }}>{r.percentage}%</span>
                        <span style={{ color: "#64748B" }}>{r.score}/{r.total_points} pts</span>
                        <span style={{ color: "#94A3B8" }}>{new Date(r.updated_at).toLocaleDateString()}</span>
                        <span style={{ color: "#4F46E5", marginLeft: "auto" }}>{rExpanded ? "▲ Hide" : "▼ View answers"}</span>
                      </>
                    ) : (
                      <span style={{ color: "#D97706", fontWeight: 600 }}>In progress…</span>
                    )}
                  </div>
                  {rExpanded && (
                    <QuestionBreakdown
                      questions={r.questions}
                      getSelected={q => (r.answers || {})[q.id]}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  })}<div style={{ marginTop: 20, textAlign: "right" }}><button className="btn2" onClick={close}>Close</button></div></div>);
}

function AssignStudentsModal({ cls, students, reload, close }) {
  const [enrolled, setEnrolled] = useState(new Set(cls.students)); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");
  const toggle = id => setEnrolled(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const save = async () => { setLoading(true); setErr(""); try { const cur = new Set(cls.students); const toAdd = [...enrolled].filter(id => !cur.has(id)); const toRem = [...cur].filter(id => !enrolled.has(id)); await Promise.all([...toAdd.map(sid => db("class_students", "POST", "", { class_id: cls.id, student_id: sid })), ...toRem.map(sid => db("class_students", "DELETE", `class_id=eq.${cls.id}&student_id=eq.${sid}`))]); await reload(); close(); } catch (e) { setErr(e.message); } finally { setLoading(false); } };
  return (<div><div style={{ fontFamily: "Outfit,sans-serif", fontSize: 22, fontWeight: 800, color: "#0F172A", marginBottom: 6 }}>Manage Students</div><div style={{ color: "#64748B", fontSize: 14, marginBottom: 20 }}>{cls.name} · {cls.grade}</div>{err && <div className="err">{err}</div>}<div style={{ maxHeight: 340, overflowY: "auto" }}>{students.map(s => <label key={s.id} className="ckl" style={{ background: enrolled.has(s.id) ? "#EEF2FF" : "transparent" }}><input type="checkbox" checked={enrolled.has(s.id)} onChange={() => toggle(s.id)} style={{ accentColor: "#4F46E5" }} /><div className="av" style={{ background: getAC(s.id) }}>{s.avatar || s.name[0]}</div><div style={{ flex: 1 }}><div style={{ fontWeight: 500, fontSize: 14, color: "#0F172A" }}>{s.name}</div><div style={{ fontSize: 12, color: "#64748B" }}>{s.grade}</div></div></label>)}</div><div style={{ marginTop: 20, display: "flex", gap: 10, justifyContent: "flex-end" }}><button className="btn2" onClick={close}>Cancel</button><button className="btn1" onClick={save} disabled={loading}>{loading ? "Saving…" : `Save (${enrolled.size} students)`}</button></div></div>);
}

function ViewClassModal({ cls, students, assignments, close }) {
  if (!cls) return null;
  const cs = students.filter(s => cls.students.includes(s.id)); const ca = assignments.filter(a => a.class_id === cls.id);
  return (<div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}><div style={{ display: "flex", alignItems: "center", gap: 14 }}><div style={{ width: 48, height: 48, borderRadius: 14, background: cls.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, color: "#fff", fontFamily: "Outfit", fontWeight: 800 }}>{cls.name[0]}</div><div><div style={{ fontFamily: "Outfit,sans-serif", fontSize: 22, fontWeight: 800, color: "#0F172A" }}>{cls.name}</div><div style={{ color: "#64748B", fontSize: 13 }}>{cls.grade}</div></div></div><button style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#94A3B8" }} onClick={close}>✕</button></div><div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 20 }}>{cls.subjects.map(s => <span key={s} className="chip" style={{ background: sc(s).bg, color: sc(s).text }}>{s}</span>)}</div><div style={{ fontWeight: 700, fontSize: 14, color: "#0F172A", marginBottom: 10 }}>Students ({cs.length})</div>{cs.map(s => <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #F1F5F9" }}><div className="av" style={{ background: getAC(s.id) }}>{s.avatar || s.name[0]}</div><div style={{ fontWeight: 500, fontSize: 14, color: "#0F172A", flex: 1 }}>{s.name}</div></div>)}<div style={{ fontWeight: 700, fontSize: 14, color: "#0F172A", marginBottom: 10, marginTop: 20 }}>Assignments ({ca.length})</div>{ca.map(a => <div key={a.id} className="ai"><div style={{ display: "flex", justifyContent: "space-between" }}><div style={{ fontWeight: 600, color: "#0F172A", fontSize: 14 }}>{a.title}</div><span className="bdg" style={{ background: sc(a.subject).bg, color: sc(a.subject).text, fontSize: 11 }}>{a.subject}</span></div></div>)}<div style={{ marginTop: 20, textAlign: "right" }}><button className="btn2" onClick={close}>Close</button></div></div>);
}

// ── Student App ───────────────────────────────────────────────────────────────
function StudentApp({ initialData, session, onLogout }) {
  const [data, setData] = useState(initialData);
  const [view, setView] = useState("home");
  const [activeAssignment, setActiveAssignment] = useState(null);
  const [loading, setLoading] = useState(false);
  const reload = async () => { setLoading(true); try { const d = await loadStudentData(session.user.id); setData(d); } catch (e) { console.error(e); } finally { setLoading(false); } };
  const openQuiz = (assignment) => { setActiveAssignment(assignment); setView("quiz"); };
  const closeQuiz = () => { setView("home"); setActiveAssignment(null); reload(); };
  const [practiceGrade, setPracticeGrade] = useState(data?.student?.grade || "Grade 4");
const [practiceSubject, setPracticeSubject] = useState("Math");
const [practiceTopics, setPracticeTopics] = useState([]);
const [practiceTopic, setPracticeTopic] = useState(null); // { grade, subject, topic }
const [loadingTopics, setLoadingTopics] = useState(false);

  if (view === "quiz" && activeAssignment) return <QuizInterface assignment={activeAssignment} student={data.student} session={session} onClose={closeQuiz} />;
  if (!data?.student) {
    return (
      <div style={{ fontFamily: "'Inter','Outfit',sans-serif", minHeight: "100vh", background: "#F0F2F8", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="card" style={{ textAlign: "center", padding: 40, maxWidth: 400 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
          <div style={{ fontFamily: "Outfit,sans-serif", fontSize: 18, fontWeight: 700, color: "#0F172A", marginBottom: 8 }}>Could not load your data</div>
          <div style={{ color: "#64748B", fontSize: 14, marginBottom: 20 }}>
            Your account was found but student data is missing. This usually means your teacher needs to enroll you in a class first.
          </div>
          <button onClick={onLogout} className="btn1">Sign Out & Try Again</button>
        </div>
      </div>
    );
  }

  const { student, classes, assignments } = data;
  const pending = assignments.filter(a => !a.submission || a.submission.status === "in_progress");
  const submitted = assignments.filter(a => a.submission?.status === "submitted");
  return (<div style={{ fontFamily: "'Inter','Outfit',sans-serif", minHeight: "100vh", background: "#F0F2F8" }}>
    <style>{CSS}</style>
    <div style={{ background: "linear-gradient(135deg,#0F172A,#1E1B4B)", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}><div style={{ width: 36, height: 36, background: "linear-gradient(135deg,#4F46E5,#7C3AED)", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🎓</div><div><div style={{ fontFamily: "Outfit,sans-serif", color: "#fff", fontWeight: 800, fontSize: 16 }}>EduHive</div><div style={{ color: "#475569", fontSize: 11 }}>Student Portal</div></div></div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}><div style={{ color: "#94A3B8", fontSize: 13 }}>👋 {student?.name}</div><button onClick={onLogout} style={{ background: "rgba(239,68,68,0.15)", color: "#FCA5A5", border: "none", padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>Sign Out</button></div>
    </div>
    {loading ? <Loader text="Refreshing…" /> : <div style={{ padding: "28px 32px" }}>
      <div style={{ marginBottom: 28 }}><div style={{ fontFamily: "Outfit,sans-serif", fontSize: 26, fontWeight: 800, color: "#0F172A" }}>Welcome back, {student?.name?.split(" ")[0]}! 👋</div><div style={{ color: "#64748B", fontSize: 14, marginTop: 4 }}>{student?.grade} · {classes.length} classes enrolled</div></div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 28 }}>
        {[{ label: "Pending", value: pending.length, icon: "📋", color: "#D97706", bg: "#FEF3C7" }, { label: "Submitted", value: submitted.length, icon: "✅", color: "#059669", bg: "#D1FAE5" }, { label: "My Classes", value: classes.length, icon: "🏫", color: "#4F46E5", bg: "#EDE9FE" }].map(s => (<div key={s.label} style={{ background: "#fff", borderRadius: 14, padding: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)", borderLeft: `4px solid ${s.color}` }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div><div style={{ fontSize: 13, color: "#64748B" }}>{s.label}</div><div style={{ fontFamily: "Outfit,sans-serif", fontSize: 30, fontWeight: 800, color: "#0F172A", marginTop: 2 }}>{s.value}</div></div><div style={{ width: 44, height: 44, background: s.bg, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>{s.icon}</div></div></div>))}
      </div>
      <div className="card">
        <div style={{ fontFamily: "Outfit,sans-serif", fontSize: 17, fontWeight: 700, color: "#0F172A", marginBottom: 18 }}>My Assignments</div>
        {assignments.length === 0 && (
  <div style={{ textAlign: "center", color: "#94A3B8", padding: 20 }}>🎉 No assignments yet!</div>
)}

{assignments.map(a => {
  const cls = classes.find(c => c.id === a.class_id);
  const sub = a.submission;
  const rs = a.retakeSession;
  // A retake session (if any) supersedes the original submission for status/score purposes
  const status = rs ? rs.status : (sub?.status || "not_started");
  const d = Math.ceil((new Date(a.due_date) - new Date()) / 86400000);
  const hasQ = a.questions && a.questions.length > 0;

  // FIX 3: Clean button logic
  // "View Results" only after submitting a quiz
  // "View Assignment" for file/description-only assignments
  // "Start"/"Resume" for quizzes
  const btnConfig = (() => {
    if (status === "submitted") {
      return hasQ
        ? { label: "View Results →", color: "#059669", bg: "#D1FAE5" }
        : { label: "View Assignment →", color: "#475569", bg: "#F1F5F9" };
    }
    if (status === "in_progress") {
      return { label: hasQ ? "Resume →" : "View Assignment →", color: "#D97706", bg: "#FEF3C7" };
    }
    // not_started
    return { label: hasQ ? "Start Assignment →" : "View Assignment →", color: "#4F46E5", bg: "#EEF2FF" };
  })();

  const statusBadge = (() => {
    if (status === "submitted") return { text: "Submitted ✓", color: "#059669" };
    if (status === "in_progress") return { text: "In Progress", color: "#D97706" };
    return { text: d <= 0 ? "Past due!" : `Due in ${d}d`, color: d <= 2 ? "#DC2626" : "#64748B" };
  })();

  return (
    <div
      key={a.id}
      onClick={() => openQuiz(a)}
      style={{
        display: "flex", alignItems: "center", gap: 16,
        padding: "16px 12px", borderBottom: "1px solid #F1F5F9",
        cursor: "pointer", borderRadius: 10, transition: "background 0.15s"
      }}
      onMouseEnter={e => e.currentTarget.style.background = "#F8FAFF"}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
    >
      {/* Icon */}
      <div style={{ width: 44, height: 44, borderRadius: 12, background: sc(a.subject).bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>
        {status === "submitted" ? "✅" : hasQ ? "📝" : "📄"}
      </div>

      {/* Info */}
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: "#0F172A", fontSize: 15 }}>{a.title}</div>
        <div style={{ color: "#64748B", fontSize: 12, marginTop: 2 }}>{cls?.name} · {a.subject}</div>
        {hasQ && (
          <div style={{ fontSize: 12, color: "#4F46E5", marginTop: 2 }}>
            {rs ? `${rs.questions?.length || 0} question${(rs.questions?.length || 0) !== 1 ? "s" : ""} · Retake ${rs.attempt_number}` : `${a.questions.length} question${a.questions.length !== 1 ? "s" : ""}`}
            {status === "in_progress" && !rs && a.savedAnswers?.length > 0 ? ` · ${a.savedAnswers.length} answered` : ""}
            {status === "in_progress" && rs ? ` · ${Object.keys(rs.answers || {}).length} answered` : ""}
          </div>
        )}
        {status === "submitted" && hasQ && (
          <div style={{ fontSize: 13, fontWeight: 700, marginTop: 4, color: (rs ? rs.percentage : sub.percentage) >= 70 ? "#059669" : (rs ? rs.percentage : sub.percentage) >= 50 ? "#D97706" : "#DC2626" }}>
            Score: {rs ? rs.score : sub.score}/{rs ? rs.total_points : sub.total_points} ({rs ? rs.percentage : sub.percentage}%)
          </div>
        )}
      </div>

      {/* Right: status + button */}
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: statusBadge.color }}>
          {statusBadge.text}
        </div>
        <button
          style={{ padding: "8px 16px", borderRadius: 10, border: "none", cursor: "pointer", fontFamily: "inherit", fontSize: 13, fontWeight: 600, background: btnConfig.bg, color: btnConfig.color }}
          onClick={e => { e.stopPropagation(); openQuiz(a); }}
        >
          {btnConfig.label}
        </button>
      </div>
    </div>
  );
})}

      </div>
    </div>}
  </div>);
}
function LibraryBrowser({ onAdd, close }) {
  const [grade, setGrade] = useState("Grade 8");
  const [subject, setSubject] = useState("Math");
  const [topic, setTopic] = useState("");
  const [setFilter, setSetFilter] = useState(""); // "" = all sets
  const [setOptions, setSetOptions] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [topics, setTopics] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  // Load available topics when grade+subject changes
  useEffect(() => {
    if (!grade || !subject) return;
    (async () => {
      try {
        const rows = await db(
          "question_library", "GET",
          `grade=eq.${encodeURIComponent(grade)}&subject=eq.${encodeURIComponent(subject)}&select=topic`
        );
        const uniqueTopics = [...new Set((rows || []).map(r => r.topic))].sort();
        setTopics(uniqueTopics);
        if (uniqueTopics.length > 0) setTopic(uniqueTopics[0]);
        else setTopic("");
      } catch (e) { console.error(e); }
    })();
  }, [grade, subject]);

  // Load available set numbers when topic changes
  useEffect(() => {
    setSetFilter(""); // reset to "All Sets" whenever topic changes
    if (!grade || !subject || !topic) { setSetOptions([]); return; }
    (async () => {
      try {
        const rows = await db(
          "question_library", "GET",
          `grade=eq.${encodeURIComponent(grade)}&subject=eq.${encodeURIComponent(subject)}&topic=eq.${encodeURIComponent(topic)}&select=set_number`
        );
        const uniqueSets = [...new Set((rows || []).map(r => r.set_number))].sort((a, b) => a - b);
        setSetOptions(uniqueSets);
      } catch (e) { console.error(e); setSetOptions([]); }
    })();
  }, [grade, subject, topic]);

  const search = async () => {
    if (!grade || !subject || !topic) return;
    setLoading(true); setSelected(new Set()); setSearched(true);
    try {
      const setClause = setFilter ? `&set_number=eq.${setFilter}` : "";
      const rows = await db(
        "question_library", "GET",
        `grade=eq.${encodeURIComponent(grade)}&subject=eq.${encodeURIComponent(subject)}&topic=eq.${encodeURIComponent(topic)}${setClause}&order=set_number.asc,created_at.asc`
      );
      setQuestions(rows || []);
    } catch (e) { console.error(e); setQuestions([]); }
    finally { setLoading(false); }
  };

  // Auto-search when topic or set filter changes
  useEffect(() => { if (topic) search(); }, [topic, setFilter]);

  const toggle = (id) => setSelected(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const selectAll = () => setSelected(new Set(questions.map(q => q.id)));
  const clearAll = () => setSelected(new Set());

  const addSelected = () => {
    const toAdd = questions
      .filter(q => selected.has(q.id))
      .map(q => ({
        id: Date.now() + Math.random(), // local temp id
        type: q.question_type,
        text: q.question_text,
        options: q.options || ["", "", "", ""],
        correct: q.correct_answer,
        explanation: q.explanation || "",
        fromLibrary: true // already lives in question_library — don't re-sync on save
      }));
    onAdd(toAdd);
    close();
  };

  const typeColor = (type) => type === "true_false"
    ? { bg: "#D1FAE5", text: "#065F46" }
    : { bg: "#EDE9FE", text: "#5B21B6" };

  return (
    <div style={{ fontFamily: "'Inter','Outfit',sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <div style={{ fontFamily: "Outfit,sans-serif", fontSize: 22, fontWeight: 800, color: "#0F172A" }}>
            📚 Question Library
          </div>
          <div style={{ color: "#64748B", fontSize: 13, marginTop: 2 }}>
            Browse and add questions to your assignment
          </div>
        </div>
        <button onClick={close} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94A3B8" }}>✕</button>
      </div>

      {/* Filters */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        <div>
          <label className="lbl">Grade</label>
          <select className="sel" value={grade} onChange={e => setGrade(e.target.value)}>
            {GRADES.map(g => <option key={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl">Subject</label>
          <select className="sel" value={subject} onChange={e => setSubject(e.target.value)}>
            {SUBJECTS.map(s => <option key={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="lbl">Topic</label>
          <select className="sel" value={topic} onChange={e => setTopic(e.target.value)} disabled={topics.length === 0}>
            {topics.length === 0
              ? <option>No topics found</option>
              : topics.map(t => <option key={t}>{t}</option>)
            }
          </select>
        </div>
        <div>
          <label className="lbl">Set</label>
          <select className="sel" value={setFilter} onChange={e => setSetFilter(e.target.value)} disabled={setOptions.length === 0}>
            <option value="">All Sets</option>
            {setOptions.map(s => <option key={s} value={s}>Set {s}</option>)}
          </select>
        </div>
      </div>

      {/* Results header */}
      {searched && !loading && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 13, color: "#64748B" }}>
            {questions.length} question{questions.length !== 1 ? "s" : ""} found
            {selected.size > 0 && <span style={{ color: "#4F46E5", fontWeight: 600, marginLeft: 8 }}>· {selected.size} selected</span>}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={selectAll} style={{ fontSize: 12, color: "#4F46E5", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Select All</button>
            <button onClick={clearAll} style={{ fontSize: 12, color: "#94A3B8", background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Clear</button>
          </div>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#64748B" }}>
          <div style={{ width: 32, height: 32, border: "3px solid #E2E8F0", borderTopColor: "#4F46E5", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          Loading questions…
        </div>
      )}

      {/* No results */}
      {searched && !loading && questions.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#94A3B8" }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>📭</div>
          No questions found for this combination yet.
        </div>
      )}

      {/* Question list */}
      {!loading && questions.length > 0 && (
        <div style={{ maxHeight: 380, overflowY: "auto", border: "1.5px solid #E2E8F0", borderRadius: 12, marginBottom: 16 }}>
          {questions.map((q, i) => {
            const sel = selected.has(q.id);
            const tc = typeColor(q.question_type);
            return (
              <div
                key={q.id}
                onClick={() => toggle(q.id)}
                style={{
                  display: "flex", alignItems: "flex-start", gap: 14,
                  padding: "14px 16px",
                  borderBottom: i < questions.length - 1 ? "1px solid #F1F5F9" : "none",
                  background: sel ? "#EEF2FF" : "#fff",
                  cursor: "pointer", transition: "background 0.15s"
                }}
              >
                {/* Checkbox */}
                <div style={{
                  width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                  border: `2px solid ${sel ? "#4F46E5" : "#CBD5E1"}`,
                  background: sel ? "#4F46E5" : "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center"
                }}>
                  {sel && <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>✓</span>}
                </div>

                {/* Content */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#94A3B8" }}>Q{i + 1}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: tc.bg, color: tc.text }}>
                      {q.question_type === "true_false" ? "True / False" : "Multiple Choice"}
                    </span>
                  </div>

                  {/* Question text with math rendering */}
                  <div style={{ fontWeight: 500, color: "#0F172A", fontSize: 14, lineHeight: 1.5, marginBottom: 8 }}>
                    <MathText text={q.question_text} />
                  </div>

                  {/* Options preview */}
                  {q.question_type === "multiple_choice" && q.options && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {q.options.map((opt, oi) => {
                        const label = ["A", "B", "C", "D"][oi];
                        const isCorrect = q.correct_answer === label;
                        return (
                          <span key={oi} style={{
                            fontSize: 12, padding: "3px 10px", borderRadius: 20,
                            background: isCorrect ? "#D1FAE5" : "#F1F5F9",
                            color: isCorrect ? "#065F46" : "#475569",
                            fontWeight: isCorrect ? 700 : 400,
                            border: isCorrect ? "1.5px solid #10B981" : "1.5px solid transparent"
                          }}>
                            {opt} {isCorrect && "✓"}
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {q.question_type === "true_false" && (
                    <div style={{ display: "flex", gap: 6 }}>
                      {["true", "false"].map(v => (
                        <span key={v} style={{
                          fontSize: 12, padding: "3px 12px", borderRadius: 20, textTransform: "capitalize",
                          background: q.correct_answer === v ? "#D1FAE5" : "#F1F5F9",
                          color: q.correct_answer === v ? "#065F46" : "#475569",
                          fontWeight: q.correct_answer === v ? 700 : 400,
                          border: q.correct_answer === v ? "1.5px solid #10B981" : "1.5px solid transparent"
                        }}>
                          {v} {q.correct_answer === v && "✓"}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Explanation preview */}
                  {q.explanation && (
                    <div style={{ marginTop: 6, fontSize: 12, color: "#92400E", background: "#FEF3C7", borderRadius: 6, padding: "4px 10px", display: "inline-block" }}>
                      💡 <MathText text={q.explanation} />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Footer buttons */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 13, color: "#64748B" }}>
          {selected.size === 0
            ? "Click questions to select them"
            : `${selected.size} question${selected.size !== 1 ? "s" : ""} ready to add`}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn2" onClick={close}>Cancel</button>
          <button
            className="btn1"
            onClick={addSelected}
            disabled={selected.size === 0}
            style={{ opacity: selected.size === 0 ? 0.5 : 1 }}
          >
            Add {selected.size > 0 ? selected.size : ""} Question{selected.size !== 1 ? "s" : ""} →
          </button>
        </div>
      </div>
    </div>
  );
}

function TopicPracticeModal({ grade, subject, topic, student, onClose }) {
  const [questions, setQuestions] = useState([]);
  const [attemptNumber, setAttemptNumber] = useState(1);
  const [maxSet, setMaxSet] = useState(3);
  const [answers, setAnswers] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingQ, setSavingQ] = useState(null);
  const [video, setVideo] = useState(null);

  // Load questions on mount
  useEffect(() => {
    (async () => {
      try {
        const { questions: qs, attemptNumber: att, maxSet: ms } = await getQuestionsForStudent(
          grade, subject, topic, student.studentId
        );
        setQuestions(qs);
        setAttemptNumber(att);
        setMaxSet(ms || 3);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
    // Load the linked video for this topic, if any
    (async () => {
      try {
        const rows = await db(
          "topic_videos", "GET",
          `grade=eq.${encodeURIComponent(grade)}&subject=eq.${encodeURIComponent(subject)}&topic=eq.${encodeURIComponent(topic)}&order=display_order.asc&limit=1`
        );
        setVideo(rows?.[0] || null);
      } catch (e) { console.error("Load video error:", e); }
    })();
  }, []);

  const setLabels = ["", "Set A — Foundational", "Set B — Applied", "Set C — Challenge"];
  const setLabel = (n) => {
    if (n <= maxSet && setLabels[n]) return setLabels[n];
    if (n <= maxSet) return `Set ${n}`;
    return `Attempt ${n} — Random Mix`;
  };

  const selectAnswer = (qId, answer) => {
    if (submitted) return;
    setAnswers(p => ({ ...p, [qId]: answer }));
  };

  const submit = async () => {
    if (!confirm("Submit your answers? You cannot change them after submitting.")) return;
    setSubmitting(true);
    try {
      let score = 0;
      const graded = questions.map(q => {
        const selected = answers[q.id] || null;
        const correct = selected?.toLowerCase() === q.correct_answer?.toLowerCase();
        if (correct) score++;
        return { ...q, selected, correct };
      });
      const pct = Math.round((score / questions.length) * 100);

      // Save progress (increments attempt count for next time)
      await saveTopicProgress(
        student.studentId, grade, subject, topic,
        attemptNumber, score, pct
      );

      setResult({ score, total: questions.length, pct, graded });
      setSubmitted(true);
    } catch (e) {
      alert("Error submitting: " + e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const answered = Object.keys(answers).filter(k => answers[k]).length;

  // ── Header ──
  const header = (
    <div style={{ background: "linear-gradient(135deg,#0F172A,#1E1B4B)", padding: "14px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 10 }}>
      <div>
        <div style={{ color: "#fff", fontFamily: "Outfit,sans-serif", fontWeight: 800, fontSize: 16 }}>{topic}</div>
        <div style={{ color: "#818CF8", fontSize: 12 }}>{grade} · {subject} · {setLabel(attemptNumber)}</div>
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        {!submitted && <div style={{ color: "#94A3B8", fontSize: 13 }}>{answered}/{questions.length} answered</div>}
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", color: "#E2E8F0", border: "none", padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>← Back</button>
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ fontFamily: "'Inter',sans-serif", minHeight: "100vh", background: "#F0F2F8" }}>
      <style>{CSS}</style>
      {header}
      <Loader text="Loading questions…" />
    </div>
  );

  if (questions.length === 0) return (
    <div style={{ fontFamily: "'Inter',sans-serif", minHeight: "100vh", background: "#F0F2F8" }}>
      <style>{CSS}</style>
      {header}
      <div style={{ textAlign: "center", padding: 48, color: "#94A3B8" }}>
        <div style={{ fontSize: 36, marginBottom: 12 }}>📭</div>
        No questions found for this topic yet.
        <div style={{ marginTop: 16 }}>
          <button className="btn2" onClick={onClose}>← Back</button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ fontFamily: "'Inter',sans-serif", minHeight: "100vh", background: "#F0F2F8" }}>
      <style>{CSS}</style>
      {header}

      {/* Progress bar */}
      {!submitted && (
        <div style={{ height: 4, background: "#1E293B" }}>
          <div style={{ height: "100%", background: "#4F46E5", transition: "width 0.3s", width: `${(answered / questions.length) * 100}%` }} />
        </div>
      )}

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "28px 20px" }}>

        {/* Score banner */}
        {submitted && result && (
          <div className="fade" style={{
            background: result.pct >= 70 ? "linear-gradient(135deg,#059669,#047857)" : result.pct >= 50 ? "linear-gradient(135deg,#D97706,#B45309)" : "linear-gradient(135deg,#DC2626,#B91C1C)",
            borderRadius: 20, padding: 28, marginBottom: 28, textAlign: "center", color: "#fff"
          }}>
            <div style={{ fontSize: 44, marginBottom: 6 }}>{result.pct >= 70 ? "🏆" : result.pct >= 50 ? "👍" : "📚"}</div>
            <div style={{ fontFamily: "Outfit,sans-serif", fontSize: 44, fontWeight: 800 }}>{result.pct}%</div>
            <div style={{ fontSize: 17, marginTop: 4, opacity: 0.9 }}>{result.score} of {result.total} correct</div>
            <div style={{ fontSize: 13, marginTop: 8, opacity: 0.8 }}>
              {result.pct >= 80 ? "Excellent! Ready to move on! 🌟" :
               result.pct >= 60 ? "Good work! Try the next set to improve!" :
               "Keep practicing — you're getting there! 💪"}
            </div>
            <div style={{ marginTop: 12, fontSize: 12, background: "rgba(255,255,255,0.15)", borderRadius: 8, padding: "6px 14px", display: "inline-block" }}>
              Next attempt: {setLabel(attemptNumber + 1)}
            </div>
          </div>
        )}

        {/* Linked video */}
        {!submitted && video && getYouTubeId(video.youtube_url) && (
          <div className="fade" style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#0F172A", marginBottom: 8 }}>
              📺 {video.title || "Watch before you start"}
            </div>
            <div style={{ borderRadius: 14, overflow: "hidden", aspectRatio: "16/9" }}>
              <iframe
                width="100%" height="100%"
                src={`https://www.youtube.com/embed/${getYouTubeId(video.youtube_url)}`}
                title={video.title || "Lesson video"} frameBorder="0" allowFullScreen
              />
            </div>
          </div>
        )}

        {/* Questions */}
        {(submitted ? result.graded : questions).map((q, i) => {
          const selected = submitted ? q.selected : answers[q.id];
          const opts = q.question_type === "true_false" ? ["true", "false"] : (q.options || []);
          const optLabels = q.question_type === "multiple_choice" ? ["A", "B", "C", "D"] : null;
          const isCorrect = submitted ? q.correct : null;

          return (
            <div key={q.id || i} className={`qcard fade${selected ? " answered" : ""}`}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: submitted ? (isCorrect ? "#10B981" : selected ? "#EF4444" : "#94A3B8") : "#4F46E5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
                  {submitted ? (isCorrect ? "✓" : selected ? "✗" : i + 1) : i + 1}
                </div>
                <div style={{ fontWeight: 600, color: "#0F172A", fontSize: 15, lineHeight: 1.5, flex: 1 }}>
                  <MathText text={q.question_text} />
                </div>
                {submitted && <span style={{ fontSize: 18 }}>{isCorrect ? "✅" : selected ? "❌" : "⬜"}</span>}
              </div>

              <div style={{ paddingLeft: 38 }}>
                {opts.map((opt, oi) => {
                  const label = optLabels ? optLabels[oi] : null;
                  const val = optLabels ? label : opt;
                  const isSelected = selected === val;
                  const isCorrectOpt = q.correct_answer?.toLowerCase() === val?.toLowerCase();
                  let cls = "opt";
                  if (submitted) { if (isCorrectOpt) cls += " correct"; else if (isSelected && !isCorrectOpt) cls += " wrong"; }
                  else if (isSelected) cls += " selected";

                  return (
                    <div key={oi} className={cls} onClick={() => !submitted && selectAnswer(q.id, val)}>
                      {label && (
                        <span style={{ width: 24, height: 24, borderRadius: "50%", background: submitted ? (isCorrectOpt ? "#10B981" : isSelected ? "#EF4444" : "#E2E8F0") : (isSelected ? "#4F46E5" : "#E2E8F0"), color: submitted ? (isCorrectOpt || isSelected ? "#fff" : "#64748B") : (isSelected ? "#fff" : "#64748B"), display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>{label}</span>
                      )}
                      <span style={{ fontWeight: 500, fontSize: 14, color: "#0F172A", textTransform: "capitalize" }}>
                        <MathText text={opt} />
                      </span>
                      {submitted && isCorrectOpt && <span style={{ marginLeft: "auto", fontSize: 11, color: "#059669", fontWeight: 700 }}>✓ Correct</span>}
                    </div>
                  );
                })}

                {submitted && q.explanation && (
                  <div className="explanation-box">
                    <strong>💡 Explanation:</strong> <MathText text={q.explanation} />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Submit / Back */}
        {!submitted ? (
          <div style={{ textAlign: "center", marginTop: 24 }}>
            <button className="btn1" onClick={submit} disabled={submitting || answered === 0} style={{ padding: "14px 40px", fontSize: 16 }}>
              {submitting ? "Grading…" : `Submit (${answered}/${questions.length} answered)`}
            </button>
            {answered < questions.length && (
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 8 }}>Unanswered questions = incorrect</div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: "center", marginTop: 24, display: "flex", gap: 12, justifyContent: "center" }}>
            <button className="btn2" onClick={onClose}>← Back to Topics</button>
            <button className="btn1" onClick={() => {
              // Retry — reload with new attempt number
              setLoading(true); setSubmitted(false); setAnswers({}); setResult(null);
              getQuestionsForStudent(grade, subject, topic, student.studentId).then(({ questions: qs, attemptNumber: att, maxSet: ms }) => {
                setQuestions(qs); setAttemptNumber(att); setMaxSet(ms || 3); setLoading(false);
              });
            }}>
              Try Again →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── FIX 1 & 2: Quiz Interface (Math rendering + Explanations) ─────────────────
function QuizInterface({ assignment, student, session, onClose }) {
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [savingQ, setSavingQ] = useState(null);
  // Retake support: once a student is on a retake, questions come from the
  // shared question_library/topic system (same one TopicPracticeModal uses)
  // instead of the per-assignment "questions" table.
  const [retakeMode, setRetakeMode] = useState(false);
  const [retakeAttempt, setRetakeAttempt] = useState(1);
  const [retaking, setRetaking] = useState(false);
  const [video, setVideo] = useState(null);
  const alreadySubmitted = assignment.submission?.status === "submitted";

  const grade = student.grade;
  const subject = assignment.subject;
  const topic = assignment.topic;

  // Auto-graded = every question is multiple choice or true/false (i.e. gradable by the system)
  const isAutoGraded = questions.length > 0 && questions.every(
    q => q.question_type === "multiple_choice" || q.question_type === "true_false"
  );
  // Retake only makes sense if the assignment is linked to a topic in the question library
  const canRetake = isAutoGraded && !!topic;

  useEffect(() => {
    (async () => {
      try {
        const rs = assignment.retakeSession;
        if (rs) {
          // A retake session exists — it supersedes the original attempt entirely.
          // Resume it if unfinished, or show its result if it was submitted.
          setQuestions(rs.questions || []);
          setAnswers(rs.answers || {});
          setRetakeMode(true);
          setRetakeAttempt(rs.attempt_number);
          if (rs.status === "submitted") {
            setSubmitted(true);
            setResult({ score: rs.score, total_points: rs.total_points, percentage: rs.percentage });
          }
        } else {
          const qs = await db("questions", "GET", `assignment_id=eq.${assignment.id}&order=order_index.asc`);
          setQuestions(qs || []);
          // Restore saved answers
          const saved = assignment.savedAnswers || [];
          const ans = {};
          saved.forEach(sa => { ans[sa.question_id] = sa.selected_answer; });
          setAnswers(ans);
          // If already submitted, load result
          if (alreadySubmitted) {
            setSubmitted(true);
            setResult(assignment.submission);
          }
        }
        // Load the linked video for this topic, if any
        if (assignment.topic_video_id) {
          try {
            const vrows = await db("topic_videos", "GET", `id=eq.${assignment.topic_video_id}`);
            setVideo(vrows?.[0] || null);
          } catch (e) { console.error("Load video error:", e); }
        }
      } catch (e) { console.error("QuizInterface load error:", e); }
      finally { setLoading(false); }
    })();
  }, []);

  // FIX 1: use saveAnswer() with correct on_conflict
  const selectAnswer = async (questionId, answer) => {
    const nextAnswers = { ...answers, [questionId]: answer };
    setAnswers(nextAnswers);
    setSavingQ(questionId);
    try {
      if (retakeMode) {
        // Retake questions aren't tied to assignment_id in the "questions" table —
        // persist to retake_sessions instead so Back/resume doesn't lose progress.
        await saveRetakeSession(student.studentId, assignment.id, {
          attempt_number: retakeAttempt,
          questions, answers: nextAnswers,
          status: "in_progress"
        });
      } else {
        await saveAnswer(student.studentId, assignment.id, questionId, answer);
        await saveSubmission(student.studentId, assignment.id, {
          status: "in_progress", score: 0,
          total_points: questions.length, percentage: 0
        });
      }
    } catch (e) { console.error("Save answer error:", e); }
    finally { setSavingQ(null); }
  };

  // FIX 1: use saveAnswer() + saveSubmission() with correct on_conflict
  const submit = async () => {
    if (!confirm("Submit your answers? You cannot change them after submitting.")) return;
    setSubmitting(true);
    try {
      let score = 0;
      const total = questions.length;

      if (retakeMode) {
        // Grade locally and record progress against student_progress (topic-based),
        // rather than the per-assignment questions/submissions tables.
        questions.forEach(q => {
          const selected = answers[q.id];
          if (selected?.toLowerCase() === q.correct_answer?.toLowerCase()) score++;
        });
        const pct = total > 0 ? Math.round((score / total) * 100) : 0;
        await saveTopicProgress(student.studentId, grade, subject, topic, retakeAttempt, score, pct);
        await saveRetakeSession(student.studentId, assignment.id, {
          attempt_number: retakeAttempt,
          questions, answers,
          status: "submitted", score, total_points: total, percentage: pct
        });
        setResult({ score, total_points: total, percentage: pct });
      } else {
        // Save all answers with is_correct flag
        await Promise.all(questions.map(q => {
          const selected = answers[q.id];
          const correct = selected?.toLowerCase() === q.correct_answer?.toLowerCase();
          if (correct) score++;
          return saveAnswer(student.studentId, assignment.id, q.id, selected || null, correct);
        }));
        // Save final submission
        const pct = total > 0 ? Math.round((score / total) * 100) : 0;
        await saveSubmission(student.studentId, assignment.id, {
          status: "submitted", score, total_points: total,
          percentage: pct, submitted_at: new Date().toISOString()
        });
        setResult({ score, total_points: total, percentage: pct });
      }
      setSubmitted(true);
    } catch (e) { alert("Error submitting: " + e.message); }
    finally { setSubmitting(false); }
  };

  // Retake: pull the next set (or a shuffled mix once all sets are exhausted) for this topic
  const retake = async () => {
    setRetaking(true);
    try {
      const { questions: qs, attemptNumber: att } = await getQuestionsForStudent(grade, subject, topic, student.studentId);
      setQuestions(qs);
      setAnswers({});
      setResult(null);
      setSubmitted(false);
      setRetakeMode(true);
      setRetakeAttempt(att);
      // Persist immediately so a Back-out right after starting still resumes this exact set
      await saveRetakeSession(student.studentId, assignment.id, {
        attempt_number: att, questions: qs, answers: {}, status: "in_progress"
      });
    } catch (e) {
      alert("Couldn't load a new set: " + e.message);
    } finally {
      setRetaking(false);
    }
  };

  const answered = Object.keys(answers).filter(k => answers[k]).length;
  const header = (
    <div style={{ background: "linear-gradient(135deg,#0F172A,#1E1B4B)", padding: "16px 32px", display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 10 }}>
      <div>
        <div style={{ fontFamily: "Outfit,sans-serif", color: "#fff", fontWeight: 800, fontSize: 17 }}>{assignment.title}{retakeMode ? ` · Retake ${retakeAttempt}` : ""}</div>
        <div style={{ color: "#64748B", fontSize: 12 }}>{assignment.subject}{questions.length > 0 ? ` · ${questions.length} questions` : ""}</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {!submitted && questions.length > 0 && (
          <div style={{ color: "#94A3B8", fontSize: 13 }}>
            {answered}/{questions.length} answered {savingQ && <span style={{ color: "#818CF8" }}>· Saving…</span>}
          </div>
        )}
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.1)", color: "#E2E8F0", border: "none", padding: "7px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>← Back</button>
      </div>
    </div>
  );

  if (loading) return (
    <div style={{ fontFamily: "'Inter','Outfit',sans-serif", minHeight: "100vh", background: "#F0F2F8" }}>
      <style>{CSS}</style>{header}<Loader text="Loading assignment…" />
    </div>
  );

  // FIX 2: No questions → show assignment details instead of empty quiz
  if (questions.length === 0) {
    return (
      <div style={{ fontFamily: "'Inter','Outfit',sans-serif", minHeight: "100vh", background: "#F0F2F8" }}>
        <style>{CSS}</style>
        {header}
        <div style={{ maxWidth: 680, margin: "0 auto", padding: "32px 20px" }}>
          <div className="card fade">
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: sc(assignment.subject).bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 }}>📄</div>
              <div>
                <div style={{ fontFamily: "Outfit,sans-serif", fontSize: 20, fontWeight: 800, color: "#0F172A" }}>{assignment.title}</div>
                <div style={{ color: "#64748B", fontSize: 13, marginTop: 2 }}>{assignment.subject} · Due {assignment.due_date}</div>
              </div>
            </div>
            {assignment.description && (
              <div style={{ background: "#F8FAFF", borderRadius: 12, padding: "14px 18px", marginBottom: 16, color: "#475569", fontSize: 14, lineHeight: 1.6, border: "1.5px solid #E8EEFF" }}>
                {assignment.description}
              </div>
            )}
            {assignment.file_url ? (
  // Has real stored file — show download link
  <a
    href={assignment.file_url}
    target="_blank"
    rel="noopener noreferrer"
    download={assignment.file_name}
    style={{
      display: "flex", alignItems: "center", gap: 12,
      padding: "14px 18px", background: "#EEF2FF",
      borderRadius: 12, marginBottom: 16,
      textDecoration: "none", border: "2px solid #C7D2FE",
      transition: "all 0.18s"
    }}
    onMouseEnter={e => e.currentTarget.style.background = "#E0E7FF"}
    onMouseLeave={e => e.currentTarget.style.background = "#EEF2FF"}
  >
    <span style={{ fontSize: 26 }}>📎</span>
    <div style={{ flex: 1 }}>
      <div style={{ color: "#4F46E5", fontWeight: 700, fontSize: 14 }}>{assignment.file_name}</div>
      <div style={{ color: "#818CF8", fontSize: 12, marginTop: 2 }}>Click to open / download</div>
    </div>
    <span style={{ fontSize: 20 }}>⬇️</span>
  </a>
) : assignment.file_name ? (
  // Has filename but no URL (old assignment — file wasn't uploaded to storage)
  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: "#F1F5F9", borderRadius: 12, marginBottom: 16, border: "2px solid #E2E8F0" }}>
    <span style={{ fontSize: 22 }}>📎</span>
    <div>
      <div style={{ color: "#475569", fontWeight: 600, fontSize: 14 }}>{assignment.file_name}</div>
      <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 2 }}>File reference only — ask your teacher to re-upload</div>
    </div>
  </div>
) : null}

            {!assignment.description && !assignment.file_name && (
              <div style={{ color: "#94A3B8", textAlign: "center", padding: "20px 0" }}>No additional details for this assignment.</div>
            )}
            <div style={{ marginTop: 20, display: "flex", justifyContent: "center" }}>
              <button className="btn2" onClick={onClose}>← Back to Assignments</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Full quiz interface (assignment has questions)
  return (
    <div style={{ fontFamily: "'Inter','Outfit',sans-serif", minHeight: "100vh", background: "#F0F2F8" }}>
      <style>{CSS}</style>
      {header}
      {!submitted && (
        <div style={{ height: 4, background: "#1E293B" }}>
          <div style={{ height: "100%", background: "#4F46E5", transition: "width 0.3s", width: `${questions.length > 0 ? (answered / questions.length) * 100 : 0}%` }} />
        </div>
      )}

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px" }}>
        {/* Score banner after submission */}
        {submitted && result && (
          <div className="fade" style={{ background: result.percentage >= 70 ? "linear-gradient(135deg,#059669,#047857)" : result.percentage >= 50 ? "linear-gradient(135deg,#D97706,#B45309)" : "linear-gradient(135deg,#DC2626,#B91C1C)", borderRadius: 20, padding: 32, marginBottom: 32, textAlign: "center", color: "#fff" }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>{result.percentage >= 70 ? "🏆" : result.percentage >= 50 ? "👍" : "📚"}</div>
            <div style={{ fontFamily: "Outfit,sans-serif", fontSize: 48, fontWeight: 800 }}>{result.percentage}%</div>
            <div style={{ fontSize: 18, marginTop: 4, opacity: 0.9 }}>{result.score} out of {result.total_points} correct</div>
            <div style={{ fontSize: 14, marginTop: 8, opacity: 0.8 }}>
              {result.percentage >= 70 ? "Great job! 🌟" : result.percentage >= 50 ? "Good effort! Review the answers below." : "Keep practicing — you'll get there! 💪"}
            </div>
          </div>
        )}

        {/* Linked video — shown before attempting (and before a retake) */}
        {!submitted && video && getYouTubeId(video.youtube_url) && (
          <div className="fade" style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "#0F172A", marginBottom: 8 }}>
              📺 {video.title || "Watch before you start"}
            </div>
            <div style={{ borderRadius: 14, overflow: "hidden", aspectRatio: "16/9" }}>
              <iframe
                width="100%" height="100%"
                src={`https://www.youtube.com/embed/${getYouTubeId(video.youtube_url)}`}
                title={video.title || "Lesson video"} frameBorder="0" allowFullScreen
              />
            </div>
          </div>
        )}

        {/* Questions */}
        {questions.map((q, i) => {
          const selected = answers[q.id];
          const isCorrect = selected?.toLowerCase() === q.correct_answer?.toLowerCase();
          const opts = q.question_type === "true_false" ? ["true", "false"] : (q.options || []);
          const optLabels = q.question_type === "multiple_choice" ? ["A", "B", "C", "D"] : null;

          return (
            <div key={q.id} className={`qcard fade${selected ? " answered" : ""}`}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-start", flex: 1 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: submitted ? (isCorrect ? "#10B981" : selected ? "#EF4444" : "#94A3B8") : "#4F46E5", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{i + 1}</div>
                  <div style={{ fontWeight: 600, color: "#0F172A", fontSize: 15, lineHeight: 1.5 }}>
                    <MathText text={q.question_text} />
                  </div>
                </div>
                {submitted && selected && <span style={{ fontSize: 20 }}>{isCorrect ? "✅" : "❌"}</span>}
              </div>

              <div style={{ paddingLeft: 38 }}>
                {opts.map((opt, oi) => {
                  const label = optLabels ? optLabels[oi] : null;
                  const val = optLabels ? label : opt;
                  const isSelected = selected === val;
                  const isCorrectOpt = q.correct_answer?.toLowerCase() === val?.toLowerCase();
                  let cls = "opt";
                  if (submitted) { if (isCorrectOpt) cls += " correct"; else if (isSelected && !isCorrectOpt) cls += " wrong"; }
                  else if (isSelected) cls += " selected";

                  return (
                    <div key={oi} className={cls} onClick={() => !submitted && selectAnswer(q.id, val)}>
                      {label && (
                        <span style={{ width: 26, height: 26, borderRadius: "50%", background: submitted ? (isCorrectOpt ? "#10B981" : isSelected ? "#EF4444" : "#E2E8F0") : (isSelected ? "#4F46E5" : "#E2E8F0"), color: submitted ? (isCorrectOpt || isSelected ? "#fff" : "#64748B") : (isSelected ? "#fff" : "#64748B"), display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 11, flexShrink: 0 }}>{label}</span>
                      )}
                      <span style={{ fontWeight: 500, fontSize: 14, color: "#0F172A", textTransform: "capitalize" }}>
                        <MathText text={opt} />
                      </span>
                      {submitted && isCorrectOpt && <span style={{ marginLeft: "auto", fontSize: 12, color: "#059669", fontWeight: 600 }}>✓ Correct answer</span>}
                    </div>
                  );
                })}

                {/* Explanation after submit */}
                {submitted && q.explanation && (
                  <div className="explanation-box">
                    <strong>💡 Explanation:</strong> <MathText text={q.explanation} />
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Submit / Back buttons */}
        {!submitted && (
          <div style={{ textAlign: "center", marginTop: 24 }}>
            <button className="btn1" onClick={submit} disabled={submitting || answered === 0} style={{ padding: "14px 48px", fontSize: 16 }}>
              {submitting ? "Grading your answers…" : `Submit Assignment (${answered}/${questions.length} answered)`}
            </button>
            {answered < questions.length && (
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 8 }}>
                Unanswered questions will be marked as incorrect.
              </div>
            )}
          </div>
        )}
        {submitted && (
          <div style={{ textAlign: "center", marginTop: 24 }}>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button className="btn2" onClick={onClose} style={{ padding: "12px 32px" }}>← Back to My Assignments</button>
              {canRetake && (
                <button className="btn1" onClick={retake} disabled={retaking} style={{ padding: "12px 32px" }}>
                  {retaking ? "Loading new set…" : "Retake Assignment →"}
                </button>
              )}
            </div>
            {canRetake && (
              <div style={{ fontSize: 12, color: "#94A3B8", marginTop: 10 }}>
                This is auto-graded, so you can retake it with a new set of questions any time.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
