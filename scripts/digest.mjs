// scripts/digest.mjs — daily fee digest for Toppers Hub Academy
// Reads active students from Supabase and emails a due/overdue summary via Resend.
const SB_URL = "https://krklgsmeamnxeawdlmka.supabase.co";
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_KEY = process.env.RESEND_API_KEY;
const TO = process.env.DIGEST_TO || "mridulnanda2004@gmail.com";
const CUR = "₹";

if (!SB_KEY) { console.error("Missing SUPABASE_SERVICE_KEY secret"); process.exit(1); }
if (!RESEND_KEY) { console.log("No RESEND_API_KEY set yet - skipping email. Add the secret to enable sending."); process.exit(0); }

const iso = (d) => d.toISOString().slice(0, 10);
const today = new Date();
const todayISO = iso(today);
const soon = new Date(today); soon.setDate(soon.getDate() + 5);
const soonISO = iso(soon);
const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const fmt = (d) => { if (!d) return "-"; const [y,m,da] = d.split("-"); return `${+da} ${M[+m-1]} ${y}`; };
const money = (n) => CUR + Number(n||0).toLocaleString("en-IN");

const res = await fetch(`${SB_URL}/rest/v1/students?select=name,monthly_fee,next_due_date&status=eq.Active&order=next_due_date.asc`, {
  headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` }
});
if (!res.ok) { console.error("Supabase error", res.status, await res.text()); process.exit(1); }
const students = await res.json();

const overdue = students.filter((s) => s.next_due_date && s.next_due_date < todayISO);
const dueSoon = students.filter((s) => s.next_due_date && s.next_due_date >= todayISO && s.next_due_date <= soonISO);
const totalOverdue = overdue.reduce((a, s) => a + Number(s.monthly_fee||0), 0);

const rows = (list) => list.length
  ? list.map((s) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee">${s.name}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${money(s.monthly_fee)}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${fmt(s.next_due_date)}</td></tr>`).join("")
  : `<tr><td colspan="3" style="padding:8px 10px;color:#888">None</td></tr>`;

const html = `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:auto">
  <div style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;padding:18px 20px;border-radius:14px 14px 0 0">
    <h2 style="margin:0">Toppers Hub Academy</h2>
    <div style="opacity:.9;font-size:13px">Fee digest - ${fmt(todayISO)}</div>
  </div>
  <div style="border:1px solid #eee;border-top:none;border-radius:0 0 14px 14px;padding:16px 18px">
    <p style="font-size:15px"><b>${overdue.length}</b> overdue (${money(totalOverdue)}) &middot; <b>${dueSoon.length}</b> due in 5 days</p>
    <h3 style="color:#ef4444;margin:14px 0 6px">Overdue</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px"><tr style="text-align:left;color:#888"><th style="padding:6px 10px">Student</th><th style="padding:6px 10px">Fee</th><th style="padding:6px 10px">Was due</th></tr>${rows(overdue)}</table>
    <h3 style="color:#f59e0b;margin:16px 0 6px">Due soon</h3>
    <table style="width:100%;border-collapse:collapse;font-size:14px"><tr style="text-align:left;color:#888"><th style="padding:6px 10px">Student</th><th style="padding:6px 10px">Fee</th><th style="padding:6px 10px">Due</th></tr>${rows(dueSoon)}</table>
    <p style="margin-top:16px"><a href="https://mnbresearch.github.io/toppers-hub-academy/" style="background:#6366f1;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Open the app</a></p>
  </div>
</div>`;

const subject = `Toppers Hub - ${overdue.length} overdue, ${dueSoon.length} due soon`;
const send = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${RESEND_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ from: "Toppers Hub <onboarding@resend.dev>", to: [TO], subject, html })
});
const body = await send.text();
console.log("Resend status", send.status, body);
if (!send.ok) process.exit(1);
console.log(`Digest sent to ${TO}: ${overdue.length} overdue, ${dueSoon.length} due soon.`);
