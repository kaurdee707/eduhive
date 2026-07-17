// EduHive — Supabase-Connected Tutoring Platform
// STEP 1: Run eduhive-schema.sql in Supabase → SQL Editor
// STEP 2: Supabase → Authentication → Settings → turn OFF "Enable email confirmations" (for easy testing)

import { useState, useRef } from "react";

// ── Supabase Config ───────────────────────────────────────────────────────────
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
  if (!res.ok) { let m; try { m = JSON.parse(text).message; } catch { m = text; } throw new Error(m || "Request failed"); }
  return text ? JSON.parse(text) : null;
}
async function sbSignUp(email, password, name) {
  const res = await fetch(`${SB_URL}/auth/v1/signup`, { method: "POST", headers: { apikey: SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password, data: { name } }) });
  return res.json();
}
async function sbSignIn(email, password) {
  const res = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, { method: "POST", headers: { apikey: SB_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  return res.json();
}
async function sbSignOut() {
  await fetch(`${SB_URL}/auth/v1/logout`, { method: "POST", headers: { apikey: SB_KEY, Authorization: `Bearer ${TOKEN}` } });
}
async function loadAll(uid) {
  const [classes, students, assignments] = await Promise.all([
    db("classes", "GET", `teacher_id=eq.${uid}&order=created_at.asc`),
    db("students", "GET", `teacher_id=eq.${uid}&order=name.asc`),
    db("assignments", "GET", `teacher_id=eq.${uid}&order=created_at.desc`)
  ]);
  const cids = classes.map(c => c.id).join(",");
  const aids = assignments.map(a => a.id).join(",");
  const [cs, as2] = await Promise.all([
    cids ? db("class_students", "GET", `class_id=in.(${cids})`) : Promise.resolve([]),
    aids ? db("assignment_students", "GET", `assignment_id=in.(${aids})`) : Promise.resolve([])
  ]);
  return {
    classes: classes.map(c => ({ ...c, subjects: c.subjects || [], students: cs.filter(x => x.class_id === c.id).map(x => x.student_id) })),
    students: students.map(s => ({ ...s, classes: cs.filter(x => x.student_id === s.id).map(x => x.class_id) })),
    assignments: assignments.map(a => ({ ...a, assignedTo: as2.filter(x => x.assignment_id === a.id).map(x => x.student_id) }))
  };
}

// ── Constants ─────────────────────────────────────────────────────────────────
const SUBJECTS = ["Math", "English", "Science", "History", "Art", "Punjabi", "Physical Ed", "Computer Science"];
const GRADES = ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6","Grade 7","Grade 8","Grade 9","Grade 10","Grade 11","Grade 12"];
const SUBJECT_COLORS = { Math:{bg:"#EDE9FE",text:"#5B21B6",dot:"#7C3AED"}, English:{bg:"#DBEAFE",text:"#1E40AF",dot:"#3B82F6"}, Science:{bg:"#D1FAE5",text:"#065F46",dot:"#10B981"}, History:{bg:"#FEF3C7",text:"#92400E",dot:"#F59E0B"}, Art:{bg:"#FCE7F3",text:"#9D174D",dot:"#EC4899"}, Punjabi:{bg:"#FFF7ED",text:"#9A3412",dot:"#EA580C"}, "Physical Ed":{bg:"#F0FDF4",text:"#14532D",dot:"#22C55E"}, "Computer Science":{bg:"#F0F9FF",text:"#0C4A6E",dot:"#0EA5E9"} };
const AVATAR_COLORS = ["#4F46E5","#059669","#D97706","#DC2626","#7C3AED","#0891B2"];
const getAC = (id) => AVATAR_COLORS[Math.abs(id?.charCodeAt(0) || 0) % AVATAR_COLORS.length];
const sc = (s) => SUBJECT_COLORS[s] || { bg:"#F1F5F9", text:"#475569", dot:"#94A3B8" };

// ── Auth Screen ───────────────────────────────────────────────────────────────
function AuthScreen({ onLogin }) {
  const [tab, setTab] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handle = async () => {
    setLoading(true); setError("");
    try {
      if (tab === "signup") {
        const res = await sbSignUp(email, pass, name);
        if (res.error) throw new Error(res.error.message);
        if (res.access_token) { TOKEN = res.access_token; onLogin(res); }
        else setError("Check your email to confirm your account, or disable email confirmations in Supabase → Auth → Settings.");
      } else {
        const res = await sbSignIn(email, pass);
        if (res.error) throw new Error(res.error.message);
        TOKEN = res.access_token;
        onLogin(res);
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:"100vh", background:"linear-gradient(135deg,#0F172A 0%,#1E1B4B 100%)", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Inter','Outfit',sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap'); *{box-sizing:border-box;margin:0;padding:0;} .inp{width:100%;padding:12px 16px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:14px;outline:none;font-family:inherit;transition:border 0.15s;} .inp:focus{border-color:#4F46E5;} .btn{width:100%;padding:13px;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;transition:all 0.18s;font-family:inherit;} .tab-btn{flex:1;padding:9px;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;font-family:inherit;transition:all 0.18s;}`}</style>
      <div style={{ background:"#fff", borderRadius:24, padding:40, width:420, maxWidth:"95vw", boxShadow:"0 24px 80px rgba(0,0,0,0.4)" }}>
        <div style={{ textAlign:"center", marginBottom:28 }}>
          <div style={{ width:56, height:56, background:"linear-gradient(135deg,#4F46E5,#7C3AED)", borderRadius:16, display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, margin:"0 auto 12px" }}>🎓</div>
          <div style={{ fontFamily:"Outfit,sans-serif", fontSize:26, fontWeight:800, color:"#0F172A", letterSpacing:"-0.03em" }}>EduHive</div>
          <div style={{ color:"#64748B", fontSize:14, marginTop:4 }}>Smart Tutoring Platform</div>
        </div>
        <div style={{ display:"flex", background:"#F1F5F9", borderRadius:10, padding:4, marginBottom:24, gap:4 }}>
          <button className="tab-btn" onClick={()=>{setTab("login");setError("");}} style={{ background:tab==="login"?"#fff":"transparent", color:tab==="login"?"#0F172A":"#64748B", boxShadow:tab==="login"?"0 1px 4px rgba(0,0,0,0.1)":"none" }}>Login</button>
          <button className="tab-btn" onClick={()=>{setTab("signup");setError("");}} style={{ background:tab==="signup"?"#fff":"transparent", color:tab==="signup"?"#0F172A":"#64748B", boxShadow:tab==="signup"?"0 1px 4px rgba(0,0,0,0.1)":"none" }}>Sign Up</button>
        </div>
        {tab==="signup" && <div style={{ marginBottom:14 }}><label style={{ fontSize:12,fontWeight:600,color:"#64748B",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:6 }}>Your Name</label><input className="inp" placeholder="e.g. Mrs. Kaur" value={name} onChange={e=>setName(e.target.value)} /></div>}
        <div style={{ marginBottom:14 }}><label style={{ fontSize:12,fontWeight:600,color:"#64748B",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:6 }}>Email</label><input className="inp" type="email" placeholder="teacher@school.com" value={email} onChange={e=>setEmail(e.target.value)} /></div>
        <div style={{ marginBottom:20 }}><label style={{ fontSize:12,fontWeight:600,color:"#64748B",textTransform:"uppercase",letterSpacing:"0.05em",display:"block",marginBottom:6 }}>Password</label><input className="inp" type="password" placeholder="••••••••" value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handle()} /></div>
        {error && <div style={{ background:"#FEE2E2", color:"#DC2626", padding:"10px 14px", borderRadius:10, fontSize:13, marginBottom:14 }}>{error}</div>}
        <button className="btn" onClick={handle} disabled={loading} style={{ background:loading?"#A5B4FC":"#4F46E5", color:"#fff" }}>{loading?"Please wait…":tab==="login"?"Login to EduHive":"Create Teacher Account"}</button>
      </div>
    </div>
  );
}

// ── Loading ───────────────────────────────────────────────────────────────────
function Loader({ text = "Loading…" }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", minHeight:"60vh", gap:16 }}>
      <div style={{ width:40, height:40, border:"3px solid #E2E8F0", borderTopColor:"#4F46E5", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
      <div style={{ color:"#64748B", fontSize:14 }}>{text}</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function TutoringApp() {
  const [user, setUser] = useState(null);
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [appLoading, setAppLoading] = useState(false);
  const [view, setView] = useState("dashboard");
  const [mode, setMode] = useState("teacher");
  const [modal, setModal] = useState(null);
  const [modalData, setModalData] = useState({});
  const [activeStudent, setActiveStudent] = useState(null);
  const [sidebar, setSidebar] = useState(true);

  const openModal = (type, data = {}) => { setModal(type); setModalData(data); };
  const closeModal = () => { setModal(null); setModalData({}); };

  const reload = async (uid = user?.id) => {
    if (!uid) return;
    setAppLoading(true);
    try {
      const data = await loadAll(uid);
      setClasses(data.classes);
      setStudents(data.students);
      setAssignments(data.assignments);
      if (!activeStudent && data.students.length) setActiveStudent(data.students[0]);
    } catch (e) { console.error(e); }
    finally { setAppLoading(false); }
  };

  const login = async (session) => {
    TOKEN = session.access_token;
    const u = { id: session.user.id, email: session.user.email, name: session.user.user_metadata?.name || session.user.email.split("@")[0] };
    setUser(u);
    await reload(u.id);
  };

  const logout = async () => {
    await sbSignOut();
    TOKEN = SB_KEY;
    setUser(null); setClasses([]); setStudents([]); setAssignments([]);
  };

  if (!user) return <AuthScreen onLogin={login} />;

  const navItems = mode === "teacher"
    ? [{ id:"dashboard",label:"Dashboard",icon:"⊞" },{ id:"classes",label:"My Classes",icon:"🏫" },{ id:"students",label:"Students",icon:"👨‍🎓" },{ id:"assignments",label:"Assignments",icon:"📋" },{ id:"subjects",label:"Subjects & Grades",icon:"📚" }]
    : [{ id:"student-home",label:"My Dashboard",icon:"⊞" },{ id:"student-classes",label:"My Classes",icon:"🏫" },{ id:"student-assignments",label:"My Work",icon:"📋" }];

  const ctx = { classes, students, assignments, openModal, reload, userId: user.id };

  return (
    <div style={{ fontFamily:"'Inter','Outfit',sans-serif", display:"flex", height:"100vh", background:"#F0F2F8", overflow:"hidden" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&family=Inter:wght@400;500;600&display=swap'); *{box-sizing:border-box;margin:0;padding:0;} ::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-thumb{background:#C7D2E8;border-radius:3px} .ni{display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:10px;cursor:pointer;transition:all 0.18s;color:#94A3B8;font-size:14px;font-weight:500} .ni:hover{background:rgba(255,255,255,0.08);color:#E2E8F0} .ni.on{background:rgba(79,70,229,0.3);color:#fff;font-weight:600} .card{background:#fff;border-radius:16px;padding:24px;box-shadow:0 1px 4px rgba(0,0,0,0.06)} .btn1{background:#4F46E5;color:#fff;border:none;padding:10px 20px;border-radius:10px;cursor:pointer;font-weight:600;font-size:14px;transition:all 0.18s;font-family:inherit} .btn1:hover{background:#4338CA;transform:translateY(-1px)} .btn1:disabled{background:#A5B4FC;cursor:wait} .btn2{background:#F1F5F9;color:#475569;border:none;padding:10px 20px;border-radius:10px;cursor:pointer;font-weight:500;font-size:14px;font-family:inherit} .btn2:hover{background:#E2E8F0} .btnd{background:#FEE2E2;color:#DC2626;border:none;padding:7px 14px;border-radius:8px;cursor:pointer;font-weight:500;font-size:13px;font-family:inherit} .inp{width:100%;padding:10px 14px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:14px;outline:none;transition:border 0.15s;font-family:inherit} .inp:focus{border-color:#4F46E5} .sel{width:100%;padding:10px 14px;border:1.5px solid #E2E8F0;border-radius:10px;font-size:14px;outline:none;background:#fff;font-family:inherit} .lbl{font-size:12px;font-weight:600;color:#64748B;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;display:block} .bdg{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:12px;font-weight:600} .ovl{position:fixed;inset:0;background:rgba(15,23,42,0.55);z-index:100;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px)} .modal{background:#fff;border-radius:20px;padding:32px;width:520px;max-width:95vw;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.25)} .cc{background:#fff;border-radius:14px;padding:20px;box-shadow:0 1px 4px rgba(0,0,0,0.06);cursor:pointer;transition:all 0.18s;border:2px solid transparent} .cc:hover{transform:translateY(-2px);box-shadow:0 6px 20px rgba(0,0,0,0.1)} .sr{display:flex;align-items:center;gap:14px;padding:14px 0;border-bottom:1px solid #F1F5F9} .sr:last-child{border-bottom:none} .av{width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff;flex-shrink:0} .ai{padding:16px;border-radius:12px;background:#F8FAFF;border:1.5px solid #E8EEFF;margin-bottom:10px;cursor:pointer;transition:all 0.15s} .ai:hover{border-color:#4F46E5;background:#EEF0FE} .chip{display:inline-flex;align-items:center;gap:4px;padding:2px 10px;border-radius:20px;font-size:12px;font-weight:500} .ckl{display:flex;align-items:center;gap:8px;padding:8px;border-radius:8px;cursor:pointer} .ckl:hover{background:#F8FAFF} .pb{background:#E2E8F0;border-radius:99px;height:6px;overflow:hidden} .pf{height:100%;border-radius:99px;transition:width 0.5s ease} .err{background:#FEE2E2;color:#DC2626;padding:10px 14px;border-radius:10px;font-size:13px;margin-bottom:12px} .tab{padding:8px 16px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:500;color:#64748B;transition:all 0.15s;border:none;background:none;font-family:inherit} .tab.on{background:#4F46E5;color:#fff} @keyframes spin{to{transform:rotate(360deg)}}`}</style>

      {/* Sidebar */}
      <div style={{ width:sidebar?240:72, background:"linear-gradient(180deg,#0F172A 0%,#1E1B4B 100%)", display:"flex", flexDirection:"column", padding:"20px 12px", transition:"width 0.25s", flexShrink:0, overflow:"hidden" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:24, padding:"0 4px" }}>
          <div style={{ width:36, height:36, background:"linear-gradient(135deg,#4F46E5,#7C3AED)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:18 }}>🎓</div>
          {sidebar && <div><div style={{ fontFamily:"Outfit,sans-serif", color:"#fff", fontWeight:800, fontSize:16 }}>EduHive</div><div style={{ color:"#475569", fontSize:10, fontWeight:500 }}>Smart Tutoring</div></div>}
        </div>
        {sidebar && <div style={{ marginBottom:16, padding:"4px" }}><div style={{ display:"flex", background:"rgba(255,255,255,0.08)", borderRadius:10, padding:4, gap:2 }}><button onClick={()=>{setMode("teacher");setView("dashboard");}} style={{ flex:1, padding:"6px 10px", borderRadius:7, border:"none", cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"inherit", background:mode==="teacher"?"#fff":"transparent", color:mode==="teacher"?"#1E1B4B":"#94A3B8", transition:"all 0.18s" }}>Teacher</button><button onClick={()=>{setMode("student");setView("student-home");}} style={{ flex:1, padding:"6px 10px", borderRadius:7, border:"none", cursor:"pointer", fontSize:12, fontWeight:600, fontFamily:"inherit", background:mode==="student"?"#fff":"transparent", color:mode==="student"?"#1E1B4B":"#94A3B8", transition:"all 0.18s" }}>Student</button></div></div>}
        <nav style={{ flex:1 }}>
          {navItems.map(n => <div key={n.id} className={`ni${view===n.id?" on":""}`} onClick={()=>setView(n.id)} title={n.label}><span style={{ fontSize:18, flexShrink:0 }}>{n.icon}</span>{sidebar&&<span>{n.label}</span>}</div>)}
        </nav>
        {sidebar && mode==="student" && students.length>0 && (
          <div style={{ marginTop:12 }}>
            <div style={{ color:"#475569", fontSize:11, fontWeight:600, marginBottom:6, padding:"0 4px" }}>VIEWING AS</div>
            <select className="sel" style={{ background:"#1E293B", color:"#E2E8F0", border:"1.5px solid #334155", fontSize:12 }} value={activeStudent?.id||""} onChange={e=>setActiveStudent(students.find(s=>s.id===e.target.value))}>
              {students.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
        {sidebar && <div style={{ marginTop:16, padding:"8px 4px", borderTop:"1px solid #1E293B" }}>
          <div style={{ color:"#475569", fontSize:12, marginBottom:4 }}>Signed in as</div>
          <div style={{ color:"#94A3B8", fontSize:11, marginBottom:10, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{user.email}</div>
          <button onClick={logout} style={{ background:"rgba(239,68,68,0.15)", color:"#FCA5A5", border:"none", padding:"7px 12px", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:600, width:"100%", fontFamily:"inherit" }}>Sign Out</button>
        </div>}
        <div style={{ marginTop:12, cursor:"pointer", display:"flex", alignItems:"center", gap:8, padding:"6px 4px" }} onClick={()=>setSidebar(!sidebar)}>
          <span style={{ color:"#475569", fontSize:16 }}>{sidebar?"◀":"▶"}</span>
          {sidebar&&<span style={{ color:"#475569", fontSize:12 }}>Collapse</span>}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflow:"auto", padding:"28px 32px" }}>
        {appLoading ? <Loader text="Loading your data…" /> : <>
          {view==="dashboard" && <TeacherDashboard {...ctx} setView={setView} user={user} />}
          {view==="classes" && <ClassesView {...ctx} />}
          {view==="students" && <StudentsView {...ctx} />}
          {view==="assignments" && <AssignmentsView {...ctx} />}
          {view==="subjects" && <SubjectsView {...ctx} />}
          {view==="student-home" && <StudentDashboard student={activeStudent} classes={classes} assignments={assignments} />}
          {view==="student-classes" && <StudentClasses student={activeStudent} classes={classes} assignments={assignments} />}
          {view==="student-assignments" && <StudentAssignments student={activeStudent} assignments={assignments} classes={classes} />}
        </>}
      </div>

      {/* Modals */}
      {modal && <div className="ovl" onClick={closeModal}><div className="modal" onClick={e=>e.stopPropagation()}>
        {modal==="addClass" && <AddClassModal {...ctx} close={closeModal} />}
        {modal==="addStudent" && <AddStudentModal {...ctx} close={closeModal} />}
        {modal==="addAssignment" && <AddAssignmentModal {...ctx} data={modalData} close={closeModal} />}
        {modal==="viewAssignment" && <ViewAssignmentModal assignment={modalData.assignment} students={students} classes={classes} close={closeModal} />}
        {modal==="viewClass" && <ViewClassModal cls={modalData.cls} students={students} assignments={assignments} close={closeModal} />}
        {modal==="assignStudents" && <AssignStudentsModal cls={modalData.cls} {...ctx} close={closeModal} />}
      </div></div>}
    </div>
  );
}

// ── Teacher Dashboard ─────────────────────────────────────────────────────────
function TeacherDashboard({ classes, students, assignments, openModal, setView, user }) {
  const active = assignments.filter(a => a.status === "active");
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:28 }}>
        <div><div style={{ fontFamily:"Outfit,sans-serif", fontSize:28, fontWeight:800, color:"#0F172A", letterSpacing:"-0.03em" }}>Good morning, {user.name} 👋</div><div style={{ color:"#64748B", fontSize:15, marginTop:4 }}>Here's what's happening in your classes today.</div></div>
        <button className="btn1" onClick={()=>openModal("addAssignment")}>+ New Assignment</button>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:28 }}>
        {[{label:"Total Classes",value:classes.length,icon:"🏫",color:"#4F46E5",bg:"#EDE9FE"},{label:"Students",value:students.length,icon:"👨‍🎓",color:"#059669",bg:"#D1FAE5"},{label:"Active Assignments",value:active.length,icon:"📋",color:"#D97706",bg:"#FEF3C7"},{label:"Subjects Taught",value:[...new Set(classes.flatMap(c=>c.subjects))].length,icon:"📚",color:"#7C3AED",bg:"#EDE9FE"}].map(s=>(
          <div key={s.label} style={{ background:"#fff", borderRadius:14, padding:20, boxShadow:"0 1px 4px rgba(0,0,0,0.06)", borderLeft:`4px solid ${s.color}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
              <div><div style={{ fontSize:13, color:"#64748B", fontWeight:500 }}>{s.label}</div><div style={{ fontFamily:"Outfit,sans-serif", fontSize:32, fontWeight:800, color:"#0F172A", lineHeight:1.1, marginTop:4 }}>{s.value}</div></div>
              <div style={{ width:44, height:44, background:s.bg, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>{s.icon}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:20 }}>
        <div className="card">
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
            <div style={{ fontFamily:"Outfit,sans-serif", fontSize:17, fontWeight:700, color:"#0F172A" }}>Your Classes</div>
            <button className="btn2" style={{ fontSize:13, padding:"6px 14px" }} onClick={()=>setView("classes")}>View all</button>
          </div>
          {classes.length===0 && <div style={{ textAlign:"center", color:"#94A3B8", padding:"20px 0" }}>No classes yet.</div>}
          {classes.map(cls=>(
            <div key={cls.id} style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 0", borderBottom:"1px solid #F1F5F9" }}>
              <div style={{ width:42, height:42, borderRadius:12, background:cls.color, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontFamily:"Outfit,sans-serif", fontWeight:800, fontSize:16, flexShrink:0 }}>{cls.name[0]}</div>
              <div style={{ flex:1 }}><div style={{ fontWeight:600, color:"#0F172A", fontSize:14 }}>{cls.name}</div><div style={{ color:"#64748B", fontSize:12 }}>{cls.grade} · {cls.students.length} students</div></div>
              <div style={{ display:"flex", gap:4, flexWrap:"wrap", justifyContent:"flex-end" }}>
                {cls.subjects.slice(0,2).map(s=><span key={s} className="chip" style={{ background:sc(s).bg, color:sc(s).text }}>{s}</span>)}
                {cls.subjects.length>2 && <span className="chip" style={{ background:"#F1F5F9", color:"#64748B" }}>+{cls.subjects.length-2}</span>}
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <div style={{ fontFamily:"Outfit,sans-serif", fontSize:17, fontWeight:700, color:"#0F172A", marginBottom:18 }}>Active Assignments</div>
          {active.length===0 && <div style={{ textAlign:"center", color:"#94A3B8", padding:"20px 0" }}>No active assignments.</div>}
          {active.map(a=>{
            const cls=classes.find(c=>c.id===a.class_id); const d=Math.ceil((new Date(a.due_date)-new Date())/86400000);
            return <div key={a.id} className="ai"><div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}><div style={{ flex:1 }}><div style={{ fontWeight:600, color:"#0F172A", fontSize:14 }}>{a.title}</div><div style={{ color:"#64748B", fontSize:12, marginTop:2 }}>{cls?.name}</div></div><span className="bdg" style={{ background:sc(a.subject).bg, color:sc(a.subject).text, fontSize:11 }}>{a.subject}</span></div><div style={{ marginTop:10, display:"flex", alignItems:"center", gap:8 }}><div className="pb" style={{ flex:1 }}><div className="pf" style={{ width:`${Math.min(100,Math.max(0,(1-d/7)*100))}%`, background:d<=2?"#EF4444":"#4F46E5" }} /></div><span style={{ fontSize:11, color:d<=2?"#DC2626":"#64748B", fontWeight:600, flexShrink:0 }}>{d<=0?"Past due":`${d}d left`}</span></div></div>;
          })}
        </div>
      </div>
    </div>
  );
}

// ── Classes View ──────────────────────────────────────────────────────────────
function ClassesView({ classes, students, assignments, openModal, reload, userId }) {
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:28 }}>
        <div><div style={{ fontFamily:"Outfit,sans-serif", fontSize:26, fontWeight:800, color:"#0F172A" }}>My Classes</div><div style={{ color:"#64748B", fontSize:14, marginTop:3 }}>Manage your classrooms</div></div>
        <button className="btn1" onClick={()=>openModal("addClass")}>+ Create Class</button>
      </div>
      {classes.length===0 && <div className="card" style={{ textAlign:"center", padding:48 }}><div style={{ fontSize:48 }}>🏫</div><div style={{ fontFamily:"Outfit,sans-serif", fontSize:20, fontWeight:700, color:"#0F172A", marginTop:12 }}>No classes yet</div><button className="btn1" style={{ marginTop:20 }} onClick={()=>openModal("addClass")}>Create your first class</button></div>}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:18 }}>
        {classes.map(cls=>{
          const cs=students.filter(s=>cls.students.includes(s.id)); const ca=assignments.filter(a=>a.class_id===cls.id);
          return (
            <div key={cls.id} className="cc" style={{ borderTop:`4px solid ${cls.color}` }} onClick={()=>openModal("viewClass",{cls})}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
                <div style={{ width:48, height:48, borderRadius:14, background:cls.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, color:"#fff", fontFamily:"Outfit,sans-serif", fontWeight:800 }}>{cls.name[0]}</div>
                <span style={{ background:"#F1F5F9", color:"#475569", padding:"3px 10px", borderRadius:20, fontSize:12, fontWeight:600 }}>{cls.grade}</span>
              </div>
              <div style={{ marginTop:14 }}><div style={{ fontFamily:"Outfit,sans-serif", fontSize:18, fontWeight:700, color:"#0F172A" }}>{cls.name}</div><div style={{ color:"#64748B", fontSize:13, marginTop:4 }}>{cs.length} students · {ca.length} assignments</div></div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:5, marginTop:14 }}>{cls.subjects.map(s=><span key={s} className="chip" style={{ background:sc(s).bg, color:sc(s).text }}>{s}</span>)}</div>
              <div style={{ display:"flex", marginTop:14 }}>{cs.slice(0,5).map((st,i)=><div key={st.id} style={{ width:30, height:30, borderRadius:"50%", background:getAC(st.id), border:"2px solid #fff", marginLeft:i===0?0:-8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:"#fff", zIndex:i }}>{st.avatar||st.name[0]}</div>)}{cs.length>5&&<div style={{ width:30, height:30, borderRadius:"50%", background:"#E2E8F0", border:"2px solid #fff", marginLeft:-8, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:600, color:"#64748B" }}>+{cs.length-5}</div>}</div>
              <div style={{ marginTop:14, display:"flex", gap:8 }}>
                <button className="btn2" style={{ flex:1, fontSize:12, padding:"7px 0" }} onClick={e=>{e.stopPropagation();openModal("assignStudents",{cls});}}>Students</button>
                <button className="btn1" style={{ flex:1, fontSize:12, padding:"7px 0" }} onClick={e=>{e.stopPropagation();openModal("addAssignment",{classId:cls.id});}}>+ Assignment</button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Students View ─────────────────────────────────────────────────────────────
function StudentsView({ students, classes, openModal, reload, userId }) {
  const [search, setSearch] = useState("");
  const [fg, setFg] = useState("All");
  const filtered = students.filter(s => s.name.toLowerCase().includes(search.toLowerCase()) && (fg==="All"||s.grade===fg));
  const removeStudent = async (id) => {
    if (!confirm("Remove this student?")) return;
    await db("students","DELETE",`id=eq.${id}`);
    reload();
  };
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
        <div><div style={{ fontFamily:"Outfit,sans-serif", fontSize:26, fontWeight:800, color:"#0F172A" }}>Students</div><div style={{ color:"#64748B", fontSize:14, marginTop:3 }}>{students.length} enrolled</div></div>
        <button className="btn1" onClick={()=>openModal("addStudent")}>+ Add Student</button>
      </div>
      <div style={{ display:"flex", gap:12, marginBottom:20 }}>
        <input className="inp" style={{ maxWidth:280 }} placeholder="🔍  Search students…" value={search} onChange={e=>setSearch(e.target.value)} />
        <select className="sel" style={{ width:160 }} value={fg} onChange={e=>setFg(e.target.value)}><option value="All">All Grades</option>{GRADES.map(g=><option key={g}>{g}</option>)}</select>
      </div>
      <div className="card">
        <div style={{ display:"grid", gridTemplateColumns:"1fr 140px 90px 180px 90px", gap:12, padding:"0 0 10px", borderBottom:"2px solid #F1F5F9", marginBottom:4 }}>
          {["Student","Grade","Classes","Email",""].map(h=><div key={h} style={{ fontSize:11, fontWeight:700, color:"#94A3B8", textTransform:"uppercase", letterSpacing:"0.05em" }}>{h}</div>)}
        </div>
        {filtered.length===0 && <div style={{ textAlign:"center", color:"#94A3B8", padding:"28px 0" }}>No students found.</div>}
        {filtered.map(s=>{
          const sc2=classes.filter(c=>s.classes.includes(c.id));
          return (
            <div key={s.id} style={{ display:"grid", gridTemplateColumns:"1fr 140px 90px 180px 90px", gap:12, alignItems:"center" }} className="sr">
              <div style={{ display:"flex", alignItems:"center", gap:12 }}><div className="av" style={{ background:getAC(s.id) }}>{s.avatar||s.name[0]}</div><div style={{ fontWeight:600, color:"#0F172A", fontSize:14 }}>{s.name}</div></div>
              <span style={{ background:"#F1F5F9", color:"#475569", padding:"2px 10px", borderRadius:20, fontSize:12, fontWeight:600 }}>{s.grade}</span>
              <div style={{ fontSize:13, color:"#64748B" }}>{sc2.length} class{sc2.length!==1?"es":""}</div>
              <div style={{ fontSize:12, color:"#64748B", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{s.email}</div>
              <button className="btnd" onClick={()=>removeStudent(s.id)}>Remove</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Assignments View ──────────────────────────────────────────────────────────
function AssignmentsView({ assignments, classes, students, openModal, reload }) {
  const [tab, setTab] = useState("active");
  const filtered = assignments.filter(a=>a.status===tab);
  const remove = async (id) => { if(!confirm("Delete assignment?"))return; await db("assignments","DELETE",`id=eq.${id}`); reload(); };
  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24 }}>
        <div><div style={{ fontFamily:"Outfit,sans-serif", fontSize:26, fontWeight:800, color:"#0F172A" }}>Assignments</div><div style={{ color:"#64748B", fontSize:14, marginTop:3 }}>Create and manage assignments</div></div>
        <button className="btn1" onClick={()=>openModal("addAssignment")}>+ New Assignment</button>
      </div>
      <div style={{ display:"flex", gap:6, marginBottom:20, background:"#fff", padding:6, borderRadius:12, boxShadow:"0 1px 4px rgba(0,0,0,0.06)", width:"fit-content" }}>
        <button className={`tab${tab==="active"?" on":""}`} onClick={()=>setTab("active")}>Active ({assignments.filter(a=>a.status==="active").length})</button>
        <button className={`tab${tab==="past"?" on":""}`} onClick={()=>setTab("past")}>Past ({assignments.filter(a=>a.status==="past").length})</button>
      </div>
      {filtered.length===0 && <div className="card" style={{ textAlign:"center", padding:40 }}><div style={{ fontSize:40 }}>📋</div><div style={{ color:"#94A3B8", marginTop:12 }}>No {tab} assignments</div></div>}
      {filtered.map(a=>{
        const cls=classes.find(c=>c.id===a.class_id); const d=Math.ceil((new Date(a.due_date)-new Date())/86400000);
        return (
          <div key={a.id} className="card" style={{ display:"flex", alignItems:"center", gap:18, cursor:"pointer", padding:"18px 24px", marginBottom:12 }} onClick={()=>openModal("viewAssignment",{assignment:a})}>
            <div style={{ width:44, height:44, borderRadius:12, background:sc(a.subject).bg, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>{a.file_name?"📄":"✏️"}</div>
            <div style={{ flex:1 }}><div style={{ fontWeight:600, color:"#0F172A", fontSize:15 }}>{a.title}</div><div style={{ color:"#64748B", fontSize:13, marginTop:3 }}>{cls?.name} · {a.assignedTo.length} students</div>{a.description&&<div style={{ color:"#94A3B8", fontSize:12, marginTop:4 }}>{a.description.substring(0,70)}…</div>}</div>
            <div style={{ textAlign:"right", flexShrink:0 }}><span className="bdg" style={{ background:sc(a.subject).bg, color:sc(a.subject).text }}>{a.subject}</span><div style={{ fontSize:12, marginTop:8, color:d<=2&&tab==="active"?"#DC2626":"#64748B", fontWeight:d<=2?600:400 }}>{tab==="past"?`Due ${a.due_date}`:d<=0?"Past due":`Due in ${d}d`}</div></div>
            <button className="btnd" onClick={e=>{e.stopPropagation();remove(a.id);}}>Delete</button>
          </div>
        );
      })}
    </div>
  );
}

// ── Subjects View ─────────────────────────────────────────────────────────────
function SubjectsView({ classes }) {
  return (
    <div>
      <div style={{ marginBottom:28 }}><div style={{ fontFamily:"Outfit,sans-serif", fontSize:26, fontWeight:800, color:"#0F172A" }}>Subjects & Grades</div><div style={{ color:"#64748B", fontSize:14, marginTop:3 }}>Overview of subjects across all classes</div></div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        <div className="card">
          <div style={{ fontFamily:"Outfit,sans-serif", fontSize:16, fontWeight:700, color:"#0F172A", marginBottom:16 }}>Subjects Being Taught</div>
          {SUBJECTS.map(sub=>{const cnt=classes.filter(c=>c.subjects.includes(sub)).length; const c2=sc(sub); return(
            <div key={sub} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:"1px solid #F8FAFF" }}>
              <div style={{ width:10, height:10, borderRadius:"50%", background:c2.dot, flexShrink:0 }} />
              <div style={{ flex:1, fontWeight:500, color:"#0F172A", fontSize:14 }}>{sub}</div>
              {cnt>0?<span className="bdg" style={{ background:c2.bg, color:c2.text }}>{cnt} class{cnt!==1?"es":""}</span>:<span style={{ color:"#CBD5E1", fontSize:12 }}>Not assigned</span>}
            </div>
          );})}
        </div>
        <div className="card">
          <div style={{ fontFamily:"Outfit,sans-serif", fontSize:16, fontWeight:700, color:"#0F172A", marginBottom:16 }}>Classes by Grade</div>
          {classes.length===0&&<div style={{ color:"#94A3B8", textAlign:"center", padding:20 }}>No classes yet.</div>}
          {GRADES.map(grade=>{const gc=classes.filter(c=>c.grade===grade); if(!gc.length)return null; return(
            <div key={grade} style={{ marginBottom:16 }}>
              <div style={{ fontSize:12, fontWeight:700, color:"#94A3B8", textTransform:"uppercase", marginBottom:8 }}>{grade}</div>
              {gc.map(cls=><div key={cls.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", background:"#F8FAFF", borderRadius:10, marginBottom:6 }}>
                <div style={{ width:10, height:10, borderRadius:3, background:cls.color, flexShrink:0 }} />
                <span style={{ fontWeight:500, fontSize:14, color:"#0F172A", flex:1 }}>{cls.name}</span>
                <div style={{ display:"flex", gap:4 }}>{cls.subjects.slice(0,2).map(s=><span key={s} className="chip" style={{ background:sc(s).bg, color:sc(s).text, fontSize:11 }}>{s}</span>)}</div>
              </div>)}
            </div>
          );})}
        </div>
      </div>
    </div>
  );
}

// ── Student Views ─────────────────────────────────────────────────────────────
function StudentDashboard({ student, classes, assignments }) {
  if (!student) return <div className="card" style={{ textAlign:"center", padding:40 }}><div style={{ color:"#94A3B8" }}>No students added yet.</div></div>;
  const mc=classes.filter(c=>student.classes.includes(c.id)); const ma=assignments.filter(a=>a.assignedTo.includes(student.id)&&a.status==="active");
  return (
    <div>
      <div style={{ marginBottom:28 }}><div style={{ fontFamily:"Outfit,sans-serif", fontSize:26, fontWeight:800, color:"#0F172A" }}>Welcome, {student.name.split(" ")[0]}! 👋</div><div style={{ color:"#64748B", fontSize:14, marginTop:3 }}>{student.grade} · {mc.length} classes enrolled</div></div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:24 }}>
        {[{label:"My Classes",value:mc.length,icon:"🏫",color:"#4F46E5",bg:"#EDE9FE"},{label:"Pending Work",value:ma.length,icon:"📋",color:"#D97706",bg:"#FEF3C7"},{label:"Subjects",value:[...new Set(mc.flatMap(c=>c.subjects))].length,icon:"📚",color:"#059669",bg:"#D1FAE5"}].map(s=>(
          <div key={s.label} style={{ background:"#fff", borderRadius:14, padding:20, boxShadow:"0 1px 4px rgba(0,0,0,0.06)", borderLeft:`4px solid ${s.color}` }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}><div><div style={{ fontSize:13, color:"#64748B" }}>{s.label}</div><div style={{ fontFamily:"Outfit,sans-serif", fontSize:30, fontWeight:800, color:"#0F172A", marginTop:2 }}>{s.value}</div></div><div style={{ width:44, height:44, background:s.bg, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>{s.icon}</div></div>
          </div>
        ))}
      </div>
      <div className="card"><div style={{ fontFamily:"Outfit,sans-serif", fontSize:16, fontWeight:700, color:"#0F172A", marginBottom:16 }}>Upcoming Assignments</div>
        {ma.length===0&&<div style={{ color:"#94A3B8", textAlign:"center", padding:20 }}>🎉 No pending assignments!</div>}
        {ma.map(a=>{const cls=classes.find(c=>c.id===a.class_id); const d=Math.ceil((new Date(a.due_date)-new Date())/86400000); return(
          <div key={a.id} className="ai"><div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}><div><div style={{ fontWeight:600, color:"#0F172A", fontSize:14 }}>{a.title}</div><div style={{ color:"#64748B", fontSize:12, marginTop:2 }}>{cls?.name}</div></div><div style={{ textAlign:"right" }}><span className="bdg" style={{ background:sc(a.subject).bg, color:sc(a.subject).text }}>{a.subject}</span><div style={{ fontSize:11, color:d<=2?"#DC2626":"#64748B", marginTop:4, fontWeight:600 }}>{d<=0?"Past due!":`${d} day${d!==1?"s":""} left`}</div></div></div></div>
        );})}
      </div>
    </div>
  );
}
function StudentClasses({ student, classes, assignments }) {
  if(!student) return null;
  const mc=classes.filter(c=>student.classes.includes(c.id));
  return(<div><div style={{ fontFamily:"Outfit,sans-serif", fontSize:26, fontWeight:800, color:"#0F172A", marginBottom:24 }}>My Classes</div><div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:16 }}>{mc.map(cls=>{const ca=assignments.filter(a=>a.class_id===cls.id&&a.assignedTo.includes(student.id)&&a.status==="active"); return(<div key={cls.id} className="cc" style={{ borderTop:`4px solid ${cls.color}` }}><div style={{ width:44, height:44, borderRadius:12, background:cls.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, color:"#fff", fontFamily:"Outfit", fontWeight:800 }}>{cls.name[0]}</div><div style={{ marginTop:12 }}><div style={{ fontFamily:"Outfit,sans-serif", fontSize:17, fontWeight:700, color:"#0F172A" }}>{cls.name}</div><div style={{ color:"#64748B", fontSize:13, marginTop:2 }}>{cls.grade}</div></div><div style={{ display:"flex", flexWrap:"wrap", gap:4, marginTop:12 }}>{cls.subjects.map(s=><span key={s} className="chip" style={{ background:sc(s).bg, color:sc(s).text }}>{s}</span>)}</div><div style={{ marginTop:12, padding:"10px", background:"#F8FAFF", borderRadius:10 }}><div style={{ fontSize:12, color:"#64748B" }}><strong style={{ color:"#F59E0B" }}>{ca.length}</strong> pending</div></div></div>);})}</div></div>);
}
function StudentAssignments({ student, assignments, classes }) {
  if(!student) return null;
  const [tab, setTab] = useState("active");
  const ma=assignments.filter(a=>a.assignedTo.includes(student.id)); const f=ma.filter(a=>a.status===tab);
  return(<div><div style={{ fontFamily:"Outfit,sans-serif", fontSize:26, fontWeight:800, color:"#0F172A", marginBottom:20 }}>My Work</div><div style={{ display:"flex", gap:6, marginBottom:20, background:"#fff", padding:6, borderRadius:12, boxShadow:"0 1px 4px rgba(0,0,0,0.06)", width:"fit-content" }}><button className={`tab${tab==="active"?" on":""}`} onClick={()=>setTab("active")}>Pending ({ma.filter(a=>a.status==="active").length})</button><button className={`tab${tab==="past"?" on":""}`} onClick={()=>setTab("past")}>Past ({ma.filter(a=>a.status==="past").length})</button></div>{f.length===0&&<div className="card" style={{ textAlign:"center", padding:40 }}><div style={{ color:"#94A3B8" }}>{tab==="active"?"🎉 No pending assignments!":"No completed assignments."}</div></div>}{f.map(a=>{const cls=classes.find(c=>c.id===a.class_id); const d=Math.ceil((new Date(a.due_date)-new Date())/86400000); return(<div key={a.id} className="card" style={{ marginBottom:12 }}><div style={{ display:"flex", justifyContent:"space-between" }}><div><div style={{ fontWeight:600, color:"#0F172A", fontSize:15 }}>{a.title}</div><div style={{ color:"#64748B", fontSize:12, marginTop:2 }}>{cls?.name}</div></div><span className="bdg" style={{ background:sc(a.subject).bg, color:sc(a.subject).text }}>{a.subject}</span></div>{a.description&&<div style={{ color:"#64748B", fontSize:13, marginTop:8 }}>{a.description}</div>}<div style={{ marginTop:12, display:"flex", alignItems:"center", gap:10 }}>{a.file_name&&<span style={{ fontSize:12, color:"#4F46E5", background:"#EEF2FF", padding:"4px 10px", borderRadius:8, fontWeight:500 }}>📎 {a.file_name}</span>}<span style={{ fontSize:12, color:d<=2&&tab==="active"?"#DC2626":"#64748B", fontWeight:600 }}>{tab==="past"?`Due ${a.due_date}`:d<=0?"Past due!":`Due in ${d}d`}</span>{tab==="active"&&<button className="btn1" style={{ marginLeft:"auto", fontSize:12, padding:"6px 14px" }}>Submit Work</button>}</div></div>);})}</div>);
}

// ── Modals ────────────────────────────────────────────────────────────────────
function AddClassModal({ reload, userId, close }) {
  const [name, setName] = useState(""); const [grade, setGrade] = useState(GRADES[4]); const [subs, setSubs] = useState([]); const [color, setColor] = useState("#4F46E5"); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");
  const colors=["#4F46E5","#059669","#D97706","#DC2626","#7C3AED","#0891B2","#DB2777"];
  const toggle=s=>setSubs(p=>p.includes(s)?p.filter(x=>x!==s):[...p,s]);
  const save=async()=>{ if(!name.trim())return; setLoading(true); setErr(""); try{ await db("classes","POST","",{teacher_id:userId,name:name.trim(),grade,color,subjects:subs}); await reload(); close(); }catch(e){setErr(e.message);}finally{setLoading(false);} };
  return(<div><div style={{ fontFamily:"Outfit,sans-serif", fontSize:22, fontWeight:800, color:"#0F172A", marginBottom:24 }}>Create New Class</div>{err&&<div className="err">{err}</div>}<div style={{ marginBottom:16 }}><label className="lbl">Class Name</label><input className="inp" placeholder="e.g. Morning Stars" value={name} onChange={e=>setName(e.target.value)} /></div><div style={{ marginBottom:16 }}><label className="lbl">Grade Level</label><select className="sel" value={grade} onChange={e=>setGrade(e.target.value)}>{GRADES.map(g=><option key={g}>{g}</option>)}</select></div><div style={{ marginBottom:20 }}><label className="lbl">Subjects</label><div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>{SUBJECTS.map(s=>{const c2=sc(s); const chk=subs.includes(s); return(<label key={s} className="ckl" style={{ background:chk?c2.bg:"#F8FAFF" }}><input type="checkbox" checked={chk} onChange={()=>toggle(s)} style={{ accentColor:"#4F46E5" }} /><span style={{ fontSize:13, fontWeight:500, color:chk?c2.text:"#475569" }}>{s}</span></label>);})}</div></div><div style={{ marginBottom:24 }}><label className="lbl">Class Color</label><div style={{ display:"flex", gap:10 }}>{colors.map(c2=><div key={c2} onClick={()=>setColor(c2)} style={{ width:32, height:32, borderRadius:"50%", background:c2, cursor:"pointer", border:color===c2?"3px solid #0F172A":"3px solid transparent", transition:"border 0.15s" }} />)}</div></div><div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}><button className="btn2" onClick={close}>Cancel</button><button className="btn1" onClick={save} disabled={loading}>{loading?"Saving…":"Create Class"}</button></div></div>);
}

function AddStudentModal({ reload, userId, close }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [grade, setGrade] = useState(GRADES[4]); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");
  const save=async()=>{ if(!name.trim()||!email.trim())return; setLoading(true); setErr(""); try{ const initials=name.split(" ").map(w=>w[0]).join("").toUpperCase().substring(0,2); await db("students","POST","",{teacher_id:userId,name:name.trim(),email:email.trim(),grade,avatar:initials}); await reload(); close(); }catch(e){setErr(e.message);}finally{setLoading(false);} };
  return(<div><div style={{ fontFamily:"Outfit,sans-serif", fontSize:22, fontWeight:800, color:"#0F172A", marginBottom:24 }}>Add New Student</div>{err&&<div className="err">{err}</div>}<div style={{ marginBottom:16 }}><label className="lbl">Full Name</label><input className="inp" placeholder="e.g. Arjun Singh" value={name} onChange={e=>setName(e.target.value)} /></div><div style={{ marginBottom:16 }}><label className="lbl">Email</label><input className="inp" type="email" placeholder="student@school.com" value={email} onChange={e=>setEmail(e.target.value)} /></div><div style={{ marginBottom:24 }}><label className="lbl">Grade</label><select className="sel" value={grade} onChange={e=>setGrade(e.target.value)}>{GRADES.map(g=><option key={g}>{g}</option>)}</select></div><div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}><button className="btn2" onClick={close}>Cancel</button><button className="btn1" onClick={save} disabled={loading}>{loading?"Saving…":"Add Student"}</button></div></div>);
}

function AddAssignmentModal({ classes, students, reload, userId, data, close }) {
  const [title, setTitle] = useState(""); const [subject, setSubject] = useState(SUBJECTS[0]); const [classId, setClassId] = useState(data.classId||classes[0]?.id||""); const [dueDate, setDueDate] = useState(""); const [desc, setDesc] = useState(""); const [fileName, setFileName] = useState(null); const [assignedTo, setAssignedTo] = useState([]); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");
  const fileRef=useRef();
  const selClass=classes.find(c=>c.id===classId);
  const classStudents=students.filter(s=>selClass?.students.includes(s.id));
  const toggle=id=>setAssignedTo(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const save=async()=>{ if(!title.trim()||!classId)return; setLoading(true); setErr(""); try{
    const [newA]=await db("assignments","POST","",{teacher_id:userId,class_id:classId,subject,title:title.trim(),description:desc,due_date:dueDate||null,file_name:fileName,status:"active"});
    const targets=assignedTo.length?assignedTo:classStudents.map(s=>s.id);
    if(targets.length) await Promise.all(targets.map(sid=>db("assignment_students","POST","",{assignment_id:newA.id,student_id:sid})));
    await reload(); close();
  }catch(e){setErr(e.message);}finally{setLoading(false);} };
  return(<div><div style={{ fontFamily:"Outfit,sans-serif", fontSize:22, fontWeight:800, color:"#0F172A", marginBottom:24 }}>New Assignment</div>{err&&<div className="err">{err}</div>}<div style={{ marginBottom:16 }}><label className="lbl">Title</label><input className="inp" placeholder="e.g. Fractions Practice Set" value={title} onChange={e=>setTitle(e.target.value)} /></div><div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:16 }}><div><label className="lbl">Class</label><select className="sel" value={classId} onChange={e=>{setClassId(e.target.value);setAssignedTo([]);}}>{classes.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div><div><label className="lbl">Subject</label><select className="sel" value={subject} onChange={e=>setSubject(e.target.value)}>{(selClass?.subjects.length?selClass.subjects:SUBJECTS).map(s=><option key={s}>{s}</option>)}</select></div></div><div style={{ marginBottom:16 }}><label className="lbl">Due Date</label><input className="inp" type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} /></div><div style={{ marginBottom:16 }}><label className="lbl">Instructions</label><textarea className="inp" rows={3} placeholder="Describe the assignment…" value={desc} onChange={e=>setDesc(e.target.value)} style={{ resize:"vertical" }} /></div><div style={{ marginBottom:16 }}><label className="lbl">Attach File (optional)</label><div onClick={()=>fileRef.current.click()} style={{ border:"2px dashed #C7D2FE", borderRadius:12, padding:24, textAlign:"center", cursor:"pointer", background:"#F5F3FF" }}>{fileName?<div><div style={{ fontSize:22 }}>📄</div><div style={{ fontWeight:600, color:"#4F46E5", marginTop:4 }}>{fileName}</div></div>:<div><div style={{ fontSize:28 }}>📁</div><div style={{ fontWeight:600, color:"#4F46E5", marginTop:8 }}>Click to attach file</div><div style={{ color:"#94A3B8", fontSize:12, marginTop:4 }}>PDF, DOCX, any format</div></div>}</div><input ref={fileRef} type="file" style={{ display:"none" }} onChange={e=>setFileName(e.target.files[0]?.name||null)} /></div>
  {classStudents.length>0&&<div style={{ marginBottom:20 }}><div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}><label className="lbl" style={{ margin:0 }}>Assign To</label><button style={{ fontSize:12, color:"#4F46E5", background:"none", border:"none", cursor:"pointer", fontWeight:600 }} onClick={()=>setAssignedTo(classStudents.map(s=>s.id))}>Select All</button></div><div style={{ maxHeight:150, overflowY:"auto", background:"#F8FAFF", borderRadius:10, padding:8 }}>{classStudents.map(s=><label key={s.id} className="ckl"><input type="checkbox" checked={assignedTo.includes(s.id)} onChange={()=>toggle(s.id)} style={{ accentColor:"#4F46E5" }} /><div className="av" style={{ background:getAC(s.id), width:28, height:28, fontSize:10 }}>{s.avatar||s.name[0]}</div><span style={{ fontSize:13, fontWeight:500, color:"#0F172A" }}>{s.name}</span></label>)}</div>{assignedTo.length===0&&<div style={{ fontSize:11, color:"#94A3B8", marginTop:6 }}>No selection = assign to all class students</div>}</div>}
  <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}><button className="btn2" onClick={close}>Cancel</button><button className="btn1" onClick={save} disabled={loading}>{loading?"Saving…":"Create Assignment"}</button></div></div>);
}

function ViewAssignmentModal({ assignment: a, students, classes, close }) {
  if(!a) return null;
  const cls=classes.find(c=>c.id===a.class_id); const as2=students.filter(s=>a.assignedTo.includes(s.id));
  return(<div><div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}><div><span className="bdg" style={{ background:sc(a.subject).bg, color:sc(a.subject).text, marginBottom:8, display:"inline-flex" }}>{a.subject}</span><div style={{ fontFamily:"Outfit,sans-serif", fontSize:22, fontWeight:800, color:"#0F172A" }}>{a.title}</div><div style={{ color:"#64748B", fontSize:13, marginTop:4 }}>{cls?.name} · Due {a.due_date}</div></div><button style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#94A3B8" }} onClick={close}>✕</button></div>{a.description&&<div style={{ background:"#F8FAFF", borderRadius:10, padding:14, marginBottom:16, color:"#475569", fontSize:14 }}>{a.description}</div>}{a.file_name&&<div style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", background:"#EEF2FF", borderRadius:10, marginBottom:16 }}><span style={{ fontSize:18 }}>📎</span><span style={{ color:"#4F46E5", fontWeight:600, fontSize:14 }}>{a.file_name}</span></div>}<div style={{ fontFamily:"Outfit,sans-serif", fontSize:15, fontWeight:700, color:"#0F172A", marginBottom:10 }}>Assigned to ({as2.length})</div>{as2.map(s=><div key={s.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid #F1F5F9" }}><div className="av" style={{ background:getAC(s.id) }}>{s.avatar||s.name[0]}</div><div style={{ flex:1 }}><div style={{ fontWeight:500, fontSize:14, color:"#0F172A" }}>{s.name}</div><div style={{ fontSize:12, color:"#94A3B8" }}>{s.email}</div></div><span style={{ fontSize:12, color:"#F59E0B", fontWeight:600, background:"#FEF3C7", padding:"3px 10px", borderRadius:20 }}>Pending</span></div>)}<div style={{ marginTop:20, textAlign:"right" }}><button className="btn2" onClick={close}>Close</button></div></div>);
}

function ViewClassModal({ cls, students, assignments, close }) {
  if(!cls) return null;
  const cs=students.filter(s=>cls.students.includes(s.id)); const ca=assignments.filter(a=>a.class_id===cls.id);
  return(<div><div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}><div style={{ display:"flex", alignItems:"center", gap:14 }}><div style={{ width:48, height:48, borderRadius:14, background:cls.color, display:"flex", alignItems:"center", justifyContent:"center", fontSize:24, color:"#fff", fontFamily:"Outfit", fontWeight:800 }}>{cls.name[0]}</div><div><div style={{ fontFamily:"Outfit,sans-serif", fontSize:22, fontWeight:800, color:"#0F172A" }}>{cls.name}</div><div style={{ color:"#64748B", fontSize:13 }}>{cls.grade}</div></div></div><button style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#94A3B8" }} onClick={close}>✕</button></div><div style={{ display:"flex", flexWrap:"wrap", gap:6, marginBottom:20 }}>{cls.subjects.map(s=><span key={s} className="chip" style={{ background:sc(s).bg, color:sc(s).text }}>{s}</span>)}</div><div style={{ fontWeight:700, fontSize:14, color:"#0F172A", marginBottom:10 }}>Students ({cs.length})</div>{cs.length===0&&<div style={{ color:"#94A3B8", fontSize:13, marginBottom:16 }}>No students enrolled.</div>}{cs.map(s=><div key={s.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:"1px solid #F1F5F9" }}><div className="av" style={{ background:getAC(s.id) }}>{s.avatar||s.name[0]}</div><div style={{ fontWeight:500, fontSize:14, color:"#0F172A", flex:1 }}>{s.name}</div><span style={{ fontSize:12, color:"#64748B" }}>{s.grade}</span></div>)}<div style={{ fontWeight:700, fontSize:14, color:"#0F172A", marginBottom:10, marginTop:20 }}>Assignments ({ca.length})</div>{ca.length===0&&<div style={{ color:"#94A3B8", fontSize:13 }}>No assignments.</div>}{ca.map(a=><div key={a.id} className="ai"><div style={{ display:"flex", justifyContent:"space-between" }}><div style={{ fontWeight:600, color:"#0F172A", fontSize:14 }}>{a.title}</div><span className="bdg" style={{ background:sc(a.subject).bg, color:sc(a.subject).text, fontSize:11 }}>{a.subject}</span></div><div style={{ fontSize:12, color:"#64748B", marginTop:4 }}>Due {a.due_date} · {a.assignedTo.length} students</div></div>)}<div style={{ marginTop:20, textAlign:"right" }}><button className="btn2" onClick={close}>Close</button></div></div>);
}

function AssignStudentsModal({ cls, students, reload, close }) {
  const [enrolled, setEnrolled] = useState(new Set(cls.students)); const [loading, setLoading] = useState(false); const [err, setErr] = useState("");
  const toggle=id=>setEnrolled(p=>{const n=new Set(p); n.has(id)?n.delete(id):n.add(id); return n;});
  const save=async()=>{ setLoading(true); setErr(""); try{
    const cur=new Set(cls.students); const toAdd=[...enrolled].filter(id=>!cur.has(id)); const toRem=[...cur].filter(id=>!enrolled.has(id));
    await Promise.all([...toAdd.map(sid=>db("class_students","POST","",{class_id:cls.id,student_id:sid})),...toRem.map(sid=>db("class_students","DELETE",`class_id=eq.${cls.id}&student_id=eq.${sid}`))]);
    await reload(); close();
  }catch(e){setErr(e.message);}finally{setLoading(false);} };
  return(<div><div style={{ fontFamily:"Outfit,sans-serif", fontSize:22, fontWeight:800, color:"#0F172A", marginBottom:6 }}>Manage Students</div><div style={{ color:"#64748B", fontSize:14, marginBottom:20 }}>{cls.name} · {cls.grade}</div>{err&&<div className="err">{err}</div>}<div style={{ maxHeight:340, overflowY:"auto" }}>{students.map(s=><label key={s.id} className="ckl" style={{ background:enrolled.has(s.id)?"#EEF2FF":"transparent" }}><input type="checkbox" checked={enrolled.has(s.id)} onChange={()=>toggle(s.id)} style={{ accentColor:"#4F46E5" }} /><div className="av" style={{ background:getAC(s.id) }}>{s.avatar||s.name[0]}</div><div style={{ flex:1 }}><div style={{ fontWeight:500, fontSize:14, color:"#0F172A" }}>{s.name}</div><div style={{ fontSize:12, color:"#64748B" }}>{s.grade}</div></div></label>)}</div><div style={{ marginTop:20, display:"flex", gap:10, justifyContent:"flex-end" }}><button className="btn2" onClick={close}>Cancel</button><button className="btn1" onClick={save} disabled={loading}>{loading?"Saving…":`Save (${enrolled.size} students)`}</button></div></div>);
}
