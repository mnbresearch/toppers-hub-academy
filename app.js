/* ============================================================
   TOPPERS HUB ACADEMY — app logic
   Works in two modes:
     • CLOUD  — when Supabase keys are set in config.js (syncs across phones)
     • DEMO   — when keys are blank (data saved on this device only)
   ============================================================ */
"use strict";

const CFG = window.APP_CONFIG || {};
const CUR = CFG.CURRENCY || "₹";
const DUE_SOON = Number(CFG.DUE_SOON_DAYS || 5);
const CLOUD = !!(CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY);
let sb = null;
if (CLOUD && window.supabase) sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

const DB = { teachers: [], students: [], payments: [], attendance: [] };
const STATE = { view: "dashboard", search: "", attDate: null };

/* ---------------- tiny DOM helpers ---------------- */
const $ = (s) => document.querySelector(s);
const el = (id) => document.getElementById(id);
const app = () => el("app");
function esc(s){ return String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function toast(msg){ const t=el("toast"); t.textContent=msg; t.classList.add("show"); clearTimeout(t._t); t._t=setTimeout(()=>t.classList.remove("show"),2200); }

/* ---------------- data layer ---------------- */
const LKEY = (t)=>"th_"+t;
function getLocal(t){ try{ return JSON.parse(localStorage.getItem(LKEY(t))||"[]"); }catch(e){ return []; } }
function setLocal(t,a){ localStorage.setItem(LKEY(t), JSON.stringify(a)); }

const api = {
  async list(t){
    if(!CLOUD) return getLocal(t).sort((a,b)=>(a.created_at||"").localeCompare(b.created_at||""));
    const { data, error } = await sb.from(t).select("*").order("created_at",{ascending:true});
    if(error) throw error; return data||[];
  },
  async insert(t,row){
    if(!CLOUD){ row.id=(crypto.randomUUID?crypto.randomUUID():String(Date.now()+Math.random())); row.created_at=new Date().toISOString(); const a=getLocal(t); a.push(row); setLocal(t,a); return row; }
    const { data, error } = await sb.from(t).insert(row).select().single();
    if(error) throw error; return data;
  },
  async update(t,id,patch){
    if(!CLOUD){ const a=getLocal(t); const i=a.findIndex(x=>x.id===id); if(i>=0){a[i]={...a[i],...patch}; setLocal(t,a); return a[i];} return null; }
    const { data, error } = await sb.from(t).update(patch).eq("id",id).select().single();
    if(error) throw error; return data;
  },
  async remove(t,id){
    if(!CLOUD){ setLocal(t,getLocal(t).filter(x=>x.id!==id)); return; }
    const { error } = await sb.from(t).delete().eq("id",id);
    if(error) throw error;
  }
};
async function loadAll(){
  [DB.teachers, DB.students, DB.payments] = await Promise.all([api.list("teachers"), api.list("students"), api.list("payments")]);
  try{ DB.attendance = await api.list("attendance"); }catch(e){ DB.attendance = DB.attendance||[]; }
}

/* ---------------- date + money utils ---------------- */
const MON=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
function isoOf(d){ const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), da=String(d.getDate()).padStart(2,"0"); return y+"-"+m+"-"+da; }
function todayISO(){ return isoOf(new Date()); }
function parseD(iso){ if(!iso) return null; const p=String(iso).slice(0,10).split("-"); return new Date(+p[0],+p[1]-1,+p[2]); }
function fmtDate(iso){ const d=parseD(iso); if(!d) return "—"; return d.getDate()+" "+MON[d.getMonth()]+" "+d.getFullYear(); }
function fmtShort(iso){ const d=parseD(iso); if(!d) return "—"; return d.getDate()+" "+MON[d.getMonth()]; }
function addMonthsISO(iso,n){ const d=parseD(iso)||new Date(); const day=d.getDate(); d.setMonth(d.getMonth()+n); if(d.getDate()<day) d.setDate(0); return isoOf(d); }
function monthKey(d){ d=d||new Date(); return MON[d.getMonth()]+" "+d.getFullYear(); }
function daysUntil(iso){ const d=parseD(iso); if(!d) return null; const t=new Date(); t.setHours(0,0,0,0); return Math.round((d-t)/86400000); }
function money(n){ n=Number(n||0); return CUR+n.toLocaleString("en-IN"); }
function initials(name){ return String(name||"?").trim().split(/\s+/).slice(0,2).map(w=>w[0]).join("").toUpperCase()||"?"; }
function digits(p){ return String(p||"").replace(/[^\d]/g,""); }

function dueInfo(s){
  if(s.status && s.status!=="Active") return { key:"paused", label:s.status, cls:"b-gray", order:5 };
  const d=daysUntil(s.next_due_date);
  if(d===null) return { key:"none", label:"No date", cls:"b-gray", order:4, days:null };
  if(d<0)  return { key:"overdue", label:"Overdue "+Math.abs(d)+"d", cls:"b-red", order:0, days:d };
  if(d===0) return { key:"today", label:"Due today", cls:"b-amber", order:1, days:d };
  if(d<=DUE_SOON) return { key:"soon", label:"Due in "+d+"d", cls:"b-amber", order:2, days:d };
  return { key:"ok", label:"Paid till "+fmtShort(s.next_due_date), cls:"b-green", order:3, days:d };
}
function teacherName(id){ const t=DB.teachers.find(x=>x.id===id); return t?t.name:"—"; }

/* ---------------- message templates ---------------- */
function msgFeeReminder(s){
  const nm=CFG.ACADEMY_NAME||"the academy";
  const c=CFG.ACADEMY_CONTACT?("\n\nReply here or call "+CFG.ACADEMY_CONTACT+"."):"";
  return `Hello 👋\n\nThis is a gentle reminder from ${nm}. The monthly fee of ${money(s.monthly_fee)} for ${s.name} is due on ${fmtDate(s.next_due_date)}.\n\nKindly arrange the payment at your convenience. Thank you for being part of ${nm}! 🙏${c}`;
}
function msgOverdue(s){
  const nm=CFG.ACADEMY_NAME||"the academy";
  const c=CFG.ACADEMY_CONTACT?("\n\nFor any help, contact "+CFG.ACADEMY_CONTACT+"."):"";
  const od=Math.abs(daysUntil(s.next_due_date)||0);
  return `Hello 👋\n\nA quick note from ${nm}: the monthly fee of ${money(s.monthly_fee)} for ${s.name} was due on ${fmtDate(s.next_due_date)} (${od} day${od===1?"":"s"} ago).\n\nPlease clear it soon so classes continue without interruption. Thank you! 🙏${c}`;
}
function msgWelcome(s){
  const nm=CFG.ACADEMY_NAME||"the academy";
  return `Welcome to ${nm}! 🎉\n\nWe're glad to have ${s.name} join us on the ${s.plan_name||"Monthly"} plan (${money(s.monthly_fee)}/month). The first fee is due on ${fmtDate(s.next_due_date)}.\n\nLooking forward to a great journey ahead! 📚`;
}
function msgRenewal(s){
  const nm=CFG.ACADEMY_NAME||"the academy";
  return `Hi! ✨\n\n${s.name}'s plan at ${nm} is up for renewal. The next month's fee of ${money(s.monthly_fee)} is due on ${fmtDate(s.next_due_date)}. Kindly renew to keep the classes going. Thank you! 🙏`;
}
function msgReceipt(s,p){
  const nm=CFG.ACADEMY_NAME||"the academy";
  return `Payment received ✅\n\n${nm} confirms ${money(p.amount)} received from ${s.name} on ${fmtDate(p.paid_on)}${p.for_month?(" for "+p.for_month):""} via ${p.method||"Cash"}.\n\nNext fee due: ${fmtDate(s.next_due_date)}. Thank you! 🙏`;
}

/* ---------------- outbound actions ---------------- */
function waLink(phone,text){ return "https://wa.me/"+digits(phone)+"?text="+encodeURIComponent(text); }
function mailLink(email,subject,body){ return "mailto:"+encodeURIComponent(email||"")+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(body); }
async function copyText(text){ try{ await navigator.clipboard.writeText(text); toast("Message copied ✓"); }catch(e){ prompt("Copy this message:",text); } }
function openWA(phone,text){ if(!digits(phone)){ toast("No phone number saved"); return; } window.open(waLink(phone,text),"_blank"); }

/* ============================================================
   RENDER
   ============================================================ */
function setTab(v){ document.querySelectorAll("nav.tabs button").forEach(b=>b.classList.toggle("active",b.dataset.view===v)); }
function render(){
  setTab(STATE.view);
  if(STATE.view==="dashboard") return renderDashboard();
  if(STATE.view==="students")  return renderStudents();
  if(STATE.view==="attendance")return renderAttendance();
  if(STATE.view==="teachers")  return renderTeachers();
  if(STATE.view==="money")     return renderMoney();
}

/* ---------- DASHBOARD ---------- */
function renderDashboard(){
  const active = DB.students.filter(s=>s.status==="Active");
  const infos = active.map(s=>({s,i:dueInfo(s)}));
  const overdue = infos.filter(x=>x.i.key==="overdue");
  const dueSoon = infos.filter(x=>["today","soon"].includes(x.i.key));
  const now=new Date();
  const collected = DB.payments.filter(p=>{ const d=parseD(p.paid_on); return d&&d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear(); }).reduce((a,p)=>a+Number(p.amount||0),0);
  const expected = active.reduce((a,s)=>a+Number(s.monthly_fee||0),0);

  const attention = [...overdue, ...dueSoon].sort((a,b)=>a.i.order-b.i.order);

  el("hdrSub").textContent = active.length+" active • "+DB.teachers.length+" teachers";

  app().innerHTML = `
   <div class="view">
    ${CLOUD?"":`<div class="banner">📱 Demo mode — data is saved on this device only. Add your free Supabase keys in <b>config.js</b> to sync with your mum's phone (see README).</div>`}
    <div class="stats">
      <div class="stat b"><div class="l">Active students</div><div class="n">${active.length}</div></div>
      <div class="stat r"><div class="l">Overdue</div><div class="n">${overdue.length}</div></div>
      <div class="stat a"><div class="l">Due soon</div><div class="n">${dueSoon.length}</div></div>
      <div class="stat g"><div class="l">Collected this month</div><div class="n">${money(collected)}</div></div>
    </div>
    <div class="card row" style="justify-content:space-between">
      <div><div class="muted" style="font-size:12px">Expected this month</div><div style="font-size:20px;font-weight:800">${money(expected)}</div></div>
      <button class="btn primary" onclick="openStudentForm()">＋ Add student</button>
    </div>

    <h2 class="section">🔔 Needs attention</h2>
    ${attention.length? attention.map(x=>studentRow(x.s,x.i,true)).join("") :
      `<div class="card empty"><div class="big">✅</div>All caught up! No fees due right now.</div>`}

    <h2 class="section">Quick actions</h2>
    <div class="card">
      <div class="btnrow">
        <button class="btn ghost sm" onclick="STATE.view='students';render()">🎓 All students</button>
        <button class="btn ghost sm" onclick="openTeacherForm()">👩‍🏫 Add teacher</button>
        <button class="btn ghost sm" onclick="STATE.view='money';render()">💰 Money</button>
        ${overdue.length?`<button class="btn wa sm" onclick="remindAll()">💬 Remind all overdue (${overdue.length})</button>`:""}
      </div>
    </div>
   </div>`;
}

function studentRow(s,i,showDue){
  i=i||dueInfo(s);
  return `<div class="card row listitem" onclick="openStudent('${s.id}')">
    <div class="avatar">${esc(initials(s.name))}</div>
    <div class="grow">
      <div class="row" style="justify-content:space-between;gap:8px">
        <div class="ellipsis" style="font-weight:700">${esc(s.name)}</div>
        <span class="badge ${i.cls}">${esc(i.label)}</span>
      </div>
      <div class="muted ellipsis" style="font-size:12.5px;margin-top:3px">
        ${money(s.monthly_fee)}/mo · ${esc(teacherName(s.teacher_id))}${s.grade?(" · "+esc(s.grade)):""}
      </div>
    </div>
  </div>`;
}

/* ---------- STUDENTS ---------- */
function renderStudents(){
  el("hdrSub").textContent = "Students";
  const q=STATE.search.toLowerCase();
  let list = DB.students.slice();
  if(q) list=list.filter(s=>(s.name||"").toLowerCase().includes(q)||(s.grade||"").toLowerCase().includes(q)||teacherName(s.teacher_id).toLowerCase().includes(q));
  list.sort((a,b)=>dueInfo(a).order-dueInfo(b).order || (a.name||"").localeCompare(b.name||""));
  app().innerHTML = `
   <div class="view">
    <div class="row" style="gap:8px;margin-bottom:4px">
      <input class="search" style="margin:0" placeholder="🔍 Search students…" value="${esc(STATE.search)}" oninput="STATE.search=this.value;render()"/>
      <button class="btn primary" style="flex:none" onclick="openStudentForm()">＋</button>
    </div>
    <div class="muted" style="font-size:12px;margin:2px 4px 12px">${list.length} student${list.length===1?"":"s"}</div>
    ${list.length? list.map(s=>studentRow(s)).join("") :
      `<div class="card empty"><div class="big">🎓</div>No students yet.<br/><button class="btn primary" style="margin-top:12px" onclick="openStudentForm()">＋ Add your first student</button></div>`}
   </div>`;
}

/* ---------- TEACHERS ---------- */
function renderTeachers(){
  el("hdrSub").textContent = "Teachers";
  app().innerHTML = `
   <div class="view">
    <div class="row" style="justify-content:space-between;margin-bottom:12px">
      <div class="muted" style="font-size:12px">${DB.teachers.length} teacher${DB.teachers.length===1?"":"s"}</div>
      <button class="btn primary sm" onclick="openTeacherForm()">＋ Add teacher</button>
    </div>
    ${DB.teachers.length? DB.teachers.map(t=>teacherCard(t)).join("") :
      `<div class="card empty"><div class="big">👩‍🏫</div>No teachers yet.<br/><button class="btn primary" style="margin-top:12px" onclick="openTeacherForm()">＋ Add a teacher</button></div>`}
   </div>`;
}
function teacherCard(t){
  const primary = DB.students.filter(s=>s.teacher_id===t.id && s.status==="Active");
  const coStudents = DB.students.filter(s=>s.co_teacher_id===t.id && s.status==="Active");
  const brings = primary.reduce((a,s)=>a+Number(s.monthly_fee||0),0);
  const coPay = coStudents.reduce((a,s)=>a+Number(s.co_teacher_fee||0),0);
  return `<div class="card listitem" onclick="openTeacher('${t.id}')">
    <div class="row">
      <div class="avatar" style="background:linear-gradient(135deg,var(--teal),var(--teal2))">${esc(initials(t.name))}</div>
      <div class="grow">
        <div class="row" style="justify-content:space-between">
          <div style="font-weight:700" class="ellipsis">${esc(t.name)}</div>
          <span class="badge ${t.role==="Co-teacher"?"b-sky":"b-gray"}">${esc(t.role||"Teacher")}</span>
        </div>
        <div class="muted" style="font-size:12.5px;margin-top:3px">${esc(t.subject||"—")} · ${primary.length} student${primary.length===1?"":"s"}</div>
      </div>
    </div>
    <div class="row" style="justify-content:space-between;margin-top:11px;gap:8px">
      <div class="tag">Classes bring: <b style="color:var(--text)">${money(brings)}/mo</b></div>
      ${coPay?`<div class="tag">Co-teach pay: <b style="color:var(--sky)">${money(coPay)}/mo</b></div>`:""}
    </div>
  </div>`;
}

/* ---------- MONEY ---------- */
function renderMoney(){
  el("hdrSub").textContent = "Money";
  const now=new Date();
  const active=DB.students.filter(s=>s.status==="Active");
  const collected=DB.payments.filter(p=>{const d=parseD(p.paid_on);return d&&d.getMonth()===now.getMonth()&&d.getFullYear()===now.getFullYear();}).reduce((a,p)=>a+Number(p.amount||0),0);
  const expected=active.reduce((a,s)=>a+Number(s.monthly_fee||0),0);
  const outstanding=active.filter(s=>dueInfo(s).key==="overdue").reduce((a,s)=>a+Number(s.monthly_fee||0),0);
  const coPayouts=active.filter(s=>s.co_teacher_id).reduce((a,s)=>a+Number(s.co_teacher_fee||0),0);
  const recent=DB.payments.slice().sort((a,b)=>(b.paid_on||"").localeCompare(a.paid_on||"")||(b.created_at||"").localeCompare(a.created_at||"")).slice(0,15);

  app().innerHTML=`
   <div class="view">
    <div class="stats">
      <div class="stat g"><div class="l">Collected (${monthKey(now)})</div><div class="n">${money(collected)}</div></div>
      <div class="stat b"><div class="l">Expected / month</div><div class="n">${money(expected)}</div></div>
      <div class="stat r"><div class="l">Outstanding (overdue)</div><div class="n">${money(outstanding)}</div></div>
      <div class="stat a"><div class="l">Co-teacher payouts</div><div class="n">${money(coPayouts)}</div></div>
    </div>

    <h2 class="section">Teacher payout summary</h2>
    <div class="card">
      ${DB.teachers.length? DB.teachers.map(t=>{
        const coPay=DB.students.filter(s=>s.co_teacher_id===t.id&&s.status==="Active").reduce((a,s)=>a+Number(s.co_teacher_fee||0),0);
        const brings=DB.students.filter(s=>s.teacher_id===t.id&&s.status==="Active").reduce((a,s)=>a+Number(s.monthly_fee||0),0);
        return `<div class="kv"><span>${esc(t.name)} <span class="tag">(${esc(t.role||"Teacher")})</span></span><b>${money(brings)}${coPay?(" + "+money(coPay)+" co"):""}</b></div>`;
      }).join(""):`<div class="muted center">Add teachers to see payouts.</div>`}
    </div>

    <h2 class="section">Recent payments</h2>
    ${recent.length? recent.map(p=>{
        const s=DB.students.find(x=>x.id===p.student_id);
        return `<div class="card row" style="justify-content:space-between">
          <div><div style="font-weight:700">${esc(s?s.name:"(deleted)")}</div>
          <div class="muted" style="font-size:12px">${fmtDate(p.paid_on)} · ${esc(p.method||"Cash")}${p.for_month?(" · "+esc(p.for_month)):""}</div></div>
          <div style="font-weight:800;color:var(--green)">${money(p.amount)}</div>
        </div>`;
      }).join(""):`<div class="card empty"><div class="big">🧾</div>No payments recorded yet.</div>`}
   </div>`;
}

/* ============================================================
   ATTENDANCE
   ============================================================ */
function attRec(studentId,date){ return DB.attendance.find(a=>a.student_id===studentId && a.date===date); }
function attStats(studentId){
  const recs=DB.attendance.filter(a=>a.student_id===studentId);
  const present=recs.filter(a=>a.status==="Present"||a.status==="Late").length;
  const total=recs.length;
  return { total, present, absent:recs.filter(a=>a.status==="Absent").length, pct: total?Math.round(present/total*100):null };
}
function shiftAttDate(days){ const d=parseD(STATE.attDate||todayISO()); d.setDate(d.getDate()+days); const iso=isoOf(d); if(iso>todayISO()) return; STATE.attDate=iso; renderAttendance(); }
async function markAttendance(studentId,date,status){
  const ex=attRec(studentId,date);
  try{
    if(ex){ if(ex.status===status){ await api.remove("attendance",ex.id); } else { await api.update("attendance",ex.id,{status}); } }
    else { await api.insert("attendance",{student_id:studentId,date,status}); }
    DB.attendance=await api.list("attendance"); renderAttendance();
  }catch(e){ toast("Error: "+(e.message||e)); }
}
async function markAllPresent(date){
  const active=DB.students.filter(s=>s.status==="Active");
  try{
    for(const s of active){ if(!attRec(s.id,date)) await api.insert("attendance",{student_id:s.id,date,status:"Present"}); }
    DB.attendance=await api.list("attendance"); renderAttendance(); toast("Marked all present ✓");
  }catch(e){ toast("Error: "+(e.message||e)); }
}
function renderAttendance(){
  el("hdrSub").textContent="Attendance";
  const date=STATE.attDate||todayISO(); STATE.attDate=date;
  const active=DB.students.filter(s=>s.status==="Active").sort((a,b)=>(a.name||"").localeCompare(b.name||""));
  const dayRecs=DB.attendance.filter(a=>a.date===date && active.some(s=>s.id===a.student_id));
  const present=dayRecs.filter(a=>a.status==="Present").length;
  const late=dayRecs.filter(a=>a.status==="Late").length;
  const absent=dayRecs.filter(a=>a.status==="Absent").length;
  const unmarked=Math.max(0, active.length-dayRecs.length);
  const isToday=date===todayISO();
  app().innerHTML=`
   <div class="view">
    <div class="card row" style="justify-content:space-between;gap:6px;align-items:center">
      <button class="btn ghost sm" onclick="shiftAttDate(-1)">‹ Prev</button>
      <div class="center" style="flex:1"><div style="font-weight:800">${isToday?"Today":fmtShort(date)}</div>
        <div class="muted" style="font-size:11px">${fmtDate(date)}</div></div>
      <button class="btn ghost sm" onclick="shiftAttDate(1)" ${isToday?'disabled style="opacity:.35"':''}>Next ›</button>
    </div>
    <div class="stats" style="grid-template-columns:repeat(3,1fr)">
      <div class="stat g"><div class="l">Present</div><div class="n">${present+late}</div></div>
      <div class="stat r"><div class="l">Absent</div><div class="n">${absent}</div></div>
      <div class="stat a"><div class="l">Unmarked</div><div class="n">${unmarked}</div></div>
    </div>
    ${active.length?`<button class="btn primary block" onclick="markAllPresent('${date}')">✓ Mark all present</button><div style="height:8px"></div>`:""}
    ${active.length? active.map(s=>{
      const r=attRec(s.id,date); const st=r?r.status:null;
      const b=(lbl,val,cls)=>`<button class="attbtn ${st===val?cls:''}" onclick="markAttendance('${s.id}','${date}','${val}')">${lbl}</button>`;
      return `<div class="card row" style="justify-content:space-between;gap:8px;padding:10px 12px">
        <div class="row grow" style="gap:10px;min-width:0">
          <div class="avatar" style="width:38px;height:38px;font-size:14px">${esc(initials(s.name))}</div>
          <div class="grow" style="min-width:0"><div class="ellipsis" style="font-weight:700">${esc(s.name)}</div>
          <div class="muted ellipsis" style="font-size:11px">${esc(s.grade||teacherName(s.teacher_id)||"")}</div></div>
        </div>
        <div class="row" style="gap:5px;flex:none">${b("P","Present","att-p")}${b("L","Late","att-l")}${b("A","Absent","att-a")}</div>
      </div>`;
    }).join("") : `<div class="card empty"><div class="big">📋</div>Add students first, then take attendance here.</div>`}
    <div class="muted center" style="font-size:11.5px;margin-top:6px">Tap P / L / A to mark. Tap the same button again to clear.</div>
   </div>`;
}

/* ============================================================
   PDF RECEIPT  (shareable to WhatsApp)
   ============================================================ */
async function shareReceiptPDF(studentId,payId){
  const s=DB.students.find(x=>x.id===studentId); if(!s) return;
  let p = payId ? DB.payments.find(x=>x.id===payId) : null;
  if(!p) p = { amount:s.monthly_fee, paid_on:todayISO(), method:"Cash", for_month:monthKey() };
  const ctor=(window.jspdf&&window.jspdf.jsPDF)||window.jsPDF;
  if(!ctor){ toast("Receipt tool still loading — try again in a moment"); return; }
  const W=384, doc=new ctor({unit:"pt",format:[W,540]});
  const rsAmt=(n)=>"Rs "+Number(n||0).toLocaleString("en-IN"); // jsPDF Helvetica has no rupee glyph
  doc.setFillColor(29,78,216); doc.rect(0,0,W,96,"F");
  doc.setTextColor(255,255,255);
  doc.setFont("helvetica","bold"); doc.setFontSize(19); doc.text(CFG.ACADEMY_NAME||"Academy",24,42);
  doc.setFont("helvetica","normal"); doc.setFontSize(11); doc.text("Payment Receipt",24,64);
  if(CFG.ACADEMY_CONTACT){ doc.setFontSize(9); doc.text(String(CFG.ACADEMY_CONTACT),24,82); }
  doc.setFontSize(11); doc.setTextColor(120,120,130); doc.text("Amount received",24,138);
  doc.setTextColor(34,150,90); doc.setFont("helvetica","bold"); doc.setFontSize(30);
  doc.text(rsAmt(p.amount),24,172);
  let y=214; doc.setFontSize(11);
  const row=(k,v)=>{ doc.setTextColor(120,120,130); doc.setFont("helvetica","normal"); doc.text(k,24,y);
    doc.setTextColor(17,24,39); doc.setFont("helvetica","bold"); doc.text(String(v),W-24,y,{align:"right"});
    doc.setDrawColor(228,228,234); doc.line(24,y+10,W-24,y+10); y+=32; };
  row("Received from", s.name);
  row("Date", fmtDate(p.paid_on));
  row("Method", p.method||"Cash");
  if(p.for_month) row("For", p.for_month);
  row("Monthly fee", rsAmt(s.monthly_fee));
  if(s.next_due_date) row("Next due", fmtDate(s.next_due_date));
  doc.setTextColor(120,120,130); doc.setFont("helvetica","normal"); doc.setFontSize(10);
  doc.text("Thank you! Please keep this as proof of payment.",24,y+8);
  doc.setFontSize(8); doc.setTextColor(160,160,170);
  doc.text("Generated "+fmtDate(todayISO())+" · "+(CFG.ACADEMY_NAME||"Academy"),24,522);
  const fname="Receipt-"+String(s.name||"student").replace(/\s+/g,"-")+"-"+(p.paid_on||todayISO())+".pdf";
  const blob=doc.output("blob"); const file=new File([blob],fname,{type:"application/pdf"});
  if(navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file],title:"Payment Receipt",text:(CFG.ACADEMY_NAME||"Academy")+" — receipt for "+s.name}); return; }
    catch(e){ if(e&&e.name==="AbortError") return; }
  }
  const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=fname; a.click(); setTimeout(()=>URL.revokeObjectURL(url),2000);
  toast("Receipt saved ✓");
}
function openReceiptOptions(studentId,payId){
  const s=DB.students.find(x=>x.id===studentId); if(!s) return;
  const p=DB.payments.find(x=>x.id===payId)||{}; const wa=s.phone||s.guardian_phone||"";
  openSheet(`
    <div class="sheettop"><h3>Payment saved ✅</h3><button class="iconbtn" style="background:var(--card2)" onclick="closeSheet()">✕</button></div>
    <div class="muted" style="margin:0 2px 12px">${esc(s.name)} · ${money(p.amount||s.monthly_fee)} · next due ${fmtDate(s.next_due_date)}</div>
    <button class="btn primary block" onclick="shareReceiptPDF('${studentId}','${payId}')">📄 Share PDF receipt</button>
    <div style="height:8px"></div>
    <button class="btn wa block" ${wa?"":'disabled style="opacity:.5"'} onclick="openWA('${esc(wa)}',msgReceipt(DB.students.find(x=>x.id==='${studentId}'),DB.payments.find(x=>x.id==='${payId}')||{}))">💬 WhatsApp text receipt</button>
    <div style="height:8px"></div>
    <button class="btn ghost block" onclick="closeSheet()">Done</button>
  `);
}

/* ============================================================
   SHEETS / MODALS
   ============================================================ */
function openSheet(html){ el("modalRoot").innerHTML=`<div class="overlay" onclick="if(event.target===this)closeSheet()"><div class="sheet"><div class="grabber"></div>${html}</div></div>`; document.body.style.overflow="hidden"; }
function closeSheet(){ el("modalRoot").innerHTML=""; document.body.style.overflow=""; }

/* ---------- Student detail ---------- */
function openStudent(id){
  const s=DB.students.find(x=>x.id===id); if(!s) return;
  const i=dueInfo(s);
  const wa = s.phone||s.guardian_phone;
  const pays=DB.payments.filter(p=>p.student_id===id).sort((a,b)=>(b.paid_on||"").localeCompare(a.paid_on||"")).slice(0,6);
  openSheet(`
    <div class="sheettop"><h3>${esc(s.name)}</h3><button class="iconbtn" style="background:var(--card2)" onclick="closeSheet()">✕</button></div>
    <span class="badge ${i.cls}">${esc(i.label)}</span>
    <div class="card" style="margin-top:12px">
      <div class="kv"><span>Monthly fee</span><b>${money(s.monthly_fee)}</b></div>
      <div class="kv"><span>Next due</span><b>${fmtDate(s.next_due_date)}</b></div>
      <div class="kv"><span>Plan</span><b>${esc(s.plan_name||"Monthly")}</b></div>
      <div class="kv"><span>Teacher</span><b>${esc(teacherName(s.teacher_id))}</b></div>
      ${s.co_teacher_id?`<div class="kv"><span>Co-teacher</span><b>${esc(teacherName(s.co_teacher_id))} (${money(s.co_teacher_fee)})</b></div>`:""}
      ${s.grade?`<div class="kv"><span>Class</span><b>${esc(s.grade)}</b></div>`:""}
      <div class="kv"><span>Status</span><b>${esc(s.status)}</b></div>
      ${(()=>{const a=attStats(s.id);return a.total?`<div class="kv"><span>Attendance</span><b>${a.pct}% <span class="tag">(${a.present}/${a.total})</span></b></div>`:"";})()}
      ${s.phone?`<div class="kv"><span>Phone</span><b>${esc(s.phone)}</b></div>`:""}
      ${s.guardian_phone?`<div class="kv"><span>Guardian</span><b>${esc(s.guardian_phone)}</b></div>`:""}
      ${s.notes?`<div class="kv"><span>Notes</span><b style="max-width:60%;text-align:right">${esc(s.notes)}</b></div>`:""}
    </div>

    <button class="btn primary block" onclick="openPaymentForm('${s.id}')">✅ Record payment</button>
    <div style="height:8px"></div>
    <button class="btn ghost block" onclick="openMessages('${s.id}')">💬 Send reminder / message</button>

    <h2 class="section" style="margin-top:18px">Payment history</h2>
    ${pays.length? pays.map(p=>`<div class="card row" style="justify-content:space-between;padding:10px 12px 10px 14px">
        <div class="muted" style="font-size:13px">${fmtDate(p.paid_on)} · ${esc(p.method||"Cash")}</div>
        <div class="row" style="gap:8px"><b style="color:var(--green)">${money(p.amount)}</b>
        <button class="btn ghost sm" title="Share receipt" onclick="shareReceiptPDF('${s.id}','${p.id}')">📄</button></div></div>`).join("")
      :`<div class="muted" style="margin:0 4px 10px">No payments yet.</div>`}

    <div class="btnrow" style="margin-top:14px">
      <button class="btn ghost sm grow" onclick="openStudentForm('${s.id}')">✏️ Edit</button>
      <button class="btn ghost sm" style="color:var(--red)" onclick="deleteStudent('${s.id}')">🗑 Delete</button>
    </div>
  `);
}

/* ---------- Messages picker ---------- */
function openMessages(id){
  const s=DB.students.find(x=>x.id===id); if(!s) return;
  const i=dueInfo(s);
  const suggested = i.key==="overdue" ? "overdue" : "reminder";
  const templates = {
    reminder:{label:"Fee reminder",fn:msgFeeReminder},
    overdue:{label:"Overdue notice",fn:msgOverdue},
    renewal:{label:"Renewal reminder",fn:msgRenewal},
    welcome:{label:"Welcome message",fn:msgWelcome},
  };
  const opts = Object.entries(templates).map(([k,v])=>`<option value="${k}" ${k===suggested?"selected":""}>${v.label}</option>`).join("");
  const first = templates[suggested].fn(s);
  const to = s.phone||s.guardian_phone||"";
  openSheet(`
    <div class="sheettop"><h3>Message · ${esc(s.name)}</h3><button class="iconbtn" style="background:var(--card2)" onclick="closeSheet()">✕</button></div>
    <label class="f">Choose a message</label>
    <select class="in" id="msgType" onchange="_refreshMsg('${s.id}')">${opts}</select>
    <label class="f">Preview (you can edit before sending)</label>
    <textarea class="in" id="msgBox" style="min-height:150px">${esc(first)}</textarea>
    <label class="f">Send to</label>
    <select class="in" id="msgTo">
      ${s.phone?`<option value="${esc(s.phone)}">Student — ${esc(s.phone)}</option>`:""}
      ${s.guardian_phone?`<option value="${esc(s.guardian_phone)}">Guardian — ${esc(s.guardian_phone)}</option>`:""}
      ${(!s.phone&&!s.guardian_phone)?`<option value="">No number saved</option>`:""}
    </select>
    <div style="height:14px"></div>
    <button class="btn wa block" onclick="_send('wa','${s.id}')">💬 Send on WhatsApp</button>
    <div class="btnrow" style="margin-top:8px">
      <button class="btn ghost grow" onclick="_send('copy','${s.id}')">📋 Copy</button>
      <button class="btn ghost grow" onclick="_send('mail','${s.id}')">✉️ Email</button>
    </div>
  `);
}
window._refreshMsg=function(id){ const s=DB.students.find(x=>x.id===id); const k=el("msgType").value;
  const map={reminder:msgFeeReminder,overdue:msgOverdue,renewal:msgRenewal,welcome:msgWelcome};
  el("msgBox").value=map[k](s); };
window._send=function(how,id){ const s=DB.students.find(x=>x.id===id); const text=el("msgBox").value;
  const to=el("msgTo").value;
  if(how==="wa") openWA(to,text);
  if(how==="copy") copyText(text);
  if(how==="mail") window.open(mailLink(s.email,(CFG.ACADEMY_NAME||"Academy")+" — fee reminder",text),"_blank");
};

function remindAll(){
  const overdue=DB.students.filter(s=>s.status==="Active"&&dueInfo(s).key==="overdue");
  if(!overdue.length){ toast("No overdue students"); return; }
  const rows=overdue.map(s=>{ const to=s.phone||s.guardian_phone; return `<div class="card row" style="justify-content:space-between">
     <div class="grow"><div style="font-weight:700">${esc(s.name)}</div><div class="muted" style="font-size:12px">${money(s.monthly_fee)} · due ${fmtShort(s.next_due_date)}</div></div>
     <button class="btn wa sm" onclick="openWA('${esc(to)}',msgOverdue(DB.students.find(x=>x.id==='${s.id}')))">💬</button>
   </div>`; }).join("");
  openSheet(`<div class="sheettop"><h3>Remind overdue (${overdue.length})</h3><button class="iconbtn" style="background:var(--card2)" onclick="closeSheet()">✕</button></div>
    <div class="muted" style="margin:0 2px 12px;font-size:13px">Tap 💬 to open each WhatsApp reminder.</div>${rows}`);
}

/* ---------- Teacher detail ---------- */
function openTeacher(id){
  const t=DB.teachers.find(x=>x.id===id); if(!t) return;
  const primary=DB.students.filter(s=>s.teacher_id===id);
  const co=DB.students.filter(s=>s.co_teacher_id===id);
  openSheet(`
    <div class="sheettop"><h3>${esc(t.name)}</h3><button class="iconbtn" style="background:var(--card2)" onclick="closeSheet()">✕</button></div>
    <span class="badge ${t.role==="Co-teacher"?"b-sky":"b-gray"}">${esc(t.role||"Teacher")}</span>
    <div class="card" style="margin-top:12px">
      ${t.subject?`<div class="kv"><span>Subject</span><b>${esc(t.subject)}</b></div>`:""}
      ${t.phone?`<div class="kv"><span>Phone</span><b>${esc(t.phone)}</b></div>`:""}
      ${t.email?`<div class="kv"><span>Email</span><b>${esc(t.email)}</b></div>`:""}
      <div class="kv"><span>Students (primary)</span><b>${primary.length}</b></div>
      ${co.length?`<div class="kv"><span>Co-teaching</span><b>${co.length} student${co.length===1?"":"s"}</b></div>`:""}
      ${t.notes?`<div class="kv"><span>Notes</span><b style="max-width:60%;text-align:right">${esc(t.notes)}</b></div>`:""}
    </div>
    <h2 class="section">Their students</h2>
    ${primary.length? primary.map(s=>`<div class="card row listitem" onclick="closeSheet();openStudent('${s.id}')">
        <div class="avatar">${esc(initials(s.name))}</div>
        <div class="grow"><div style="font-weight:700" class="ellipsis">${esc(s.name)}</div>
        <div class="muted" style="font-size:12px">${money(s.monthly_fee)}/mo</div></div>
        <span class="badge ${dueInfo(s).cls}">${esc(dueInfo(s).label)}</span></div>`).join("")
      :`<div class="muted" style="margin:0 4px">No students assigned yet.</div>`}
    <div class="btnrow" style="margin-top:16px">
      <button class="btn ghost sm grow" onclick="openTeacherForm('${t.id}')">✏️ Edit</button>
      <button class="btn ghost sm" style="color:var(--red)" onclick="deleteTeacher('${t.id}')">🗑 Delete</button>
    </div>
  `);
}

/* ============================================================
   FORMS
   ============================================================ */
function val(id){ const e=el(id); return e?e.value.trim():""; }

function openTeacherForm(id){
  const t=id?DB.teachers.find(x=>x.id===id):{};
  openSheet(`
    <div class="sheettop"><h3>${id?"Edit teacher":"Add teacher"}</h3><button class="iconbtn" style="background:var(--card2)" onclick="closeSheet()">✕</button></div>
    <label class="f">Name *</label><input class="in" id="tName" value="${esc(t.name||"")}" placeholder="e.g. Priya Sharma"/>
    <div class="two">
      <div><label class="f">Role</label><select class="in" id="tRole">
        <option ${t.role!=="Co-teacher"?"selected":""}>Teacher</option>
        <option ${t.role==="Co-teacher"?"selected":""}>Co-teacher</option></select></div>
      <div><label class="f">Subject</label><input class="in" id="tSubject" value="${esc(t.subject||"")}" placeholder="Physics"/></div>
    </div>
    <div class="two">
      <div><label class="f">Phone</label><input class="in" id="tPhone" value="${esc(t.phone||"")}" placeholder="+91…"/></div>
      <div><label class="f">Email</label><input class="in" id="tEmail" value="${esc(t.email||"")}" placeholder="optional"/></div>
    </div>
    <label class="f">Notes</label><textarea class="in" id="tNotes" placeholder="optional">${esc(t.notes||"")}</textarea>
    <div style="height:16px"></div>
    <button class="btn primary block" onclick="saveTeacher('${id||""}')">${id?"Save changes":"Add teacher"}</button>
  `);
}
async function saveTeacher(id){
  const name=val("tName"); if(!name){ toast("Name is required"); return; }
  const row={ name, role:val("tRole"), subject:val("tSubject"), phone:val("tPhone"), email:val("tEmail"), notes:val("tNotes") };
  try{ if(id) await api.update("teachers",id,row); else await api.insert("teachers",row);
    await loadAll(); closeSheet(); render(); toast(id?"Teacher updated ✓":"Teacher added ✓");
  }catch(e){ toast("Error: "+(e.message||e)); }
}
async function deleteTeacher(id){
  if(!confirm("Delete this teacher? Their students stay but become unassigned.")) return;
  try{ await api.remove("teachers",id); await loadAll(); closeSheet(); render(); toast("Teacher deleted"); }
  catch(e){ toast("Error: "+(e.message||e)); }
}

function teacherOptions(sel){ return `<option value="">— none —</option>`+DB.teachers.map(t=>`<option value="${t.id}" ${t.id===sel?"selected":""}>${esc(t.name)} (${esc(t.role||"Teacher")})</option>`).join(""); }

function openStudentForm(id){
  const s=id?DB.students.find(x=>x.id===id):{ join_date:todayISO(), next_due_date:addMonthsISO(todayISO(),1), plan_name:"Monthly", status:"Active", monthly_fee:"" };
  openSheet(`
    <div class="sheettop"><h3>${id?"Edit student":"Add student"}</h3><button class="iconbtn" style="background:var(--card2)" onclick="closeSheet()">✕</button></div>
    <label class="f">Name *</label><input class="in" id="sName" value="${esc(s.name||"")}" placeholder="e.g. Aarav Gupta"/>
    <div class="two">
      <div><label class="f">Monthly fee (${CUR}) *</label><input class="in" id="sFee" type="number" inputmode="numeric" value="${esc(s.monthly_fee)}" placeholder="2000"/></div>
      <div><label class="f">Class / grade</label><input class="in" id="sGrade" value="${esc(s.grade||"")}" placeholder="Class 10"/></div>
    </div>
    <div class="two">
      <div><label class="f">Plan</label><input class="in" id="sPlan" value="${esc(s.plan_name||"Monthly")}"/></div>
      <div><label class="f">Status</label><select class="in" id="sStatus">
        ${["Active","Paused","Left"].map(x=>`<option ${s.status===x?"selected":""}>${x}</option>`).join("")}</select></div>
    </div>
    <div class="two">
      <div><label class="f">Join date</label><input class="in" id="sJoin" type="date" value="${esc(s.join_date||todayISO())}"/></div>
      <div><label class="f">Next fee due *</label><input class="in" id="sDue" type="date" value="${esc(s.next_due_date||"")}"/></div>
    </div>
    <label class="f">Teacher</label><select class="in" id="sTeacher">${teacherOptions(s.teacher_id)}</select>
    <div class="two">
      <div><label class="f">Co-teacher</label><select class="in" id="sCo">${teacherOptions(s.co_teacher_id)}</select></div>
      <div><label class="f">Co-teacher fee (${CUR})</label><input class="in" id="sCoFee" type="number" inputmode="numeric" value="${esc(s.co_teacher_fee||"")}" placeholder="0"/></div>
    </div>
    <div class="two">
      <div><label class="f">Student phone</label><input class="in" id="sPhone" value="${esc(s.phone||"")}" placeholder="+91…"/></div>
      <div><label class="f">Guardian phone</label><input class="in" id="sGuardian" value="${esc(s.guardian_phone||"")}" placeholder="+91…"/></div>
    </div>
    <label class="f">Email (for email reminders)</label><input class="in" id="sEmail" value="${esc(s.email||"")}" placeholder="optional"/>
    <label class="f">Notes</label><textarea class="in" id="sNotes" placeholder="optional">${esc(s.notes||"")}</textarea>
    ${DB.teachers.length?"":`<div class="banner" style="margin-top:12px">💡 Tip: add a teacher first to assign students to them.</div>`}
    <div style="height:16px"></div>
    <button class="btn primary block" onclick="saveStudent('${id||""}')">${id?"Save changes":"Add student"}</button>
  `);
}
async function saveStudent(id){
  const name=val("sName"); if(!name){ toast("Name is required"); return; }
  const fee=Number(val("sFee")||0);
  const row={
    name, monthly_fee:fee, grade:val("sGrade"), plan_name:val("sPlan")||"Monthly", status:val("sStatus"),
    join_date:val("sJoin")||todayISO(), next_due_date:val("sDue")||null,
    teacher_id:val("sTeacher")||null, co_teacher_id:val("sCo")||null, co_teacher_fee:Number(val("sCoFee")||0),
    phone:val("sPhone"), guardian_phone:val("sGuardian"), email:val("sEmail"), notes:val("sNotes")
  };
  try{
    let saved;
    if(id){ saved=await api.update("students",id,row); }
    else { saved=await api.insert("students",row); }
    await loadAll(); closeSheet(); render();
    toast(id?"Student updated ✓":"Student added ✓");
    if(!id && (saved&&(saved.phone||saved.guardian_phone))){ setTimeout(()=>askWelcome(saved.id),300); }
  }catch(e){ toast("Error: "+(e.message||e)); }
}
function askWelcome(id){ const s=DB.students.find(x=>x.id===id); if(!s) return;
  if(confirm("Send a welcome WhatsApp message to "+s.name+"?")) openWA(s.phone||s.guardian_phone, msgWelcome(s)); }

async function deleteStudent(id){
  if(!confirm("Delete this student and their payment history?")) return;
  try{ await api.remove("students",id); await loadAll(); closeSheet(); render(); toast("Student deleted"); }
  catch(e){ toast("Error: "+(e.message||e)); }
}

/* ---------- Payment ---------- */
function openPaymentForm(id){
  const s=DB.students.find(x=>x.id===id); if(!s) return;
  openSheet(`
    <div class="sheettop"><h3>Record payment</h3><button class="iconbtn" style="background:var(--card2)" onclick="closeSheet()">✕</button></div>
    <div class="muted" style="margin:0 2px 4px">${esc(s.name)} · next due ${fmtDate(s.next_due_date)}</div>
    <div class="two">
      <div><label class="f">Amount (${CUR}) *</label><input class="in" id="pAmt" type="number" inputmode="numeric" value="${esc(s.monthly_fee)}"/></div>
      <div><label class="f">Paid on</label><input class="in" id="pDate" type="date" value="${todayISO()}"/></div>
    </div>
    <div class="two">
      <div><label class="f">Method</label><select class="in" id="pMethod">
        ${["Cash","UPI","Bank","Card","Other"].map(x=>`<option>${x}</option>`).join("")}</select></div>
      <div><label class="f">For month</label><input class="in" id="pMonth" value="${esc(monthKey(parseD(s.next_due_date)||new Date()))}"/></div>
    </div>
    <label class="f">Advance next due date by</label>
    <select class="in" id="pAdvance"><option value="1" selected>+1 month</option><option value="0">Don't change</option><option value="2">+2 months</option><option value="3">+3 months</option></select>
    <label class="f">Note</label><input class="in" id="pNote" placeholder="optional"/>
    <div style="height:16px"></div>
    <button class="btn primary block" onclick="savePayment('${id}')">✅ Save payment</button>
  `);
}
async function savePayment(id){
  const s=DB.students.find(x=>x.id===id); if(!s) return;
  const amt=Number(val("pAmt")||0); if(!amt){ toast("Enter an amount"); return; }
  const pay={ student_id:id, amount:amt, paid_on:val("pDate")||todayISO(), method:val("pMethod"), for_month:val("pMonth"), note:val("pNote") };
  const adv=Number(val("pAdvance")||0);
  try{
    const saved=await api.insert("payments",pay);
    if(adv>0){ const base=s.next_due_date||todayISO(); await api.update("students",id,{ next_due_date:addMonthsISO(base,adv) }); }
    await loadAll(); closeSheet(); render(); toast("Payment saved ✓");
    openReceiptOptions(id, saved.id);
  }catch(e){ toast("Error: "+(e.message||e)); }
}

/* ============================================================
   AUTH  (cloud mode only)
   ============================================================ */
function renderAuth(mode){
  mode=mode||"login";
  app().innerHTML=`
   <div class="authwrap view">
     <div class="authlogo">TH</div>
     <div class="center"><h2 style="margin:0 0 4px">${esc(CFG.ACADEMY_NAME||"Toppers Hub Academy")}</h2>
     <div class="muted" style="font-size:13px;margin-bottom:18px">Fees & student manager</div></div>
     <div class="card">
       <label class="f">Email</label><input class="in" id="auEmail" type="email" placeholder="you@example.com"/>
       <label class="f">Password</label><input class="in" id="auPass" type="password" placeholder="at least 6 characters"/>
       <div style="height:14px"></div>
       <button class="btn primary block" id="auBtn" onclick="doAuth('${mode}')">${mode==="login"?"Log in":"Create account"}</button>
       <div class="center" style="margin-top:14px;font-size:13px">
         ${mode==="login"
           ? `New here? <span class="link" onclick="renderAuth('signup')">Create an account</span>`
           : `Already have one? <span class="link" onclick="renderAuth('login')">Log in</span>`}
       </div>
     </div>
     <div class="muted center" style="font-size:11.5px;margin-top:14px">Tip: you and your mum can share the same login to see the same data.</div>
   </div>`;
}
async function doAuth(mode){
  const email=val("auEmail"), pass=val("auPass");
  if(!email||!pass){ toast("Enter email and password"); return; }
  const btn=el("auBtn"); btn.textContent="Please wait…"; btn.disabled=true;
  try{
    let res;
    if(mode==="signup") res=await sb.auth.signUp({email,password:pass});
    else res=await sb.auth.signInWithPassword({email,password:pass});
    if(res.error) throw res.error;
    if(mode==="signup" && !res.data.session){ toast("Account created — check email to confirm, then log in."); renderAuth("login"); return; }
    await startApp();
  }catch(e){ toast(e.message||"Auth failed"); btn.textContent=mode==="login"?"Log in":"Create account"; btn.disabled=false; }
}
async function signOut(){ if(CLOUD&&sb){ await sb.auth.signOut(); } location.reload(); }

/* ---------- Settings menu ---------- */
el("menuBtn").addEventListener("click",()=>{
  openSheet(`
    <div class="sheettop"><h3>Settings</h3><button class="iconbtn" style="background:var(--card2)" onclick="closeSheet()">✕</button></div>
    <div class="card">
      <div class="kv"><span>Academy</span><b>${esc(CFG.ACADEMY_NAME||"Toppers Hub")}</b></div>
      <div class="kv"><span>Mode</span><b>${CLOUD?"☁️ Cloud (synced)":"📱 Demo (this device)"}</b></div>
      <div class="kv"><span>Students</span><b>${DB.students.length}</b></div>
      <div class="kv"><span>Teachers</span><b>${DB.teachers.length}</b></div>
    </div>
    <button class="btn primary block" onclick="closeSheet();doInstall()">📲 Install app on this device</button>
    <div style="height:8px"></div>
    <button class="btn ghost block" onclick="exportData()">⬇️ Export backup (JSON)</button>
    <div style="height:8px"></div>
    ${CLOUD?`<button class="btn ghost block" onclick="signOut()">🚪 Log out</button>`
           :`<div class="banner">Add Supabase keys in <b>config.js</b> to enable cloud sync & login. See README.</div>`}
  `);
});
function exportData(){
  const blob=new Blob([JSON.stringify({exported:new Date().toISOString(),...DB},null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download="toppers-hub-backup-"+todayISO()+".json"; a.click();
  toast("Backup downloaded ✓");
}

/* ============================================================
   INSTALL TO PHONE  (Add to Home Screen)
   ============================================================ */
let _deferredPrompt = null;
function isStandalone(){ return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true; }
function isIOS(){ return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream; }

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  _deferredPrompt = e;
  if(!isStandalone()) el("installBtn").classList.remove("hidden");
});
window.addEventListener("appinstalled", () => {
  _deferredPrompt = null;
  el("installBtn").classList.add("hidden");
  toast("App installed 🎉");
});

async function doInstall(){
  if(_deferredPrompt){
    _deferredPrompt.prompt();
    const { outcome } = await _deferredPrompt.userChoice;
    if(outcome === "accepted"){ el("installBtn").classList.add("hidden"); }
    _deferredPrompt = null;
    return;
  }
  // iOS Safari (and browsers with no prompt event) — show manual steps
  openSheet(`
    <div class="sheettop"><h3>Install on your phone</h3><button class="iconbtn" style="background:var(--card2)" onclick="closeSheet()">✕</button></div>
    ${isIOS()? `
      <div class="card">
        <div style="font-weight:700;margin-bottom:8px">📱 iPhone / iPad (Safari)</div>
        <div class="kv"><span>1.</span><b style="font-weight:500;text-align:right">Tap the <b>Share</b> button (□ with ↑) at the bottom of Safari</b></div>
        <div class="kv"><span>2.</span><b style="font-weight:500;text-align:right">Scroll and tap <b>Add to Home Screen</b></b></div>
        <div class="kv"><span>3.</span><b style="font-weight:500;text-align:right">Tap <b>Add</b> — the Toppers Hub icon appears on your home screen</b></div>
      </div>`
    : `
      <div class="card">
        <div style="font-weight:700;margin-bottom:8px">📱 Android (Chrome)</div>
        <div class="kv"><span>1.</span><b style="font-weight:500;text-align:right">Tap the <b>⋮</b> menu (top-right)</b></div>
        <div class="kv"><span>2.</span><b style="font-weight:500;text-align:right">Tap <b>Install app</b> (or <b>Add to Home screen</b>)</b></div>
        <div class="kv"><span>3.</span><b style="font-weight:500;text-align:right">Confirm — the icon appears on your home screen</b></div>
      </div>
      <div class="muted center" style="font-size:12px;margin-top:10px">On a computer, use the install icon in the browser's address bar.</div>`}
  `);
}
el("installBtn").addEventListener("click", doInstall);
// If already installed, never show the floating button
if(isStandalone()) el("installBtn").classList.add("hidden");
// On iOS there is no beforeinstallprompt — show the button so they can get steps
if(isIOS() && !isStandalone()) el("installBtn").classList.remove("hidden");

/* ============================================================
   BOOT
   ============================================================ */
document.querySelectorAll("nav.tabs button").forEach(b=>b.addEventListener("click",()=>{ STATE.view=b.dataset.view; STATE.search=""; window.scrollTo(0,0); render(); }));

async function startApp(){
  el("appHeader").classList.remove("hidden");
  el("tabs").classList.remove("hidden");
  el("hdrName").textContent=CFG.ACADEMY_NAME||"Toppers Hub Academy";
  app().innerHTML=`<div class="empty" style="padding-top:70px"><div class="spinner"></div>Loading…</div>`;
  try{ await loadAll(); }catch(e){ app().innerHTML=`<div class="empty"><div class="big">⚠️</div>${esc(e.message||"Failed to load data")}</div>`; return; }
  STATE.view="dashboard"; render();
}

(async function boot(){
  if(!CLOUD){ await startApp(); return; }
  if(!sb){ app().innerHTML=`<div class="empty"><div class="big">⚠️</div>Supabase library did not load. Check your internet and refresh.</div>`; el("appHeader").classList.remove("hidden"); return; }
  const { data:{ session } } = await sb.auth.getSession();
  if(session){ await startApp(); }
  else { el("appHeader").classList.remove("hidden"); el("hdrName").textContent=CFG.ACADEMY_NAME||"Toppers Hub"; el("hdrSub").textContent="Please log in"; renderAuth("login"); }
})();
