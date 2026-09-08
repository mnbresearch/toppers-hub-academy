/*
  Tests the payment log and the duplicate detector, by running the REAL
  functions out of app.js — not copies of them.

  Run:  node scripts/test-payment-log.mjs   (from the repo root)

  WHY. app.js is one big file with no build step and no imports, so there was
  no way to test any of it. These three functions are pure — data in, answer out
  — so they can be lifted out of the source and executed directly. That matters
  most for suspectedDuplicates(), which points a finger at real money records:
  if it flags an honest second payment, someone deletes money that was actually
  received. The cases below are mostly about what it must NOT flag.
*/
import { readFileSync } from "node:fs";
const src = readFileSync("app.js","utf8");
const grab = (n) => { const i=src.indexOf("function "+n+"("); const j=src.indexOf("\n}\n", i)+3; return src.slice(i,j); };

/* Build the real functions from app.js source, with DB and MON injected. */
const DB = { payments: [] };
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const { fmtDateTime, suspectedDuplicates, paymentsNewestFirst } = new Function("DB","MON",
  grab("fmtDateTime") + grab("suspectedDuplicates") + grab("paymentsNewestFirst") +
  "return { fmtDateTime, suspectedDuplicates, paymentsNewestFirst };")(DB, MON);

let pass=0, fail=0;
const t=(n,got,want)=>{ const ok=JSON.stringify(got)===JSON.stringify(want);
  if(ok)pass++; else {fail++; console.log("  ✗ "+n+"\n      got  "+JSON.stringify(got)+"\n      want "+JSON.stringify(want));} };
const set = (rows) => { DB.payments.length=0; DB.payments.push(...rows); };

// ---- fmtDateTime (local time, so build the inputs as local) ----
t("a real timestamp reads as date + 12-hour time", fmtDateTime(new Date(2026,8,7,14,5).toISOString()), "7 Sep 2026, 2:05 pm");
t("midnight reads 12:00 am", fmtDateTime(new Date(2026,8,7,0,0).toISOString()), "7 Sep 2026, 12:00 am");
t("noon reads 12:00 pm",     fmtDateTime(new Date(2026,8,7,12,0).toISOString()), "7 Sep 2026, 12:00 pm");
t("minutes are zero-padded", fmtDateTime(new Date(2026,8,7,9,5).toISOString()),  "7 Sep 2026, 9:05 am");
t("a missing timestamp is a dash, not 'Invalid Date'", fmtDateTime(null), "—");
t("garbage is a dash", fmtDateTime("not-a-date"), "—");

// ---- THE double-tap it exists to catch ----
set([{id:"a",student_id:"s1",amount:2000,created_at:"2026-09-07T10:00:00Z"},
     {id:"b",student_id:"s1",amount:2000,created_at:"2026-09-07T10:00:03Z"}]);
t("a 3-second repeat is flagged — and only the SECOND one", [...suspectedDuplicates()], ["b"]);

// ---- what it must NOT touch ----
set([{id:"a",student_id:"s1",amount:2000,created_at:"2026-09-07T10:00:00Z"},
     {id:"b",student_id:"s1",amount:2000,created_at:"2026-09-07T10:30:00Z"}]);
t("30 minutes apart is a real second payment, not a duplicate", [...suspectedDuplicates()], []);

set([{id:"a",student_id:"s1",amount:2000,created_at:"2026-09-07T10:00:00Z"},
     {id:"b",student_id:"s2",amount:2000,created_at:"2026-09-07T10:00:03Z"}]);
t("two students paying the same fee at once is not a duplicate", [...suspectedDuplicates()], []);

set([{id:"a",student_id:"s1",amount:2000,created_at:"2026-09-07T10:00:00Z"},
     {id:"b",student_id:"s1",amount:1500,created_at:"2026-09-07T10:00:03Z"}]);
t("same student, different amounts, is not a duplicate", [...suspectedDuplicates()], []);

set([{id:"a",student_id:"s1",amount:2000,created_at:"2026-09-07T10:00:00Z"},
     {id:"b",student_id:"s1",amount:2000,created_at:"2026-09-07T10:00:02Z"},
     {id:"c",student_id:"s1",amount:2000,created_at:"2026-09-07T10:00:05Z"}]);
t("a triple tap flags the two extras and never the original", [...suspectedDuplicates()].sort(), ["b","c"]);

set([{id:"a",student_id:"s1",amount:2000,created_at:null},
     {id:"b",student_id:"s1",amount:2000,created_at:undefined}]);
t("rows with no timestamp are ignored, not flagged", [...suspectedDuplicates()], []);

// ---- ordering: by when it was ENTERED, not the paid-on date ----
set([{id:"old",student_id:"s1",amount:1,created_at:"2026-09-01T10:00:00Z",paid_on:"2026-09-01"},
     {id:"new",student_id:"s1",amount:2,created_at:"2026-09-07T10:00:00Z",paid_on:"2026-08-01"}]);
t("log is ordered by entry time, even when paid_on disagrees",
  paymentsNewestFirst().map(p=>p.id), ["new","old"]);

set([]);
t("no payments: no duplicates, no crash", [...suspectedDuplicates()], []);
t("no payments: empty log", paymentsNewestFirst(), []);

console.log(`\npayment log + duplicate detector: ${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
