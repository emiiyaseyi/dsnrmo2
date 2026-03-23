import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import { INITIAL_STAFF, PROJECT_LIST } from "./data.js";

// ─── SUPABASE — configured at runtime from admin Settings panel ──────────────
function getSBClient() {
  try {
    const cfg = JSON.parse(localStorage.getItem("dsn_sb_cfg") || "{}");
    if (cfg.url && cfg.key && cfg.url.startsWith("https://")) {
      return createClient(cfg.url, cfg.key);
    }
  } catch {}
  return null;
}
let sb = getSBClient();

// ─── WEEK HELPERS ─────────────────────────────────────────────────────────────
const EPOCH = new Date("2026-01-12");
function getWeekKey(wn) {
  const mon = new Date(EPOCH); mon.setDate(EPOCH.getDate() + (wn - 1) * 7);
  const mn = mon.toLocaleString("en-GB", { month: "long" }), yr = mon.getFullYear();
  const fom = new Date(yr, mon.getMonth(), 1);
  const dow = fom.getDay(), off = dow <= 1 ? 1 - dow : 8 - dow;
  const fMon = new Date(fom); fMon.setDate(fom.getDate() + off);
  const wim = Math.max(1, Math.floor((mon - fMon) / (7 * 864e5)) + 1);
  return `${mn} ${yr} Week ${wim}`;
}
function getWeekDates(wn) {
  const mon = new Date(EPOCH); mon.setDate(EPOCH.getDate() + (wn - 1) * 7);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(mon); d.setDate(mon.getDate() + i);
    return d.toISOString().split("T")[0];
  });
}
function getCurrentWeek() {
  const diff = new Date() - EPOCH;
  return diff < 0 ? 1 : Math.floor(diff / (7 * 864e5)) + 1;
}
const toYM = d => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}`; };
const fmt = d => d ? new Date(d).toLocaleDateString("en-GB", { day:"2-digit", month:"short", year:"numeric" }) : "—";
const fmtDT = d => d ? new Date(d).toLocaleString("en-GB", { day:"2-digit", month:"short", hour:"2-digit", minute:"2-digit" }) : "—";
const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
const getDevice = () => { try { const ua = navigator.userAgent; if (/Mobi|Android|iPhone/i.test(ua)) return "mobile"; if (/Tablet|iPad/i.test(ua)) return "tablet"; return "web"; } catch { return "web"; } };

// ─── LOCAL STORAGE ────────────────────────────────────────────────────────────
const LS = {
  get: k => { try { const v = localStorage.getItem(`dsn_${k}`); return v ? JSON.parse(v) : null; } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(`dsn_${k}`, JSON.stringify(v)); } catch {} },
  del: k => { try { localStorage.removeItem(`dsn_${k}`); } catch {} }
};

// ─── SUPABASE HELPERS ─────────────────────────────────────────────────────────
const DB = {
  async upsertOverride(userId, patch) {
    if (!sb) { const c = LS.get(`ov_${userId}`) || {}; LS.set(`ov_${userId}`, { ...c, ...patch }); return; }
    await sb.from("staff_overrides").upsert({ user_id: userId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
  },
  async upsertEntry(e) { if (sb) await sb.from("entries").upsert(e, { onConflict: "id" }); },
  async upsertSetting(key, value) {
    if (!sb) { LS.set(`cfg_${key}`, value); return; }
    await sb.from("settings").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  },
  async upsertSession(userId, device) { if (sb) await sb.from("sessions").upsert({ user_id: userId, device, login_at: new Date().toISOString(), force_logout: false }, { onConflict: "user_id" }); },
  async checkForceLogout(userId) { if (!sb) return false; const { data } = await sb.from("sessions").select("force_logout").eq("user_id", userId).single(); return !!data?.force_logout; },
};

// ─── ICONS ────────────────────────────────────────────────────────────────────
const P = {
  home: "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
  clock: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm.5 5H11v6l5.25 3.15.75-1.23-4.5-2.67V7z",
  check: "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z",
  x: "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  users: "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z",
  chart: "M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z",
  trophy: "M19 5h-2V3H7v2H5c-1.1 0-2 .9-2 2v1c0 2.55 1.92 4.63 4.39 4.94.63 1.5 1.98 2.63 3.61 2.96V19H7v2h10v-2h-4v-3.1c1.63-.33 2.98-1.46 3.61-2.96C19.08 12.63 21 10.55 21 8V7c0-1.1-.9-2-2-2zM5 8V7h2v3.82C5.84 10.4 5 9.3 5 8zm14 0c0 1.3-.84 2.4-2 2.82V7h2v1z",
  star: "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z",
  bell: "M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z",
  settings: "M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z",
  plus: "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z",
  edit: "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z",
  download: "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z",
  logout: "M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z",
  eye: "M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z",
  lock: "M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z",
  person: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  calendar: "M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z",
  warning: "M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z",
  info: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z",
  filter: "M10 18h4v-2h-4v2zM3 6v2h18V6H3zm3 7h12v-2H6v2z",
  chat: "M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.17L4 17.17V4h16v12z",
  send: "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z",
  shield: "M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z",
};
const Ic = ({ n, s = 18 }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="currentColor" style={{ display:"inline-block", verticalAlign:"middle", flexShrink:0 }}>
    <path d={P[n] || P.info} />
  </svg>
);

// ─── STATUS BADGE ─────────────────────────────────────────────────────────────
const SM = {
  draft:              { bg:"#f3f4f6", c:"#374151", l:"Draft" },
  pending:            { bg:"#fef3c7", c:"#92400e", l:"Pending" },
  pending_admin:      { bg:"#ede9fe", c:"#7c3aed", l:"Awaiting Admin" },
  approved:           { bg:"#d1fae5", c:"#065f46", l:"Approved" },
  approved_correction:{ bg:"#dbeafe", c:"#1e40af", l:"Approved w/Note" },
  rejected:           { bg:"#fee2e2", c:"#991b1b", l:"Rejected" },
};
const SB = ({ s }) => { const v = SM[s] || SM.draft; return <span style={{ background:v.bg, color:v.c, fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:20, fontFamily:"monospace", whiteSpace:"nowrap" }}>{v.l}</span>; };

// ─── MODAL ────────────────────────────────────────────────────────────────────
function Modal({ onClose, children, width = 520 }) {
  return (
    <div onClick={e => e.target === e.currentTarget && onClose()} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:9000, padding:16 }}>
      <div style={{ background:"#fff", borderRadius:16, padding:28, width:"100%", maxWidth:width, maxHeight:"92vh", overflowY:"auto", boxShadow:"0 8px 40px rgba(0,0,0,0.2)" }}>
        {children}
      </div>
    </div>
  );
}

// ─── SEARCHABLE DROPDOWN ──────────────────────────────────────────────────────
function SD({ value, onChange, options, placeholder, allowNew = false }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(value || "");
  const ref = useRef();
  const filtered = useMemo(() => options.filter(o => o.toLowerCase().includes(q.toLowerCase())).slice(0, 12), [options, q]);
  useEffect(() => { setQ(value || ""); }, [value]);
  return (
    <div ref={ref} style={{ position:"relative" }} onBlur={e => { if (!ref.current?.contains(e.relatedTarget)) setTimeout(() => setOpen(false), 150); }}>
      <input style={{ width:"100%", padding:"10px 14px", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none", boxSizing:"border-box" }}
        value={q} placeholder={placeholder} onFocus={() => setOpen(true)}
        onChange={e => { setQ(e.target.value); setOpen(true); if (allowNew) onChange(e.target.value); }} />
      {open && (filtered.length > 0 || (allowNew && q)) && (
        <div style={{ position:"absolute", top:"100%", left:0, right:0, background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:10, boxShadow:"0 8px 24px rgba(0,0,0,0.12)", zIndex:9999, maxHeight:220, overflowY:"auto", marginTop:4 }}>
          {filtered.map(o => <div key={o} tabIndex={0} style={{ padding:"9px 14px", cursor:"pointer", fontSize:14, borderBottom:"1px solid #f1f5f9" }}
            onMouseDown={() => { onChange(o); setQ(o); setOpen(false); }}
            onMouseEnter={e => e.currentTarget.style.background = "#f0fdf4"}
            onMouseLeave={e => e.currentTarget.style.background = ""}>{o}</div>)}
          {allowNew && q && !filtered.includes(q) && <div style={{ padding:"9px 14px", cursor:"pointer", fontSize:14, color:"#00a651", fontWeight:600 }} onMouseDown={() => { onChange(q); setOpen(false); }}>+ Use "{q}"</div>}
        </div>
      )}
    </div>
  );
}

// ─── MINI BAR CHART ───────────────────────────────────────────────────────────
function Bar({ data, color = "#00a651", h = 80 }) {
  if (!data?.length) return null;
  const mx = Math.max(...data.map(d => d.v), 1);
  return (
    <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:h }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
          <div title={d.v} style={{ width:"100%", background:color, borderRadius:"3px 3px 0 0", height:`${(d.v / mx) * (h - 18)}px`, minHeight:d.v ? 3 : 0, opacity:0.85 }} />
          <div style={{ fontSize:9, color:"#9ca3af", fontFamily:"monospace" }}>{d.l}</div>
        </div>
      ))}
    </div>
  );
}

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const DEFAULT_PTS = { onTimeSubmit:50, mondayBonus:20, earlyBonus:10, approvedEntry:10, approvedWithNote:5, perfectWeek:100, hoursBonus:2, streakBonus:25 };
const BADGES = [
  { id:"early_bird",    emoji:"🌅", name:"Early Bird",    desc:"Submitted Monday 3+ times" },
  { id:"consistent",   emoji:"🔥", name:"Consistent",    desc:"4 consecutive weeks submitted" },
  { id:"zero_defect",  emoji:"💎", name:"Zero Defect",   desc:"No rejections for 4 weeks" },
  { id:"top_performer",emoji:"🏆", name:"Top Performer", desc:"Most approved hours in a week" },
  { id:"speed_logger", emoji:"⚡", name:"Speed Logger",  desc:"Submitted within 2hrs of window open" },
  { id:"perfect_week", emoji:"⭐", name:"Perfect Week",  desc:"All entries approved in one week" },
  { id:"century",      emoji:"💯", name:"Century Club",  desc:"Reached 100 points" },
  { id:"mvp",          emoji:"👑", name:"MVP",           desc:"#1 on leaderboard" },
  { id:"dedicated",    emoji:"🎯", name:"Dedicated",     desc:"8+ consecutive weeks" },
];
const RC = { admin:"#7c3aed", owner:"#2563eb", staff:"#059669" };
const RL = { admin:"Super Admin", owner:"Team Lead", staff:"Staff" };
const DEFAULT_FAQ = [
  { id:"f1", q:"How do I submit my timesheet?", a:"Log your entries for the week, then click 'Submit Week'. Entries must be submitted by Tuesday 4pm WAT." },
  { id:"f2", q:"What is the weekly hours limit?", a:"Default is 45h/week. Adjusted proportionally for approved leave days and public holidays." },
  { id:"f3", q:"Can I edit an entry after submitting?", a:"Once submitted entries go to your reporting lead. If rejected, you can edit and resubmit." },
  { id:"f4", q:"How do points work?", a:"Points for on-time submission, Monday bonus, approvals, and weekly streaks. Check the Leaderboard for your standing." },
  { id:"f5", q:"What do I do if I was on leave?", a:"Use the Leave Request button on your profile to log your leave dates. Your hour cap adjusts automatically." },
  { id:"f6", q:"Who can I contact for help?", a:"Use the Messages section to contact the Admin Team directly." },
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN APP COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

// ─── SUPABASE CONFIG PANEL (rendered inside Settings) ────────────────────────
function SBConfigPanel({ toast$ }) {
  const saved = (() => { try { return JSON.parse(localStorage.getItem("dsn_sb_cfg") || "{}"); } catch { return {}; } })();
  const [url,  setUrl]  = React.useState(saved.url  || "");
  const [key,  setKey]  = React.useState(saved.key  || "");
  const [status, setStatus] = React.useState(saved.url ? "saved" : "none");
  const [testing, setTesting] = React.useState(false);

  const inp2 = { width:"100%", padding:"10px 14px", border:"1.5px solid #e2e8f0", borderRadius:10, fontSize:13, fontFamily:"inherit", outline:"none", background:"#fff", boxSizing:"border-box" };
  const btn2 = { padding:"9px 18px", borderRadius:10, border:"none", cursor:"pointer", fontFamily:"inherit", fontWeight:600, fontSize:14 };

  const save = async () => {
    if (!url.startsWith("https://") || !key.startsWith("eyJ")) {
      toast$("Invalid URL or key format", "err"); return;
    }
    localStorage.setItem("dsn_sb_cfg", JSON.stringify({ url, key }));
    sb = getSBClient();
    toast$("Supabase config saved! Testing connection...");
    await test();
  };

  const test = async () => {
    setTesting(true);
    try {
      const client = getSBClient();
      if (!client) { setStatus("none"); setTesting(false); return; }
      const { error } = await client.from("settings").select("key").limit(1);
      if (error) { setStatus("error"); toast$("Connection failed: " + error.message, "err"); }
      else { setStatus("ok"); toast$("✅ Supabase connected!"); }
    } catch (e) { setStatus("error"); toast$("Connection error: " + e.message, "err"); }
    setTesting(false);
  };

  const clear = () => {
    localStorage.removeItem("dsn_sb_cfg");
    sb = null; setUrl(""); setKey(""); setStatus("none");
    toast$("Supabase config cleared — using local storage only");
  };

  const statusBadge = { none:["#f3f4f6","#374151","Not configured"], saved:["#fef3c7","#92400e","Saved (untested)"], ok:["#d1fae5","#065f46","✅ Connected"], error:["#fee2e2","#991b1b","❌ Connection failed"] }[status] || [];

  return (
    <div style={{ background:"#fff", borderRadius:16, boxShadow:"0 2px 12px rgba(0,0,0,0.06)", border:"1px solid #e2e8f0", padding:24, marginBottom:20 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16, flexWrap:"wrap", gap:10 }}>
        <div>
          <h3 style={{ margin:"0 0 4px", fontSize:15 }}>🔌 Supabase Connection</h3>
          <p style={{ margin:0, fontSize:12, color:"#64748b" }}>Connect to Supabase for real-time sync across all devices and browsers.</p>
        </div>
        {status !== "none" && <span style={{ background:statusBadge[0], color:statusBadge[1], fontSize:12, fontWeight:700, padding:"4px 12px", borderRadius:20 }}>{statusBadge[2]}</span>}
      </div>

      <div style={{ background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:12, padding:16, marginBottom:16, fontSize:13, color:"#374151", lineHeight:1.6 }}>
        <strong>How to get your credentials:</strong><br/>
        1. Go to <a href="https://supabase.com" target="_blank" rel="noreferrer" style={{ color:"#00a651" }}>supabase.com</a> → New project<br/>
        2. Settings → API → copy <strong>Project URL</strong> and <strong>anon public</strong> key<br/>
        3. Paste below and click Save & Connect<br/>
        4. Run the SQL schema once in Supabase → SQL Editor (download button below)
      </div>

      <div style={{ marginBottom:14 }}>
        <label style={{ display:"block", marginBottom:6, fontSize:13, fontWeight:600, color:"#64748b" }}>Project URL</label>
        <input style={inp2} type="url" placeholder="https://xxxxxxxxxxxxxxxx.supabase.co" value={url} onChange={e=>setUrl(e.target.value.trim())}/>
      </div>
      <div style={{ marginBottom:18 }}>
        <label style={{ display:"block", marginBottom:6, fontSize:13, fontWeight:600, color:"#64748b" }}>Anon Public Key</label>
        <input style={inp2} type="password" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." value={key} onChange={e=>setKey(e.target.value.trim())}/>
      </div>

      <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
        <button style={{ ...btn2, background:"#00a651", color:"#fff" }} onClick={save}>💾 Save & Connect</button>
        <button style={{ ...btn2, background:"#f8fafc", color:"#1a2332", border:"1px solid #e2e8f0" }} onClick={test} disabled={testing}>{testing ? "Testing..." : "🔁 Test Connection"}</button>
        {status !== "none" && <button style={{ ...btn2, background:"#fee2e2", color:"#dc2626", fontSize:13 }} onClick={clear}>✕ Disconnect</button>}
        <a href="/supabase/schema.sql" download style={{ ...btn2, background:"#ede9fe", color:"#7c3aed", textDecoration:"none", display:"inline-flex", alignItems:"center", gap:6, fontSize:13 }}>⬇ Download Schema SQL</a>
      </div>
    </div>
  );
}

export default function App() {
  // ── THEME ─────────────────────────────────────────────────────────────────
  const [branding, setBranding] = useState(() => LS.get("branding") || { appName:"DSN Resource Hub", welcomeMsg:"Weekly Deliverables Tracker · Data Science Nigeria", primaryColor:"#00a651", secondaryColor:"#003f87", fontFamily:"'DM Sans',sans-serif" });
  const A  = branding.primaryColor;
  const A2 = branding.secondaryColor;
  const DG = "#dc2626", WN = "#d97706", MU = "#64748b", BD = "#e2e8f0", HV = "#f8fafc";
  const card = { background:"#fff", borderRadius:16, boxShadow:"0 2px 12px rgba(0,0,0,0.06)", border:`1px solid ${BD}` };
  const inp  = { width:"100%", padding:"10px 14px", border:`1.5px solid ${BD}`, borderRadius:10, fontSize:14, fontFamily:"inherit", outline:"none", background:"#fff", boxSizing:"border-box" };
  const btn  = { padding:"9px 18px", borderRadius:10, border:"none", cursor:"pointer", fontFamily:"inherit", fontWeight:600, fontSize:14 };
  const th   = { textAlign:"left", padding:"10px 14px", color:MU, fontWeight:700, fontSize:11, letterSpacing:.6, textTransform:"uppercase", borderBottom:`2px solid ${BD}`, background:HV, whiteSpace:"nowrap" };
  const td   = { padding:"11px 14px", borderBottom:`1px solid ${BD}`, color:"#1a2332", verticalAlign:"middle", fontSize:14 };
  const lbl  = { display:"block", marginBottom:6, fontSize:13, fontWeight:600, color:MU };

  // ── TOAST — declared FIRST so every hook below can safely reference it ────
  const [toast, setToast] = useState(null);
  const toast$ = useCallback((m, t = "ok") => {
    setToast({ m, t });
    setTimeout(() => setToast(null), 3500);
  }, []);

  // ── STAFF & ENTRIES ───────────────────────────────────────────────────────
  const [staff, setStaff] = useState(() => {
    const ov = LS.get("staff_overrides") || {};
    return INITIAL_STAFF.map(s => ({ ...s, ...(ov[s.id] || {}) }));
  });
  const [entries,      setEntries]      = useState(() => LS.get("entries")       || []);
  const [audit,        setAudit]        = useState(() => LS.get("audit")         || []);
  const [notifs,       setNotifs]       = useState(() => LS.get("notifs")        || []);
  const [messages,     setMessages]     = useState(() => LS.get("messages")      || []);
  const [leaveReqs,    setLeaveReqs]    = useState(() => LS.get("leave")         || []);
  const [deletedE,     setDeletedE]     = useState(() => LS.get("deleted_e")     || []);
  const [shopItems,    setShopItems]    = useState(() => LS.get("shop_items")    || []);
  const [redemptions,  setRedemptions]  = useState(() => LS.get("redemptions")   || []);
  const [hallOfFame,   setHallOfFame]   = useState(() => LS.get("hall_of_fame")  || []);
  const [delegations,  setDelegations]  = useState(() => LS.get("delegations")   || []);
  const [announcements,setAnnouncements]= useState(() => LS.get("announcements") || []);
  const [templates,    setTemplates]    = useState(() => LS.get("templates")     || []);
  const [goals,        setGoals]        = useState(() => LS.get("goals")         || {});

  // ── AUTH ──────────────────────────────────────────────────────────────────
  const [user,    setUser]    = useState(() => { const s = LS.get("session"); return s ? (INITIAL_STAFF.find(x => x.id === s.userId) || null) : null; });
  const [page,    setPage]    = useState(() => LS.get("session") ? "app" : "login");
  const [nav,     setNav]     = useState("dashboard");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPin,   setLoginPin]   = useState("");
  const [loginErr,   setLoginErr]   = useState("");
  const [loginAttempts, setLoginAttempts] = useState(() => LS.get("login_attempts") || {});

  // ── PIN MODAL ─────────────────────────────────────────────────────────────
  const [pinTarget,   setPinTarget]   = useState(null);
  const [newPin,      setNewPin]      = useState("");
  const [confirmPin,  setConfirmPin]  = useState("");
  const [showPinModal,setShowPinModal]= useState(false);

  // ── TIMESHEET ─────────────────────────────────────────────────────────────
  const curWk = useMemo(() => getCurrentWeek(), []);
  const [wk,               setWk]               = useState(curWk);
  const [showForm,         setShowForm]          = useState(false);
  const [editEntry,        setEditEntry]         = useState(null);
  const [entryForm,        setEntryForm]         = useState({ project:"", lead:"", description:"", completionDate:"", hours:"", category:"" });
  const [entryErrors,      setEntryErrors]       = useState({});
  const [showSubmitConfirm,setShowSubmitConfirm] = useState(false);
  const [resubmitNote,     setResubmitNote]      = useState("");
  const [bulkSel,          setBulkSel]           = useState([]);
  const [noWorkWeeks,      setNoWorkWeeks]       = useState(() => LS.get("no_work_weeks") || []);

  // ── APPROVALS ─────────────────────────────────────────────────────────────
  const [appTab,     setAppTab]     = useState("pending");
  const [rejId,      setRejId]      = useState(null);
  const [rejTxt,     setRejTxt]     = useState("");
  const [corId,      setCorId]      = useState(null);
  const [corTxt,     setCorTxt]     = useState("");
  const [clarifyId,  setClarifyId]  = useState(null);
  const [clarifyTxt, setClarifyTxt] = useState("");

  // ── ADMIN UI ──────────────────────────────────────────────────────────────
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [editStaff,    setEditStaff]    = useState(null);
  const [staffForm,    setStaffForm]    = useState({ name:"", email:"", department:"", jobTitle:"", role:"staff" });
  const [staffSearch,  setStaffSearch]  = useState("");
  const [ovEntry,      setOvEntry]      = useState(null);
  const [ovForm,       setOvForm]       = useState({});
  const [auditFilt,    setAuditFilt]    = useState({ user:"all", action:"all", from:"", to:"" });
  const [aTab,         setATab]         = useState("overview");
  const [cmpWks,       setCmpWks]       = useState([curWk]);
  const [anaMode,      setAnaMode]      = useState("week");
  const [anaWk,        setAnaWk]        = useState(curWk);
  const [anaMonth,     setAnaMonth]     = useState(() => new Date().toISOString().slice(0,7));
  const [anaFrom,      setAnaFrom]      = useState("");
  const [anaTo,        setAnaTo]        = useState("");
  const [dashMode,     setDashMode]     = useState("week");
  const [dashWk,       setDashWk]       = useState(curWk);
  const [dashMonth,    setDashMonth]    = useState(() => new Date().toISOString().slice(0,7));

  // ── SETTINGS ──────────────────────────────────────────────────────────────
  const [ptsCfg,         setPtsCfg]         = useState(() => LS.get("pts_cfg")        || DEFAULT_PTS);
  const [hourCaps,       setHourCaps]       = useState(() => LS.get("hour_caps")       || {});
  const [lockedWeeks,    setLockedWeeks]    = useState(() => LS.get("locked_weeks")    || []);
  const [publicHols,     setPublicHols]     = useState(() => LS.get("public_hols")     || []);
  const [approvalCfg,    setApprovalCfg]    = useState(() => LS.get("approval_cfg")    || { requireSecondLevel:false, secondLevelThreshold:20, deadlineHours:12 });
  const [entryCategories,setEntryCategories]= useState(() => LS.get("entry_cats")      || ["Project","Task","Training","Admin","Meeting","Research"]);
  const [faqItems,       setFaqItems]       = useState(() => LS.get("faq")             || DEFAULT_FAQ);
  const [idleMinutes,    setIdleMinutes]    = useState(() => LS.get("idle_minutes")    ?? 30);
  const [pinResetReqs,   setPinResetReqs]   = useState(() => LS.get("pin_reset_reqs")  || []);
  const [brandingForm,   setBrandingForm]   = useState(branding);
  const [newCatInput,    setNewCatInput]    = useState("");
  const [newHolForm,     setNewHolForm]     = useState({ name:"", date:"" });
  const [shopForm,       setShopForm]       = useState({ name:"", cost:"", description:"", emoji:"🎁" });
  const [faqOpen,        setFaqOpen]        = useState(null);

  // ── UI STATE ──────────────────────────────────────────────────────────────
  const [sidebar,      setSidebar]     = useState(true);
  const [winW,         setWinW]        = useState(() => typeof window !== "undefined" ? window.innerWidth : 1200);
  const [showNotifs,   setShowNotifs]  = useState(false);
  const [lbTab,        setLbTab]       = useState("individual");
  const [msgThread,    setMsgThread]   = useState(null);
  const [msgText,      setMsgText]     = useState("");
  const [showLeaveForm,setShowLeaveForm]= useState(false);
  const [leaveForm,    setLeaveForm]   = useState({ startDate:"", endDate:"", reason:"" });
  const [pTab,         setPTab]        = useState("overview");
  const [goalInput,    setGoalInput]   = useState("");
  const [hallConfirm,  setHallConfirm] = useState(false);
  const [isOnline,     setIsOnline]    = useState(() => typeof navigator !== "undefined" ? navigator.onLine : true);
  const [accessPrefs,  setAccessPrefs] = useState(() => LS.get("access_prefs") || { fontSize:"md", darkMode:false });

  // ── DERIVED ───────────────────────────────────────────────────────────────
  const isMobile  = winW < 768;
  const liveRole  = useMemo(() => { if (!user) return null; return staff.find(s => s.id === user.id)?.role || user.role; }, [user, staff]);
  const isAdmin   = liveRole === "admin";
  const isOwner   = ["owner","admin"].includes(liveRole);
  const myE       = useMemo(() => entries.filter(e => e.userId === user?.id && e.weekNum === wk), [entries, user, wk]);
  const submitted = myE.some(e => e.status !== "draft");
  const canLog    = !submitted && wk === curWk && !lockedWeeks.includes(wk);
  const unread    = notifs.filter(n => n.userId === user?.id && !n.read).length;
  const unreadMsg = messages.filter(m => m.threadId === user?.id && !(m.readBy||[]).includes(user?.id)).length;
  const gn        = useCallback(id => staff.find(s => s.id === id)?.name || id || "—", [staff]);

  const pending4Owner = useMemo(() => entries.filter(e => {
    if (!user) return false;
    if (isAdmin && e.status === "pending_admin") return true;
    if (e.status !== "pending") return false;
    return user.name.toLowerCase().split(" ").some(p => p.length > 2 && (e.lead||"").toLowerCase().includes(p));
  }), [entries, user, isAdmin]);

  // ─────────────────────────────────────────────────────────────────────────
  // CORE HELPERS — declared before any useEffect that references them
  // ─────────────────────────────────────────────────────────────────────────
  const addAudit = useCallback((uid2, action, tgt, detail) => {
    const e = { id:uid(), userId:uid2, action, target:tgt, detail, device:getDevice(), ts:new Date().toISOString() };
    setAudit(p => { const n = [...p, e].slice(-1000); LS.set("audit", n); return n; });
    if (sb) sb.from("audit_log").insert({ id:e.id, user_id:uid2, action, target:tgt, detail, device:e.device }).then(() => {});
  }, []);

  const addNotif = useCallback((userId, message) => {
    if (!userId) return;
    const n = { id:uid(), userId, message, read:false, createdAt:new Date().toISOString() };
    setNotifs(p => { const next = [...p, n].slice(-500); LS.set("notifs", next); return next; });
    if (sb) sb.from("notifications").insert({ id:n.id, user_id:userId, message, read:false }).then(() => {});
  }, []);

  const doLogout = useCallback((reason = "manual") => {
    if (user) addAudit(user.id, "LOGOUT", user.id, `${user.name} logged out (${reason})`);
    LS.del("session");
    if (sb && user) sb.from("sessions").delete().eq("user_id", user.id).then(() => {});
    setUser(null); setPage("login"); setLoginEmail(""); setLoginPin("");
    setNav("dashboard"); setShowNotifs(false);
  }, [user, addAudit]);

  const award = useCallback((userId, pts) => {
    setStaff(prev => prev.map(s => {
      if (s.id !== userId) return s;
      const newPts = (s.points || 0) + pts;
      const badges = [...(s.badges || [])];
      if (newPts >= 100 && !badges.includes("century")) badges.push("century");
      const patch = { points:newPts, badges };
      const ov = LS.get("staff_overrides") || {};
      ov[userId] = { ...(ov[userId]||{}), ...patch };
      LS.set("staff_overrides", ov);
      DB.upsertOverride(userId, patch);
      return { ...s, ...patch };
    }));
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // PERSIST STATE
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => { LS.set("entries",       entries);       }, [entries]);
  useEffect(() => { LS.set("notifs",        notifs);        }, [notifs]);
  useEffect(() => { LS.set("messages",      messages);      }, [messages]);
  useEffect(() => { LS.set("leave",         leaveReqs);     }, [leaveReqs]);
  useEffect(() => { LS.set("deleted_e",     deletedE);      }, [deletedE]);
  useEffect(() => { LS.set("shop_items",    shopItems);     }, [shopItems]);
  useEffect(() => { LS.set("redemptions",   redemptions);   }, [redemptions]);
  useEffect(() => { LS.set("hall_of_fame",  hallOfFame);    }, [hallOfFame]);
  useEffect(() => { LS.set("delegations",   delegations);   }, [delegations]);
  useEffect(() => { LS.set("announcements", announcements); }, [announcements]);
  useEffect(() => { LS.set("templates",     templates);     }, [templates]);
  useEffect(() => { LS.set("goals",         goals);         }, [goals]);
  useEffect(() => { LS.set("pts_cfg",       ptsCfg);        }, [ptsCfg]);
  useEffect(() => { LS.set("hour_caps",     hourCaps);      }, [hourCaps]);
  useEffect(() => { LS.set("locked_weeks",  lockedWeeks);   }, [lockedWeeks]);
  useEffect(() => { LS.set("public_hols",   publicHols);    }, [publicHols]);
  useEffect(() => { LS.set("no_work_weeks", noWorkWeeks);   }, [noWorkWeeks]);
  useEffect(() => { LS.set("approval_cfg",  approvalCfg);   }, [approvalCfg]);
  useEffect(() => { LS.set("entry_cats",    entryCategories);}, [entryCategories]);
  useEffect(() => { LS.set("faq",           faqItems);      }, [faqItems]);
  useEffect(() => { LS.set("pin_reset_reqs",pinResetReqs);  }, [pinResetReqs]);
  useEffect(() => { LS.set("access_prefs",  accessPrefs);   }, [accessPrefs]);
  useEffect(() => { LS.set("branding",      branding);      }, [branding]);

  // ─────────────────────────────────────────────────────────────────────────
  // EFFECTS — all helpers above are declared before this block
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const h = () => setWinW(window.innerWidth);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  useEffect(() => {
    const on  = () => { setIsOnline(true);  toast$("🔄 Back online","ok"); };
    const off = () => { setIsOnline(false); toast$("📴 Offline — data saved locally","err"); };
    window.addEventListener("online",  on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [toast$]);

  useEffect(() => {
    if (!user) return;
    let t;
    const reset = () => { clearTimeout(t); t = setTimeout(() => doLogout("idle"), idleMinutes * 60000); };
    ["mousemove","keydown","click","touchstart"].forEach(ev => window.addEventListener(ev, reset));
    reset();
    return () => { clearTimeout(t); ["mousemove","keydown","click","touchstart"].forEach(ev => window.removeEventListener(ev, reset)); };
  }, [user, idleMinutes, doLogout]);

  useEffect(() => {
    if (!user) return;
    const iv = setInterval(async () => {
      const forceOut = await DB.checkForceLogout(user.id);
      if (forceOut) { doLogout("force_logout"); toast$("You were logged out by an admin","err"); }
    }, 10000);
    return () => clearInterval(iv);
  }, [user, doLogout, toast$]);

  // ─────────────────────────────────────────────────────────────────────────
  // AUTH ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  const doLogin = useCallback(() => {
    setLoginErr("");
    const u = staff.find(s => s.email.toLowerCase() === loginEmail.toLowerCase().trim());
    if (!u) { setLoginErr("No account found with this email."); return; }
    if (!u.active || u.suspended) { setLoginErr("Account inactive. Contact admin."); return; }
    const attempts = loginAttempts[u.id] || { count:0, lockedUntil:0 };
    if (attempts.lockedUntil > Date.now()) { setLoginErr(`Account locked. Try again in ${Math.ceil((attempts.lockedUntil - Date.now()) / 60000)} min.`); return; }
    if (u.pin !== loginPin) {
      const count = (attempts.count || 0) + 1;
      const la = { ...loginAttempts, [u.id]: count >= 5 ? { count, lockedUntil:Date.now() + 30*60000 } : { count, lockedUntil:0 } };
      setLoginAttempts(la); LS.set("login_attempts", la);
      setLoginErr(count >= 5 ? "Account locked for 30 minutes." : `Incorrect PIN. ${5-count} attempt${5-count>1?"s":""} left.`);
      return;
    }
    const la = { ...loginAttempts, [u.id]: { count:0, lockedUntil:0 } };
    setLoginAttempts(la); LS.set("login_attempts", la);
    LS.set("session", { userId:u.id, savedAt:Date.now() });
    DB.upsertSession(u.id, getDevice());
    addAudit(u.id, "LOGIN", u.id, `${u.name} logged in`);
    setUser(u);
    if (u.mustChangePIN) { setPinTarget(u); setNewPin(""); setConfirmPin(""); setShowPinModal(true); }
    else { setPage("app"); setNav("dashboard"); }
  }, [staff, loginEmail, loginPin, loginAttempts, addAudit]);

  const doChangePin = useCallback(() => {
    if (newPin.length < 4) { toast$("PIN must be at least 4 digits","err"); return; }
    if (newPin !== confirmPin) { toast$("PINs do not match","err"); return; }
    if (newPin === "1234") { toast$("Cannot use default PIN","err"); return; }
    const tgt = pinTarget || user;
    if (!tgt) return;
    const patch = { pin:newPin, mustChangePIN:false };
    setStaff(p => p.map(s => { if (s.id !== tgt.id) return s; const ov = LS.get("staff_overrides")||{}; ov[tgt.id]={...(ov[tgt.id]||{}),...patch}; LS.set("staff_overrides",ov); DB.upsertOverride(tgt.id,patch); return {...s,...patch}; }));
    if (tgt.id === user?.id) setUser(u => ({ ...u, ...patch }));
    addAudit(tgt.id, "PIN_CHANGE", tgt.id, `PIN changed for ${tgt.name}`);
    toast$("PIN updated!");
    setShowPinModal(false); setNewPin(""); setConfirmPin(""); setPinTarget(null);
    if (page !== "app") { setPage("app"); setNav("dashboard"); }
  }, [newPin, confirmPin, pinTarget, user, addAudit, page, toast$]);

  // ─────────────────────────────────────────────────────────────────────────
  // ENTRY ACTIONS
  // ─────────────────────────────────────────────────────────────────────────
  const saveEntry = useCallback(() => {
    const errs = {};
    if (!entryForm.project.trim()) errs.project = "Required";
    if (!entryForm.lead.trim())    errs.lead    = "Required";
    if (!entryForm.description.trim()) errs.description = "Required";
    if (!entryForm.completionDate) errs.completionDate = "Required";
    if (!entryForm.hours || Number(entryForm.hours) <= 0) errs.hours = "Required";
    setEntryErrors(errs);
    if (Object.keys(errs).length) return;

    if (editEntry) {
      setEntries(p => p.map(e => {
        if (e.id !== editEntry.id) return e;
        const upd = { ...e, ...entryForm, hours:Number(entryForm.hours), status:e.status==="rejected"?"pending":e.status, updatedAt:new Date().toISOString(), resubmitNote:resubmitNote||e.resubmitNote };
        DB.upsertEntry(upd);
        return upd;
      }));
      addAudit(user.id, editEntry.status==="rejected"?"RESUBMIT":"EDIT", editEntry.id, entryForm.project);
    } else {
      const ne = { id:uid(), userId:user.id, ...entryForm, hours:Number(entryForm.hours), status:"draft", weekNum:wk, weekKey:getWeekKey(wk), createdAt:new Date().toISOString() };
      setEntries(p => [...p, ne]);
      DB.upsertEntry(ne);
      addAudit(user.id, "LOG_ENTRY", ne.id, `${ne.project} ${ne.hours}h`);
    }
    toast$(editEntry?.status === "rejected" ? "Re-submitted!" : "Entry saved!");
    setShowForm(false); setEntryForm({ project:"", lead:"", description:"", completionDate:"", hours:"", category:"" }); setEntryErrors({}); setEditEntry(null); setResubmitNote("");
  }, [entryForm, editEntry, user, wk, addAudit, resubmitNote, toast$]);

  const submitWeek = useCallback(() => {
    if (!myE.filter(e => e.status === "draft").length) { toast$("No draft entries","err"); return; }
    if (lockedWeeks.includes(wk)) { toast$("This week is locked","err"); return; }
    setShowSubmitConfirm(true);
  }, [myE, lockedWeeks, wk, toast$]);

  const confirmSubmit = useCallback(() => {
    const drafts = myE.filter(e => e.status === "draft");
    const now = new Date();
    const isMon  = now.getDay() === 1;
    const isEarly = isMon && now.getHours() < 10;
    setEntries(p => p.map(e => {
      if (!drafts.find(d => d.id === e.id)) return e;
      const upd = { ...e, status:"pending", submittedAt:now.toISOString(), isMon, isEarly };
      DB.upsertEntry(upd);
      return upd;
    }));
    let pts = ptsCfg.onTimeSubmit + (isMon ? ptsCfg.mondayBonus : 0) + (isEarly ? ptsCfg.earlyBonus : 0);
    award(user.id, pts);
    [...new Set(drafts.map(d => d.lead).filter(Boolean))].forEach(lead => {
      const lw = staff.find(s => s.name.toLowerCase().split(" ").some(p => p.length > 2 && lead.toLowerCase().includes(p)));
      if (lw) addNotif(lw.id, `📋 ${user.name} submitted ${drafts.length} entr${drafts.length>1?"ies":"y"} for ${getWeekKey(wk)}`);
    });
    addNotif(user.id, `✅ ${getWeekKey(wk)} submitted!`);
    addAudit(user.id, "SUBMIT_WEEK", `wk${wk}`, `${drafts.length} entries`);
    // Streak
    setStaff(p => p.map(s => {
      if (s.id !== user.id) return s;
      const prev = entries.some(e => e.userId === user.id && e.weekNum === wk-1 && e.status !== "draft");
      const streak = prev ? (s.streak||0)+1 : 1;
      const patch = { streak };
      const ov = LS.get("staff_overrides")||{}; ov[user.id]={...(ov[user.id]||{}),...patch}; LS.set("staff_overrides",ov);
      DB.upsertOverride(user.id, patch);
      if (streak >= 4) award(user.id, ptsCfg.streakBonus);
      return { ...s, ...patch };
    }));
    toast$("Week submitted! 🎉");
    setShowSubmitConfirm(false);
  }, [myE, user, wk, ptsCfg, staff, entries, award, addNotif, addAudit, toast$]);

  const approveEntry = useCallback((eid) => {
    const e = entries.find(x => x.id === eid); if (!e) return;
    const needs2nd = approvalCfg.requireSecondLevel && Number(e.hours) >= approvalCfg.secondLevelThreshold && !isAdmin;
    const status = needs2nd ? "pending_admin" : "approved";
    setEntries(p => p.map(x => { if (x.id !== eid) return x; const upd={...x,status,reviewedBy:user.id,reviewedAt:new Date().toISOString()}; DB.upsertEntry(upd); return upd; }));
    if (!needs2nd) { award(e.userId, ptsCfg.approvedEntry + e.hours*ptsCfg.hoursBonus); addNotif(e.userId, `✅ "${e.project}" approved (${e.weekKey})`); }
    else { addNotif(e.userId,`⏳ "${e.project}" needs admin review`); staff.filter(s=>s.role==="admin").forEach(a=>addNotif(a.id,`⚡ 2nd-level needed: ${e.project} (${e.hours}h by ${gn(e.userId)})`)); }
    addAudit(user.id, needs2nd?"APPROVE_2ND":"APPROVE", eid, e.project);
    toast$("Approved!");
  }, [entries, user, isAdmin, approvalCfg, ptsCfg, staff, award, addNotif, addAudit, gn, toast$]);

  const approveWithNote = useCallback(() => {
    if (!corTxt.trim()) { toast$("Add a correction note","err"); return; }
    const e = entries.find(x => x.id === corId); if (!e) return;
    setEntries(p => p.map(x => { if (x.id!==corId) return x; const upd={...x,status:"approved_correction",correctionNote:corTxt,reviewedBy:user.id,reviewedAt:new Date().toISOString()}; DB.upsertEntry(upd); return upd; }));
    award(e.userId, ptsCfg.approvedWithNote);
    addNotif(e.userId, `📝 "${e.project}" approved with note: ${corTxt}`);
    addAudit(user.id, "APPROVE_NOTE", corId, corTxt);
    toast$("Approved with note!"); setCorId(null); setCorTxt("");
  }, [corId, corTxt, entries, user, ptsCfg, award, addNotif, addAudit, toast$]);

  const rejectEntry = useCallback(() => {
    if (!rejTxt.trim()) { toast$("Rejection reason required","err"); return; }
    const e = entries.find(x => x.id === rejId); if (!e) return;
    setEntries(p => p.map(x => { if (x.id!==rejId) return x; const upd={...x,status:"rejected",rejectionComment:rejTxt,reviewedBy:user.id,reviewedAt:new Date().toISOString()}; DB.upsertEntry(upd); return upd; }));
    addNotif(e.userId, `❌ "${e.project}" rejected: "${rejTxt}" — please edit and resubmit.`);
    addAudit(user.id, "REJECT", rejId, rejTxt);
    toast$("Entry rejected"); setRejId(null); setRejTxt("");
  }, [rejId, rejTxt, entries, user, addNotif, addAudit, toast$]);

  const exportCSV = useCallback((data, fn) => {
    if (!data.length) { toast$("No data to export","err"); return; }
    const keys = Object.keys(data[0]);
    const csv = [keys.join(","), ...data.map(r => keys.map(k => `"${(r[k]||"").toString().replace(/"/g,"'")}"` ).join(","))].join("\n");
    const a = document.createElement("a"); a.href = "data:text/csv," + encodeURIComponent(csv); a.download = fn; a.click();
  }, [toast$]);

  const saveStaff = useCallback(() => {
    if (!staffForm.name || !staffForm.email) { toast$("Name and email required","err"); return; }
    if (!editStaff && staff.find(s => s.email.toLowerCase() === staffForm.email.toLowerCase())) { toast$("Email already exists","err"); return; }
    if (editStaff) {
      setStaff(p => p.map(s => { if (s.id!==editStaff.id) return s; const ov=LS.get("staff_overrides")||{}; ov[s.id]={...(ov[s.id]||{}),...staffForm}; LS.set("staff_overrides",ov); DB.upsertOverride(s.id,staffForm); return {...s,...staffForm}; }));
      if (user?.id === editStaff.id) setUser(u => ({ ...u, ...staffForm }));
      addAudit(user.id, "EDIT_STAFF", editStaff.id, staffForm.name);
      toast$("Staff updated!");
    } else {
      const nu = { id:`u${Date.now()}`, pin:"1234", mustChangePIN:true, active:true, suspended:false, points:0, badges:[], streak:0, ...staffForm };
      setStaff(p => [...p, nu]);
      staff.filter(s => s.role==="admin" && s.id!==user.id).forEach(a => addNotif(a.id, `👤 New staff added: ${staffForm.name} (${staffForm.role})`));
      addAudit(user.id, "ADD_STAFF", nu.id, nu.name);
      toast$("Staff added! Default PIN: 1234");
    }
    setShowAddStaff(false); setEditStaff(null); setStaffForm({ name:"",email:"",department:"",jobTitle:"",role:"staff" });
  }, [staffForm, editStaff, staff, user, addNotif, addAudit, toast$]);

  const sendMsg = useCallback(() => {
    if (!msgText.trim() || !msgThread) return;
    const m = { id:uid(), senderId:user.id, threadId:msgThread, body:msgText, readBy:[user.id], createdAt:new Date().toISOString() };
    setMessages(p => [...p, m]); setMsgText("");
    if (sb) sb.from("messages").insert(m).then(() => {});
    if (!msgThread.startsWith("group_")) addNotif(msgThread, `💬 New message from ${user.name}`);
  }, [msgText, msgThread, user, addNotif]);

  // ─────────────────────────────────────────────────────────────────────────
  // ANALYTICS DERIVED
  // ─────────────────────────────────────────────────────────────────────────
  const anaEntries = useMemo(() => entries.filter(e => {
    const d = e.createdAt || e.submittedAt;
    if (anaMode === "week")   return e.weekNum === anaWk;
    if (anaMode === "month")  return d && toYM(d) === anaMonth;
    if (anaMode === "custom" && anaFrom && anaTo) return d && d >= anaFrom && d <= anaTo+"T23:59:59";
    return true;
  }), [entries, anaMode, anaWk, anaMonth, anaFrom, anaTo]);

  const dashEntries = useMemo(() => entries.filter(e => {
    const d = e.createdAt || e.submittedAt;
    if (dashMode === "week")  return e.weekNum === dashWk;
    if (dashMode === "month") return d && toYM(d) === dashMonth;
    return true;
  }), [entries, dashMode, dashWk, dashMonth]);

  const wkE  = useCallback(wn => entries.filter(e => e.weekNum === wn), [entries]);
  const wkH  = useCallback(wn => wkE(wn).reduce((s, e) => s + Number(e.hours||0), 0), [wkE]);
  const wkAR = useCallback(wn => { const we = wkE(wn); return we.length ? Math.round(we.filter(e => ["approved","approved_correction"].includes(e.status)).length / we.length * 100) : 0; }, [wkE]);
  const board = useMemo(() => [...staff].filter(s => s.active && !s.suspended).sort((a,b) => (b.points||0)-(a.points||0)).slice(0,30), [staff]);

  // ─────────────────────────────────────────────────────────────────────────
  // SMALL REUSABLE RENDER PIECES
  // ─────────────────────────────────────────────────────────────────────────
  const Stat = ({ l, v, ic, col }) => (
    <div style={{ ...card, padding:"18px 20px", display:"flex", alignItems:"center", gap:14, flex:"1 1 160px" }}>
      <div style={{ width:44, height:44, borderRadius:12, background:col+"18", color:col, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}><Ic n={ic} s={22} /></div>
      <div><div style={{ fontSize:26, fontWeight:800, lineHeight:1 }}>{v}</div><div style={{ fontSize:12, color:MU, marginTop:4 }}>{l}</div></div>
    </div>
  );

  const PeriodFilter = ({ mode, setMode, wkVal, setWkVal, month, setMonth, simple = false }) => (
    <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap", background:HV, border:`1px solid ${BD}`, borderRadius:12, padding:"10px 14px" }}>
      <Ic n="filter" s={15} />
      <div style={{ display:"flex", gap:3, background:"#fff", border:`1px solid ${BD}`, borderRadius:8, padding:3 }}>
        {(simple ? [["week","Week"],["month","Month"]] : [["week","Week"],["month","Month"],["custom","Custom"]]).map(([m,l]) =>
          <button key={m} onClick={() => setMode(m)} style={{ padding:"4px 12px", borderRadius:6, border:"none", cursor:"pointer", fontFamily:"inherit", fontWeight:600, fontSize:12, background:mode===m?A2:"transparent", color:mode===m?"#fff":MU }}>{l}</button>
        )}
      </div>
      {mode==="week"  && <select style={{...inp,width:"auto"}} value={wkVal} onChange={e=>setWkVal(Number(e.target.value))}>{Array.from({length:curWk},(_,i)=>curWk-i).map(w=><option key={w} value={w}>{getWeekKey(w)}</option>)}</select>}
      {mode==="month" && <input style={{...inp,width:"auto"}} type="month" value={month} onChange={e=>setMonth(e.target.value)}/>}
      {mode==="custom"&& !simple && <><input style={{...inp,width:150}} type="date" value={anaFrom} onChange={e=>setAnaFrom(e.target.value)}/><span style={{fontSize:12,color:MU}}>to</span><input style={{...inp,width:150}} type="date" value={anaTo} onChange={e=>setAnaTo(e.target.value)}/></>}
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // sectionLeaveAdmin — declared BEFORE sectionStaff which calls it
  // ─────────────────────────────────────────────────────────────────────────
  const sectionLeaveAdmin = () => {
    const pending = leaveReqs.filter(l => l.status === "pending");
    if (!pending.length) return null;
    return (
      <div style={{ ...card, padding:20, marginTop:20 }}>
        <h3 style={{ margin:"0 0 14px", fontSize:15 }}>🏖️ Pending Leave Requests ({pending.length})</h3>
        {pending.map(l => {
          const u = staff.find(s => s.id === l.userId);
          return (
            <div key={l.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 0", borderBottom:`1px solid ${BD}`, flexWrap:"wrap" }}>
              <div style={{ flex:1 }}><strong>{u?.name}</strong> · {l.startDate} → {l.endDate}<br /><span style={{ fontSize:12, color:MU }}>{l.reason}</span></div>
              <div style={{ display:"flex", gap:8 }}>
                <button style={{ ...btn, background:"#d1fae5", color:"#065f46", padding:"5px 12px", fontSize:12 }} onClick={() => { setLeaveReqs(p=>p.map(x=>x.id===l.id?{...x,status:"approved",reviewedBy:user.id}:x)); addNotif(l.userId,"✅ Leave request approved"); toast$("Leave approved"); }}>Approve</button>
                <button style={{ ...btn, background:"#fee2e2", color:DG, padding:"5px 12px", fontSize:12 }} onClick={() => { setLeaveReqs(p=>p.map(x=>x.id===l.id?{...x,status:"rejected",reviewedBy:user.id}:x)); addNotif(l.userId,"❌ Leave request declined"); toast$("Leave declined"); }}>Decline</button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // SECTIONS
  // ─────────────────────────────────────────────────────────────────────────
  const sectionDash = () => {
    if (isAdmin) {
      const last5 = Array.from({length:5},(_,i)=>Math.max(1,curWk-4+i));
      const de = dashEntries;
      const tot = de.reduce((s,e)=>s+Number(e.hours||0),0);
      const ar  = de.length ? Math.round(de.filter(e=>["approved","approved_correction"].includes(e.status)).length/de.length*100) : 0;
      const pend = de.filter(e=>e.status==="pending").length;
      const act  = staff.filter(s=>s.active&&!s.suspended);
      const subbed = [...new Set(entries.filter(e=>e.weekNum===curWk&&e.status!=="draft").map(e=>e.userId))];
      const notSub = act.filter(s=>!subbed.includes(s.id));
      return (
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
            <div><h2 style={{margin:"0 0 4px",fontSize:22,fontWeight:800}}>Admin Overview</h2><p style={{color:MU,margin:0,fontSize:14}}>Data Science Nigeria · Resource Hub</p></div>
            <PeriodFilter mode={dashMode} setMode={setDashMode} wkVal={dashWk} setWkVal={setDashWk} month={dashMonth} setMonth={setDashMonth} simple />
          </div>
          {announcements.filter(a=>!a.expiresAt||new Date(a.expiresAt)>new Date()).map(a=><div key={a.id} style={{background:a.color||"#dbeafe",borderRadius:12,padding:"12px 16px",marginBottom:14,fontSize:13,fontWeight:600}}>{a.icon||"📢"} {a.text}</div>)}
          <div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:22}}>
            <Stat l="Total Hours" v={`${tot}h`} ic="clock" col={A}/>
            <Stat l="Approval Rate" v={`${ar}%`} ic="check" col="#22c55e"/>
            <Stat l="Pending Reviews" v={pend} ic="warning" col={WN}/>
            <Stat l="Active Staff" v={act.length} ic="users" col={A2}/>
            <Stat l="Not Submitted" v={notSub.length} ic="x" col={DG}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:18}}>
            <div style={{...card,padding:22}}><h3 style={{margin:"0 0 14px",fontSize:15}}>Hours — Last 5 Weeks</h3><Bar data={last5.map(w=>({l:`W${w}`,v:wkH(w)}))} color={A} h={90}/></div>
            <div style={{...card,padding:22}}>
              <h3 style={{margin:"0 0 14px",fontSize:15,color:notSub.length?DG:"#1a2332"}}>Not Submitted This Week ({notSub.length})</h3>
              {notSub.length===0?<p style={{color:"#22c55e",fontWeight:600,margin:0}}>✅ All staff submitted!</p>
                :<div style={{maxHeight:180,overflowY:"auto"}}>{notSub.slice(0,8).map(u=><div key={u.id} style={{display:"flex",alignItems:"center",gap:8,padding:"5px 0",borderBottom:`1px solid ${BD}`,fontSize:13}}><div style={{width:28,height:28,borderRadius:"50%",background:DG+"20",color:DG,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700}}>{u.name[0]}</div><div><div style={{fontWeight:600}}>{u.name}</div><div style={{fontSize:11,color:MU}}>{u.department}</div></div></div>)}{notSub.length>8&&<div style={{fontSize:12,color:MU,padding:"6px 0"}}>+{notSub.length-8} more</div>}</div>}
            </div>
          </div>
        </div>
      );
    }
    // Staff dashboard
    const me = staff.find(s=>s.id===user.id);
    const rank = board.findIndex(s=>s.id===user.id)+1;
    const myGoal = goals[user.id]||0;
    const myHours = myE.reduce((s,e)=>s+Number(e.hours||0),0);
    const carry = entries.filter(e=>e.userId===user.id&&e.weekNum<curWk&&e.status==="pending");
    return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
          <div><h2 style={{margin:"0 0 4px",fontSize:22,fontWeight:800}}>Welcome, {user.name.split(" ")[0]} 👋</h2><p style={{color:MU,margin:0,fontSize:14}}>{user.jobTitle} · {user.department}</p></div>
          <PeriodFilter mode={dashMode} setMode={setDashMode} wkVal={dashWk} setWkVal={setDashWk} month={dashMonth} setMonth={setDashMonth} simple />
        </div>
        {announcements.filter(a=>!a.expiresAt||new Date(a.expiresAt)>new Date()).map(a=><div key={a.id} style={{background:a.color||"#dbeafe",borderRadius:12,padding:"12px 16px",marginBottom:14,fontSize:13,fontWeight:600}}>{a.icon||"📢"} {a.text}</div>)}
        {carry.length>0&&<div style={{background:"#fef3c7",border:"1px solid #fbbf24",borderRadius:12,padding:"11px 16px",marginBottom:14,fontSize:13}}>⏳ <strong>{carry.length}</strong> entr{carry.length>1?"ies":"y"} from previous weeks still awaiting approval.</div>}
        <div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:20}}>
          <Stat l="My Hours (Period)" v={`${dashEntries.filter(e=>e.userId===user.id).reduce((s,e)=>s+Number(e.hours||0),0)}h`} ic="clock" col={A}/>
          <Stat l="Approved" v={dashEntries.filter(e=>e.userId===user.id&&["approved","approved_correction"].includes(e.status)).length} ic="check" col="#22c55e"/>
          <Stat l="Points" v={me?.points||0} ic="star" col="#f59e0b"/>
          <Stat l="Rank" v={rank?`#${rank}`:"—"} ic="trophy" col="#8b5cf6"/>
        </div>
        {myGoal>0&&<div style={{...card,padding:"14px 18px",marginBottom:16}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}><span style={{fontWeight:600,fontSize:14}}>Weekly Goal</span><span style={{fontFamily:"monospace",fontWeight:700,color:A}}>{myHours}h / {myGoal}h</span></div>
          <div style={{height:8,background:BD,borderRadius:4}}><div style={{height:"100%",width:`${Math.min(100,myGoal?myHours/myGoal*100:0)}%`,background:A,borderRadius:4,transition:"width .3s"}}/></div>
        </div>}
        <div style={{...card,padding:20}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <h3 style={{margin:0,fontSize:15}}>Recent Entries</h3>
            <button style={{...btn,background:A,color:"#fff",padding:"7px 14px",fontSize:13}} onClick={()=>setNav("timesheet")}>Log Hours →</button>
          </div>
          {dashEntries.filter(e=>e.userId===user.id).length===0
            ?<p style={{color:MU,textAlign:"center",padding:"20px 0",margin:0}}>No entries yet. Click Log Hours to get started.</p>
            :<table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}><thead><tr>{["Week","Project","Hours","Status"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{dashEntries.filter(e=>e.userId===user.id).slice(-6).reverse().map(e=><tr key={e.id}><td style={td}>{e.weekKey}</td><td style={td}><strong>{e.project}</strong></td><td style={{...td,fontFamily:"monospace",fontWeight:700}}>{e.hours}h</td><td style={td}><SB s={e.status}/></td></tr>)}</tbody>
            </table>}
        </div>
      </div>
    );
  };

  const sectionTimesheet = () => {
    const allWks = [...new Set([...entries.filter(e=>isAdmin||e.userId===user.id).map(e=>e.weekNum),curWk])].sort((a,b)=>b-a);
    const disp = isAdmin ? entries.filter(e=>e.weekNum===wk) : myE;
    const isNoWork = noWorkWeeks.some(n=>n.userId===user?.id&&n.weekNum===wk);
    const cap = hourCaps[user?.id]||45;
    const myHours = myE.reduce((s,e)=>s+Number(e.hours||0),0);
    return (
      <div>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12}}>
          <div><h2 style={{margin:0,fontSize:22,fontWeight:800}}>{isAdmin?"All Timesheets":"My Timesheet"}</h2><p style={{color:MU,margin:"4px 0 0",fontSize:13}}>{getWeekKey(wk)}</p></div>
          <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center"}}>
            <select style={{...inp,width:"auto"}} value={wk} onChange={e=>setWk(Number(e.target.value))}>{allWks.map(w=><option key={w} value={w}>{getWeekKey(w)}</option>)}</select>
            {canLog&&<button style={{...btn,background:A,color:"#fff",display:"flex",alignItems:"center",gap:6}} onClick={()=>{setShowForm(true);setEditEntry(null);setEntryForm({project:"",lead:"",description:"",completionDate:"",hours:"",category:""});}}><Ic n="plus" s={16}/> Add Entry</button>}
            {canLog&&myE.some(e=>e.status==="draft")&&<button style={{...btn,background:A2,color:"#fff"}} onClick={submitWeek}>Submit Week</button>}
            {isAdmin&&<button style={{...btn,background:HV,color:"#1a2332",border:`1px solid ${BD}`,display:"flex",gap:6,alignItems:"center"}} onClick={()=>exportCSV(disp.map(e=>({Week:e.weekKey,Staff:gn(e.userId),Project:e.project,Lead:e.lead,Hours:e.hours,Status:e.status})),`timesheet_w${wk}.csv`)}><Ic n="download" s={15}/> Export</button>}
          </div>
        </div>
        {!isAdmin&&!submitted&&wk===curWk&&<div style={{background:"#fef3c7",border:"1px solid #fbbf24",borderRadius:12,padding:"11px 16px",marginBottom:14,fontSize:13}}><Ic n="calendar" s={17}/> <span style={{color:"#92400e"}}><strong>Submission window:</strong> Monday 8:00 AM → Tuesday 4:00 PM WAT</span></div>}
        {!isAdmin&&submitted&&<div style={{background:"#dbeafe",border:"1px solid #93c5fd",borderRadius:12,padding:"11px 16px",marginBottom:14,fontSize:13}}><Ic n="lock" s={17}/> <span style={{color:"#1e40af"}}>Week submitted. Contact admin to make changes.</span></div>}
        {!isAdmin&&canLog&&<div style={{...card,padding:"10px 16px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center",fontSize:13,flexWrap:"wrap",gap:8}}>
          <span style={{color:MU}}>Hours this week: <strong style={{color:myHours>cap?DG:A}}>{myHours}h</strong> / {cap}h cap</span>
          {myE.length===0&&<button style={{...btn,background:HV,color:MU,border:`1px solid ${BD}`,padding:"5px 12px",fontSize:12}} onClick={()=>{setNoWorkWeeks(p=>[...p,{id:uid(),userId:user.id,weekNum:wk,weekKey:getWeekKey(wk),markedAt:new Date().toISOString()}]);toast$("Week marked as no work done");}}>🚫 No Work This Week</button>}
        </div>}
        {isNoWork&&<div style={{...card,padding:32,textAlign:"center",marginBottom:14}}><div style={{fontSize:32}}>🚫</div><div style={{fontWeight:700}}>No Work Week</div><div style={{color:MU,fontSize:13}}>This week was marked as no work done.</div></div>}
        <div style={{...card,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr>{[...(isAdmin?["Staff"]:[]),"Project","Lead","Description","Due Date","Hours","Status",""].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {disp.length===0
                ?<tr><td colSpan={9} style={{...td,textAlign:"center",padding:40,color:MU}}>No entries yet{canLog?" — click 'Add Entry' to get started":""}</td></tr>
                :disp.map(e=>(
                  <tr key={e.id} style={{background:e.status==="rejected"?"#fff5f5":"inherit"}}>
                    {isAdmin&&<td style={td}><strong>{gn(e.userId)}</strong></td>}
                    <td style={td}><strong>{e.project}</strong>{e.category&&<span style={{fontSize:10,background:A+"15",color:A,padding:"1px 6px",borderRadius:10,marginLeft:6}}>{e.category}</span>}</td>
                    <td style={td}>{e.lead}</td>
                    <td style={{...td,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",color:MU}}>{e.description}</td>
                    <td style={{...td,whiteSpace:"nowrap"}}>{e.completionDate?fmt(e.completionDate):"—"}</td>
                    <td style={{...td,fontFamily:"monospace",fontWeight:700}}>{e.hours}h</td>
                    <td style={td}><SB s={e.status}/>{e.correctionNote&&<div style={{fontSize:11,color:"#1e40af",marginTop:2}}>📝 {e.correctionNote}</div>}{e.rejectionComment&&<div style={{fontSize:11,color:DG,marginTop:2}}>↳ {e.rejectionComment}</div>}</td>
                    <td style={td}>
                      <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                        {e.status==="draft"&&!isAdmin&&canLog&&<>
                          <button style={{...btn,background:HV,color:"#1a2332",padding:"3px 8px",fontSize:11,border:`1px solid ${BD}`}} onClick={()=>{setEditEntry(e);setEntryForm({project:e.project,lead:e.lead,description:e.description,completionDate:e.completionDate||"",hours:e.hours,category:e.category||""});setShowForm(true);}}>Edit</button>
                          <button style={{...btn,background:"#fee2e2",color:DG,padding:"3px 8px",fontSize:11}} onClick={()=>{const del={...e,deletedAt:new Date().toISOString(),deletedBy:user.id};setDeletedE(p=>[...p,del]);setEntries(p=>p.filter(x=>x.id!==e.id));addAudit(user.id,"DELETE",e.id,"Soft deleted");toast$("Deleted (restorable 30 days)");}}>Del</button>
                        </>}
                        {e.status==="rejected"&&!isAdmin&&<button style={{...btn,background:"#fef3c7",color:"#92400e",padding:"4px 10px",fontSize:12}} onClick={()=>{setEditEntry(e);setEntryForm({project:e.project,lead:e.lead,description:e.description,completionDate:e.completionDate||"",hours:e.hours,category:e.category||""});setResubmitNote("");setShowForm(true);}}>Re-submit</button>}
                        {isAdmin&&<button style={{...btn,background:"#fef3c7",color:"#92400e",padding:"3px 8px",fontSize:11}} onClick={()=>{setOvEntry(e);setOvForm({project:e.project,lead:e.lead,hours:e.hours,description:e.description,status:e.status});}}>Override</button>}
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {/* ENTRY FORM */}
        {showForm&&<Modal onClose={()=>{setShowForm(false);setEntryErrors({});setEditEntry(null);}}>
          <h3 style={{margin:"0 0 18px",fontSize:18}}>{editEntry?.status==="rejected"?"Re-submit Entry":editEntry?"Edit Entry":"Log New Entry"}</h3>
          {editEntry?.status==="rejected"&&<div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:13,color:DG}}><strong>Rejection reason:</strong> {editEntry.rejectionComment}</div>}
          <div style={{marginBottom:14}}><label style={lbl}>Project / Task</label><SD value={entryForm.project} onChange={v=>setEntryForm(f=>({...f,project:v}))} options={PROJECT_LIST} placeholder="Search or type project..." allowNew/>{entryErrors.project&&<div style={{color:DG,fontSize:12,marginTop:4}}>{entryErrors.project}</div>}</div>
          <div style={{marginBottom:14}}><label style={lbl}>Reporting Lead</label><SD value={entryForm.lead} onChange={v=>setEntryForm(f=>({...f,lead:v}))} options={staff.filter(s=>s.active).map(s=>s.name)} placeholder="Search staff name..."/>{entryErrors.lead&&<div style={{color:DG,fontSize:12,marginTop:4}}>{entryErrors.lead}</div>}</div>
          <div style={{marginBottom:14}}><label style={lbl}>Category (optional)</label><select style={inp} value={entryForm.category} onChange={e=>setEntryForm(f=>({...f,category:e.target.value}))}><option value="">Select...</option>{entryCategories.map(c=><option key={c} value={c}>{c}</option>)}</select></div>
          <div style={{marginBottom:14}}><label style={lbl}>Task Description</label><textarea style={{...inp,height:80,resize:"vertical"}} value={entryForm.description} onChange={e=>setEntryForm(f=>({...f,description:e.target.value}))} placeholder="What did you work on?"/>{entryErrors.description&&<div style={{color:DG,fontSize:12,marginTop:4}}>{entryErrors.description}</div>}</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:14}}>
            <div><label style={lbl}>Completion Date</label><input style={inp} type="date" value={entryForm.completionDate} onChange={e=>setEntryForm(f=>({...f,completionDate:e.target.value}))}/>{entryErrors.completionDate&&<div style={{color:DG,fontSize:12,marginTop:4}}>{entryErrors.completionDate}</div>}</div>
            <div><label style={lbl}>Hours</label><input style={inp} type="number" min="0.5" step="0.5" value={entryForm.hours} onChange={e=>setEntryForm(f=>({...f,hours:e.target.value}))} placeholder="e.g. 4"/>{entryErrors.hours&&<div style={{color:DG,fontSize:12,marginTop:4}}>{entryErrors.hours}</div>}</div>
          </div>
          {editEntry?.status==="rejected"&&<div style={{marginBottom:14}}><label style={lbl}>What changed?</label><input style={inp} value={resubmitNote} onChange={e=>setResubmitNote(e.target.value)} placeholder="Briefly explain what you changed..."/></div>}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
            <button style={{...btn,background:"#ede9fe",color:"#7c3aed",border:"1px solid #c4b5fd",fontSize:13}} onClick={()=>{if(!entryForm.project)return toast$("Add a project first","err");const t={id:uid(),project:entryForm.project,lead:entryForm.lead,description:entryForm.description,hours:entryForm.hours,savedAt:new Date().toISOString()};setTemplates(p=>[...p,t]);toast$("💾 Saved as template!");}}>💾 Save as Template</button>
            <div style={{display:"flex",gap:10}}>
              <button style={{...btn,background:HV,color:"#1a2332",border:`1px solid ${BD}`}} onClick={()=>{setShowForm(false);setEntryErrors({});setEditEntry(null);}}>Cancel</button>
              <button style={{...btn,background:A,color:"#fff"}} onClick={saveEntry}>{editEntry?.status==="rejected"?"Re-submit":"Save Entry"}</button>
            </div>
          </div>
        </Modal>}
        {/* OVERRIDE MODAL */}
        {ovEntry&&<Modal onClose={()=>setOvEntry(null)} width={440}>
          <h3 style={{margin:"0 0 4px"}}>Admin Override</h3>
          <p style={{color:MU,fontSize:13,margin:"0 0 18px"}}>{gn(ovEntry.userId)} · {ovEntry.project}</p>
          {[["Project","project","text"],["Lead","lead","text"],["Hours","hours","number"],["Description","description","text"]].map(([l,k,t])=><div key={k} style={{marginBottom:12}}><label style={lbl}>{l}</label><input style={inp} type={t} value={ovForm[k]||""} onChange={e=>setOvForm(f=>({...f,[k]:e.target.value}))}/></div>)}
          <div style={{marginBottom:16}}><label style={lbl}>Status</label><select style={inp} value={ovForm.status||""} onChange={e=>setOvForm(f=>({...f,status:e.target.value}))}>{["draft","pending","approved","approved_correction","rejected"].map(s=><option key={s} value={s}>{s}</option>)}</select></div>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
            <button style={{...btn,background:HV,color:"#1a2332",border:`1px solid ${BD}`}} onClick={()=>setOvEntry(null)}>Cancel</button>
            <button style={{...btn,background:DG,color:"#fff"}} onClick={()=>{setEntries(p=>p.map(e=>{if(e.id!==ovEntry.id)return e;const hist=[...(e.editHistory||[]),{at:new Date().toISOString(),by:user.id,old:{project:e.project,lead:e.lead,hours:e.hours,status:e.status}}];const upd={...e,...ovForm,hours:Number(ovForm.hours||e.hours),editHistory:hist};DB.upsertEntry(upd);return upd;}));addAudit(user.id,"ADMIN_OVERRIDE",ovEntry.id,"Override applied");setOvEntry(null);toast$("Entry overridden");}}>Apply Override</button>
          </div>
        </Modal>}
        {/* SUBMIT CONFIRM */}
        {showSubmitConfirm&&<Modal onClose={()=>setShowSubmitConfirm(false)} width={480}>
          <h3 style={{margin:"0 0 14px"}}>Confirm Submission</h3>
          <p style={{color:MU,fontSize:14,margin:"0 0 16px"}}>Submitting <strong>{myE.filter(e=>e.status==="draft").length}</strong> entries for <strong>{getWeekKey(wk)}</strong>. This cannot be undone.</p>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13,marginBottom:18}}><thead><tr>{["Project","Lead","Hours"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{myE.filter(e=>e.status==="draft").map(e=><tr key={e.id}><td style={td}>{e.project}</td><td style={td}>{e.lead}</td><td style={{...td,fontFamily:"monospace",fontWeight:700}}>{e.hours}h</td></tr>)}</tbody></table>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><button style={{...btn,background:HV,color:"#1a2332",border:`1px solid ${BD}`}} onClick={()=>setShowSubmitConfirm(false)}>Cancel</button><button style={{...btn,background:A,color:"#fff"}} onClick={confirmSubmit}>✅ Confirm Submit</button></div>
        </Modal>}
      </div>
    );
  };

  const sectionApprovals = () => {
    const hist = entries.filter(e => {
      if (!["approved","approved_correction","rejected"].includes(e.status)) return false;
      if (isAdmin) return true;
      return user.name.toLowerCase().split(" ").some(p=>p.length>2&&(e.lead||"").toLowerCase().includes(p));
    });
    return (
      <div>
        <h2 style={{margin:"0 0 22px",fontSize:22,fontWeight:800}}>Approval Centre</h2>
        <div style={{display:"flex",gap:4,marginBottom:18,background:HV,padding:4,borderRadius:12,width:"fit-content",border:`1px solid ${BD}`}}>
          {[["pending",`Pending (${pending4Owner.length})`],["history","History"]].map(([t,l])=><button key={t} style={{...btn,padding:"7px 16px",background:appTab===t?"#fff":"transparent",boxShadow:appTab===t?"0 1px 4px rgba(0,0,0,0.08)":"none",color:appTab===t?"#1a2332":MU,fontSize:13}} onClick={()=>setAppTab(t)}>{l}</button>)}
        </div>
        {appTab==="pending"&&(pending4Owner.length===0
          ?<div style={{...card,padding:48,textAlign:"center",color:MU}}><Ic n="check" s={44}/><p style={{marginTop:14}}>No pending approvals. All caught up! 🎉</p></div>
          :<div style={{display:"flex",flexDirection:"column",gap:12}}>
            {pending4Owner.map(e=>(
              <div key={e.id} style={{...card,padding:20}}>
                <div style={{display:"flex",gap:14,alignItems:"flex-start",flexWrap:"wrap"}}>
                  <div style={{flex:1,minWidth:180}}>
                    <div style={{fontWeight:700,fontSize:15}}>{gn(e.userId)}</div>
                    <div style={{color:MU,fontSize:12}}>{staff.find(s=>s.id===e.userId)?.jobTitle}</div>
                    <div style={{marginTop:8,display:"flex",gap:16,fontSize:13,flexWrap:"wrap"}}><span><strong>Project:</strong> {e.project}</span><span><strong>Hours:</strong> {e.hours}h</span><span><strong>Week:</strong> {e.weekKey}</span></div>
                    {e.description&&<div style={{marginTop:8,fontSize:13,color:MU,background:HV,padding:"7px 10px",borderRadius:8}}>{e.description}</div>}
                    {e.resubmitNote&&<div style={{marginTop:6,fontSize:12,color:"#7c3aed",background:"#ede9fe",padding:"6px 10px",borderRadius:8}}>💬 Note: {e.resubmitNote}</div>}
                    {e.status==="pending_admin"&&<div style={{marginTop:6,fontSize:11,color:"#7c3aed",background:"#ede9fe",padding:"4px 10px",borderRadius:8,fontWeight:700}}>⚡ Awaiting admin 2nd-level approval</div>}
                  </div>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",flexShrink:0}}>
                    <button style={{...btn,background:"#d1fae5",color:"#065f46",padding:"7px 14px",fontSize:13}} onClick={()=>approveEntry(e.id)}>✓ Approve</button>
                    <button style={{...btn,background:"#dbeafe",color:"#1e40af",padding:"7px 14px",fontSize:13}} onClick={()=>{setCorId(e.id);setCorTxt("");}}>📝 With Note</button>
                    <button style={{...btn,background:"#fee2e2",color:DG,padding:"7px 14px",fontSize:13}} onClick={()=>{setRejId(e.id);setRejTxt("");}}>✕ Reject</button>
                    {isAdmin&&<button style={{...btn,background:"#fef3c7",color:"#92400e",padding:"7px 14px",fontSize:13}} onClick={()=>{setClarifyId(e.id);setClarifyTxt("");}}>❓ Clarify</button>}
                  </div>
                </div>
                {corId===e.id&&<div style={{marginTop:14,borderTop:`1px solid ${BD}`,paddingTop:14}}><label style={lbl}>Correction Note</label><input style={inp} value={corTxt} onChange={ev=>setCorTxt(ev.target.value)} placeholder="What needs correcting?"/><div style={{display:"flex",gap:8,marginTop:8}}><button style={{...btn,background:A2,color:"#fff",padding:"7px 14px",fontSize:13}} onClick={approveWithNote}>Confirm</button><button style={{...btn,background:HV,color:"#1a2332",border:`1px solid ${BD}`,padding:"7px 14px",fontSize:13}} onClick={()=>setCorId(null)}>Cancel</button></div></div>}
                {rejId===e.id&&<div style={{marginTop:14,borderTop:`1px solid ${BD}`,paddingTop:14}}><label style={lbl}>Rejection Reason</label><input style={inp} value={rejTxt} onChange={ev=>setRejTxt(ev.target.value)} placeholder="Be specific so staff knows what to fix..."/><div style={{display:"flex",gap:8,marginTop:8}}><button style={{...btn,background:DG,color:"#fff",padding:"7px 14px",fontSize:13}} onClick={rejectEntry}>Confirm Rejection</button><button style={{...btn,background:HV,color:"#1a2332",border:`1px solid ${BD}`,padding:"7px 14px",fontSize:13}} onClick={()=>setRejId(null)}>Cancel</button></div></div>}
                {clarifyId===e.id&&<div style={{marginTop:14,borderTop:`1px solid ${BD}`,paddingTop:14}}><label style={lbl}>Clarification Request</label><input style={inp} value={clarifyTxt} onChange={ev=>setClarifyTxt(ev.target.value)} placeholder="Ask the staff member for more info..."/><div style={{display:"flex",gap:8,marginTop:8}}><button style={{...btn,background:WN,color:"#fff",padding:"7px 14px",fontSize:13}} onClick={()=>{addNotif(e.userId,`❓ Clarification needed for "${e.project}": ${clarifyTxt}`);setClarifyId(null);setClarifyTxt("");toast$("Clarification sent");}}>Send</button><button style={{...btn,background:HV,color:"#1a2332",border:`1px solid ${BD}`,padding:"7px 14px",fontSize:13}} onClick={()=>setClarifyId(null)}>Cancel</button></div></div>}
              </div>
            ))}
          </div>
        )}
        {appTab==="history"&&<div style={{...card,overflow:"hidden"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Staff","Project","Hours","Week","Status","Reviewed By","When","Note"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{hist.slice().reverse().map(e=><tr key={e.id}><td style={td}><strong>{gn(e.userId)}</strong></td><td style={td}>{e.project}</td><td style={{...td,fontFamily:"monospace",fontWeight:700}}>{e.hours}h</td><td style={td}>{e.weekKey}</td><td style={td}><SB s={e.status}/></td><td style={td}>{e.reviewedBy?gn(e.reviewedBy):"—"}</td><td style={{...td,fontSize:12,color:MU}}>{fmtDT(e.reviewedAt)}</td><td style={{...td,fontSize:12,maxWidth:180,color:e.rejectionComment?DG:"#1e40af"}}>{e.correctionNote||e.rejectionComment||"—"}</td></tr>)}</tbody></table></div>}
      </div>
    );
  };

  const sectionLeaderboard = () => {
    const me = staff.find(s=>s.id===user.id);
    const rank = board.findIndex(s=>s.id===user.id)+1;
    const depts = [...new Set(staff.filter(s=>s.active&&s.department).map(s=>s.department))];
    const deptStats = depts.map(d=>{
      const mem = staff.filter(s=>s.active&&s.department===d);
      const avgPts = Math.round(mem.reduce((s,m)=>s+(m.points||0),0)/mem.length);
      const subRate = Math.round(mem.filter(m=>entries.some(e=>e.userId===m.id&&e.weekNum===curWk&&e.status!=="draft")).length/mem.length*100);
      return{name:d,avgPts,subRate,count:mem.length};
    }).sort((a,b)=>b.avgPts-a.avgPts);
    return (
      <div>
        <h2 style={{margin:"0 0 4px",fontSize:22,fontWeight:800}}>🏆 Leaderboard</h2>
        <p style={{color:MU,margin:"0 0 20px",fontSize:14}}>Points for on-time submissions, approvals, hours and consistency</p>
        <div style={{display:"flex",gap:4,marginBottom:20,background:HV,padding:4,borderRadius:12,width:"fit-content",border:`1px solid ${BD}`}}>
          {[["individual","Individual"],["dept","Departments"],["fame","Hall of Fame"],["shop","Points Shop"]].map(([t,l])=><button key={t} style={{...btn,padding:"7px 16px",background:lbTab===t?"#fff":"transparent",boxShadow:lbTab===t?"0 1px 4px rgba(0,0,0,0.08)":"none",color:lbTab===t?"#1a2332":MU,fontSize:13}} onClick={()=>setLbTab(t)}>{l}</button>)}
        </div>
        {lbTab==="individual"&&<>
          {rank>0&&<div style={{...card,padding:"13px 20px",marginBottom:18,background:"#fefce8",border:"1px solid #fbbf24",display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:22}}>⭐</span><div><strong>Your rank: #{rank}</strong> · {me?.points||0} points · 🔥 {me?.streak||0} week streak</div></div>}
          <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:28}}>
            {board.map((u,i)=>{
              const isMe=u.id===user.id;
              const medal=["🥇","🥈","🥉"][i]||`#${i+1}`;
              return(<div key={u.id} style={{...card,padding:"13px 20px",display:"flex",alignItems:"center",gap:14,background:isMe?"#f0fdf4":"#fff",border:isMe?`2px solid ${A}`:`1px solid ${BD}`}}>
                <div style={{fontSize:18,width:34,textAlign:"center",fontWeight:800}}>{medal}</div>
                <div style={{width:38,height:38,borderRadius:"50%",background:(RC[u.role]||MU)+"20",color:RC[u.role]||MU,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:15,flexShrink:0}}>{u.name[0]}</div>
                <div style={{flex:1}}><div style={{fontWeight:700}}>{u.name}{isMe?" (You)":""}</div><div style={{fontSize:12,color:MU}}>{u.jobTitle} · 🔥 {u.streak||0}wk</div>{(u.badges||[]).length>0&&<div style={{display:"flex",gap:3,marginTop:3}}>{u.badges.slice(0,5).map(bid=>{const b=BADGES.find(x=>x.id===bid);return b?<span key={bid} title={b.name} style={{fontSize:14}}>{b.emoji}</span>:null;})}</div>}</div>
                <div style={{textAlign:"right"}}><div style={{fontSize:22,fontWeight:800,color:A}}>{u.points||0}</div><div style={{fontSize:11,color:MU}}>points</div></div>
                <div style={{width:80}}><div style={{height:7,background:BD,borderRadius:4}}><div style={{height:"100%",width:`${Math.min(100,(u.points||0)/Math.max(...board.map(x=>x.points||0),1)*100)}%`,background:i===0?"#f59e0b":i===1?"#9ca3af":i===2?"#d97706":A,borderRadius:4}}/></div></div>
              </div>);
            })}
          </div>
          <div style={{...card,padding:22}}><h3 style={{margin:"0 0 16px",fontSize:15}}>🏅 Badge Gallery</h3><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:12}}>{BADGES.map(b=>{const earned=(me?.badges||[]).includes(b.id);return(<div key={b.id} style={{padding:"12px 16px",borderRadius:12,background:earned?"#f0fdf4":HV,border:`1px solid ${earned?A:BD}`,opacity:earned?1:.6}}><div style={{fontSize:22}}>{b.emoji}</div><div style={{fontWeight:700,fontSize:14,marginTop:6}}>{b.name}</div><div style={{fontSize:12,color:MU,marginTop:4}}>{b.desc}</div>{earned&&<div style={{fontSize:11,color:A,fontWeight:700,marginTop:6}}>✓ Earned</div>}</div>);})}</div></div>
        </>}
        {lbTab==="dept"&&<div style={{display:"flex",flexDirection:"column",gap:12}}>{deptStats.map((d,i)=><div key={d.name} style={{...card,padding:"16px 20px",display:"flex",alignItems:"center",gap:16}}><div style={{fontSize:22,width:36,textAlign:"center"}}>{["🥇","🥈","🥉"][i]||`#${i+1}`}</div><div style={{flex:1}}><div style={{fontWeight:700,fontSize:15}}>{d.name}</div><div style={{fontSize:12,color:MU}}>{d.count} members</div></div><div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:800,color:A}}>{d.avgPts}</div><div style={{fontSize:11,color:MU}}>avg pts</div></div><div style={{textAlign:"center"}}><div style={{fontSize:20,fontWeight:800,color:"#22c55e"}}>{d.subRate}%</div><div style={{fontSize:11,color:MU}}>submitted</div></div></div>)}</div>}
        {lbTab==="fame"&&<div style={{...card,padding:24}}>
          <h3 style={{margin:"0 0 14px",fontSize:15}}>🏆 Hall of Fame</h3>
          {hallOfFame.length===0?<p style={{color:MU}}>No entries yet. Admin saves the current top 3 here.</p>:<div style={{display:"flex",flexDirection:"column",gap:8}}>{hallOfFame.map((e,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 14px",background:HV,borderRadius:10}}><span style={{fontSize:20}}>{["🥇","🥈","🥉"][i]||"🏅"}</span><div style={{flex:1}}><div style={{fontWeight:700}}>{e.name}</div><div style={{fontSize:12,color:MU}}>{e.dept} · {e.pts} pts · {e.savedAt?.slice(0,10)}</div></div></div>)}</div>}
          {isAdmin&&<div style={{marginTop:16,display:"flex",gap:10}}>
            <button style={{...btn,background:A,color:"#fff",fontSize:13}} onClick={()=>{const top3=board.slice(0,3).map(u=>({name:u.name,dept:u.department,pts:u.points||0,savedAt:new Date().toISOString()}));setHallOfFame(top3);toast$("Hall of Fame saved!");}}>💾 Save Current Top 3</button>
            {hallOfFame.length>0&&<button style={{...btn,background:"#fee2e2",color:DG,fontSize:13}} onClick={()=>{if(window.confirm("Reset Hall of Fame?"))setHallOfFame([]);}}>Reset</button>}
          </div>}
        </div>}
        {lbTab==="shop"&&<>
          <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:14,marginBottom:16}}>
            {shopItems.filter(i=>i.active).map(item=>{
              const myPts=me?.points||0,can=myPts>=item.cost;
              return(<div key={item.id} style={{...card,padding:20}}>
                <div style={{fontSize:28,marginBottom:8}}>{item.emoji||"🎁"}</div>
                <div style={{fontWeight:700,fontSize:15,marginBottom:4}}>{item.name}</div>
                <div style={{fontSize:13,color:MU,marginBottom:12}}>{item.description}</div>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontWeight:800,color:A,fontSize:16}}>{item.cost} pts</span>
                  <button style={{...btn,background:can?A:"#e5e7eb",color:can?"#fff":MU,padding:"6px 14px",fontSize:13}} onClick={()=>{if(!can)return;const r={id:uid(),userId:user.id,itemId:item.id,itemName:item.name,cost:item.cost,status:"pending",redeemedAt:new Date().toISOString()};setRedemptions(p=>[...p,r]);staff.filter(s=>s.role==="admin").forEach(a=>addNotif(a.id,`🎁 ${user.name} redeemed "${item.name}" (${item.cost}pts)`));toast$(`Redeemed "${item.name}"! Admin will fulfil shortly.`);}}>Redeem</button>
                </div>
              </div>);
            })}
            {shopItems.filter(i=>i.active).length===0&&<p style={{color:MU}}>No rewards available yet.</p>}
          </div>
          {isAdmin&&<div style={{...card,padding:24}}>
            <h3 style={{margin:"0 0 14px",fontSize:15}}>Manage Shop</h3>
            <div style={{display:"flex",gap:10,marginBottom:14,flexWrap:"wrap"}}>
              <input style={{...inp,flex:1,minWidth:120}} placeholder="Item name" value={shopForm.name} onChange={e=>setShopForm(f=>({...f,name:e.target.value}))}/>
              <input style={{...inp,width:80}} placeholder="Cost" type="number" value={shopForm.cost} onChange={e=>setShopForm(f=>({...f,cost:e.target.value}))}/>
              <input style={{...inp,flex:2,minWidth:160}} placeholder="Description" value={shopForm.description} onChange={e=>setShopForm(f=>({...f,description:e.target.value}))}/>
              <input style={{...inp,width:60}} placeholder="🎁" value={shopForm.emoji} onChange={e=>setShopForm(f=>({...f,emoji:e.target.value}))}/>
              <button style={{...btn,background:A,color:"#fff"}} onClick={()=>{if(!shopForm.name||!shopForm.cost)return toast$("Name and cost required","err");setShopItems(p=>[...p,{id:uid(),name:shopForm.name,cost:Number(shopForm.cost),description:shopForm.description,emoji:shopForm.emoji||"🎁",active:true}]);setShopForm({name:"",cost:"",description:"",emoji:"🎁"});toast$("Item added!");}}>Add</button>
            </div>
            {shopItems.map(item=><div key={item.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${BD}`,fontSize:13}}><span style={{flex:1}}>{item.emoji} {item.name} · {item.cost}pts</span><button style={{...btn,background:item.active?"#fee2e2":"#d1fae5",color:item.active?DG:"#065f46",padding:"3px 10px",fontSize:12}} onClick={()=>setShopItems(p=>p.map(x=>x.id===item.id?{...x,active:!x.active}:x))}>{item.active?"Disable":"Enable"}</button><button style={{...btn,background:"#fee2e2",color:DG,padding:"3px 10px",fontSize:12}} onClick={()=>setShopItems(p=>p.filter(x=>x.id!==item.id))}>Del</button></div>)}
            <h3 style={{margin:"20px 0 12px",fontSize:15}}>Pending Redemptions</h3>
            {redemptions.filter(r=>r.status==="pending").length===0?<p style={{color:MU,fontSize:13}}>No pending redemptions</p>:redemptions.filter(r=>r.status==="pending").map(r=><div key={r.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${BD}`,fontSize:13}}><div style={{flex:1}}><strong>{gn(r.userId)}</strong> · {r.itemName} · {r.cost}pts<div style={{fontSize:11,color:MU}}>{r.redeemedAt?.slice(0,10)}</div></div><button style={{...btn,background:"#d1fae5",color:"#065f46",padding:"3px 10px",fontSize:12}} onClick={()=>{setRedemptions(p=>p.map(x=>x.id===r.id?{...x,status:"fulfilled"}:x));addNotif(r.userId,`🎁 Your "${r.itemName}" redemption has been fulfilled!`);toast$("Marked as fulfilled!");}}>Fulfilled</button></div>)}
          </div>}
        </>}
      </div>
    );
  };

  const sectionStaff = () => {
    const filt = staff.filter(u => !staffSearch || u.name.toLowerCase().includes(staffSearch.toLowerCase()) || u.email.toLowerCase().includes(staffSearch.toLowerCase()) || u.department.toLowerCase().includes(staffSearch.toLowerCase()));
    return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:12}}>
          <h2 style={{margin:0,fontSize:22,fontWeight:800}}>Staff Management</h2>
          <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
            <input style={{...inp,width:200}} placeholder="Search name, email, dept..." value={staffSearch} onChange={e=>setStaffSearch(e.target.value)}/>
            <button style={{...btn,background:HV,color:"#1a2332",border:`1px solid ${BD}`,display:"flex",gap:6,alignItems:"center"}} onClick={()=>exportCSV(staff.map(s=>({Name:s.name,Email:s.email,Dept:s.department,Title:s.jobTitle,Role:s.role,Points:s.points||0,Active:s.active})),"dsn_staff.csv")}><Ic n="download" s={15}/> Export</button>
            <button style={{...btn,background:A,color:"#fff",display:"flex",gap:6,alignItems:"center"}} onClick={()=>{setShowAddStaff(true);setEditStaff(null);setStaffForm({name:"",email:"",department:"",jobTitle:"",role:"staff"});}}><Ic n="plus" s={15}/> Add Staff</button>
          </div>
        </div>
        <div style={{...card,overflow:"hidden"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead><tr>{["Name","Email","Dept","Role","Pts","Streak","Status","Actions"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{filt.map(u=>(
              <tr key={u.id} style={{opacity:u.suspended?.6:1}}>
                <td style={td}><div style={{display:"flex",alignItems:"center",gap:10}}><div style={{width:32,height:32,borderRadius:"50%",background:(RC[u.role]||MU)+"20",color:RC[u.role]||MU,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:12,flexShrink:0}}>{u.name[0]}</div><div><div style={{fontWeight:600}}>{u.name}</div><div style={{fontSize:11,color:MU}}>{u.jobTitle}</div></div></div></td>
                <td style={{...td,fontFamily:"monospace",fontSize:11}}>{u.email}</td>
                <td style={{...td,fontSize:12,color:MU}}>{u.department}</td>
                <td style={td}><span style={{fontSize:11,fontWeight:700,color:RC[u.role],background:(RC[u.role]||MU)+"18",padding:"2px 8px",borderRadius:20}}>{RL[u.role]}</span></td>
                <td style={{...td,fontFamily:"monospace",fontWeight:700,color:A}}>{u.points||0}</td>
                <td style={{...td,fontFamily:"monospace"}}>🔥 {u.streak||0}</td>
                <td style={td}>{u.suspended?<span style={{background:"#fef3c7",color:"#92400e",fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20}}>Suspended</span>:u.active?<span style={{background:"#d1fae5",color:"#065f46",fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20}}>Active</span>:<span style={{background:"#fee2e2",color:"#991b1b",fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20}}>Inactive</span>}</td>
                <td style={td}><div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  <button style={{...btn,background:HV,color:"#1a2332",padding:"3px 8px",fontSize:11,border:`1px solid ${BD}`}} onClick={()=>{setEditStaff(u);setStaffForm({name:u.name,email:u.email,department:u.department,jobTitle:u.jobTitle,role:u.role});setShowAddStaff(true);}}>Edit</button>
                  <button style={{...btn,background:"#fef3c7",color:"#92400e",padding:"3px 8px",fontSize:11}} onClick={()=>{setStaff(p=>p.map(s=>s.id===u.id?{...s,suspended:!s.suspended}:s));toast$(`${u.suspended?"Unsuspended":"Suspended"} ${u.name}`);}}>{ u.suspended?"Unsuspend":"Suspend"}</button>
                  <button style={{...btn,background:"#ede9fe",color:"#7c3aed",padding:"3px 8px",fontSize:11}} onClick={()=>{setPinTarget(u);setNewPin("");setConfirmPin("");setShowPinModal(true);}}>Reset PIN</button>
                  <button style={{...btn,background:"#fee2e2",color:DG,padding:"3px 8px",fontSize:11}} onClick={()=>{if(window.confirm(`Force logout ${u.name}?`)){if(sb)sb.from("sessions").update({force_logout:true}).eq("user_id",u.id).then(()=>{});addNotif(u.id,"🔴 You have been logged out by an admin.");toast$(`Force logged out ${u.name}`);}}}>{isMobile?"Logout":"Force Out"}</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {sectionLeaveAdmin()}
        {showAddStaff&&<Modal onClose={()=>{setShowAddStaff(false);setEditStaff(null);}}>
          <h3 style={{margin:"0 0 20px"}}>{editStaff?"Edit Staff Record":"Add New Staff"}</h3>
          {[["Full Name","name","text"],["Work Email","email","email"],["Department","department","text"],["Job Title","jobTitle","text"]].map(([l,k,t])=><div key={k} style={{marginBottom:14}}><label style={lbl}>{l}</label><input style={inp} type={t} value={staffForm[k]||""} onChange={e=>setStaffForm(f=>({...f,[k]:e.target.value}))}/></div>)}
          <div style={{marginBottom:18}}><label style={lbl}>Role</label><select style={inp} value={staffForm.role} onChange={e=>setStaffForm(f=>({...f,role:e.target.value}))}><option value="staff">Staff</option><option value="owner">Team Lead / Owner</option><option value="admin">Super Admin</option></select></div>
          {!editStaff&&<p style={{color:MU,fontSize:12,margin:"0 0 18px"}}>Default PIN: <code>1234</code> — staff must change on first login.</p>}
          <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><button style={{...btn,background:HV,color:"#1a2332",border:`1px solid ${BD}`}} onClick={()=>{setShowAddStaff(false);setEditStaff(null);}}>Cancel</button><button style={{...btn,background:A,color:"#fff"}} onClick={saveStaff}>{editStaff?"Save Changes":"Add Staff"}</button></div>
        </Modal>}
      </div>
    );
  };

  const sectionAnalytics = () => {
    const ae = anaEntries;
    const last5 = Array.from({length:5},(_,i)=>Math.max(1,curWk-4+i));
    const notSub = staff.filter(s=>s.active&&!s.suspended&&!entries.some(e=>e.userId===s.id&&e.weekNum===curWk&&e.status!=="draft"));
    return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:20,flexWrap:"wrap",gap:12}}>
          <h2 style={{margin:0,fontSize:22,fontWeight:800}}>Analytics & Reports</h2>
          <PeriodFilter mode={anaMode} setMode={setAnaMode} wkVal={anaWk} setWkVal={setAnaWk} month={anaMonth} setMonth={setAnaMonth}/>
        </div>
        <div style={{display:"flex",gap:4,marginBottom:22,background:HV,padding:4,borderRadius:12,width:"fit-content",border:`1px solid ${BD}`}}>
          {[["overview","Overview"],["compare","Compare"],["monthly","Monthly"],["staff","Staff Report"]].map(([t,l])=><button key={t} style={{...btn,padding:"7px 16px",background:aTab===t?"#fff":"transparent",boxShadow:aTab===t?"0 1px 4px rgba(0,0,0,0.08)":"none",color:aTab===t?"#1a2332":MU,fontSize:13}} onClick={()=>setATab(t)}>{l}</button>)}
        </div>
        {aTab==="overview"&&<div>
          <div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:20}}>
            {[["Entries",ae.length,"info",MU],["Hours",`${ae.reduce((s,e)=>s+Number(e.hours||0),0)}h`,"clock",A],["Approved",ae.filter(e=>["approved","approved_correction"].includes(e.status)).length,"check","#22c55e"],["Pending",ae.filter(e=>e.status==="pending").length,"warning",WN],["Rejected",ae.filter(e=>e.status==="rejected").length,"x",DG]].map(([l,v,ic,col])=><Stat key={l} l={l} v={v} ic={ic} col={col}/>)}
          </div>
          <div style={{...card,padding:24,marginBottom:20}}><h3 style={{margin:"0 0 14px",fontSize:15}}>Hours — Last 5 Weeks</h3><Bar data={last5.map(w=>({l:`W${w}`,v:wkH(w)}))} color={A} h={100}/></div>
          <div style={{...card,padding:24}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}><h3 style={{margin:0,fontSize:15}}>Weekly Breakdown</h3><button style={{...btn,background:HV,color:"#1a2332",border:`1px solid ${BD}`,display:"flex",gap:6,alignItems:"center",padding:"7px 14px",fontSize:13}} onClick={()=>exportCSV(ae.map(e=>({Week:e.weekKey,Staff:gn(e.userId),Project:e.project,Lead:e.lead,Hours:e.hours,Category:e.category||"",Status:e.status,Submitted:e.submittedAt||""})),`analytics_${anaMode}.csv`)}><Ic n="download" s={14}/> Export</button></div>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Week","Entries","Hours","Approved","Pending","Rejected","Rate"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{last5.map(w=>{const we=wkE(w);const ap=we.filter(e=>["approved","approved_correction"].includes(e.status)).length;return(<tr key={w}><td style={td}>{getWeekKey(w)}</td><td style={td}>{we.length}</td><td style={{...td,fontFamily:"monospace",fontWeight:700}}>{wkH(w)}h</td><td style={{...td,color:"#22c55e",fontWeight:700}}>{ap}</td><td style={{...td,color:WN,fontWeight:700}}>{we.filter(e=>e.status==="pending").length}</td><td style={{...td,color:DG,fontWeight:700}}>{we.filter(e=>e.status==="rejected").length}</td><td style={td}><div style={{display:"flex",alignItems:"center",gap:8}}><div style={{width:80,height:6,background:BD,borderRadius:3}}><div style={{height:"100%",width:`${wkAR(w)}%`,background:"#22c55e",borderRadius:3}}/></div><span style={{fontFamily:"monospace",fontSize:12}}>{wkAR(w)}%</span></div></td></tr>);})}</tbody></table>
          </div>
          {notSub.length>0&&<div style={{...card,padding:22,marginTop:20}}><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}><h3 style={{margin:0,fontSize:15,color:DG}}>Not Submitted This Week ({notSub.length})</h3><button style={{...btn,background:HV,color:"#1a2332",border:`1px solid ${BD}`,display:"flex",gap:6,alignItems:"center",padding:"7px 14px",fontSize:13}} onClick={()=>exportCSV(notSub.map(u=>({Name:u.name,Email:u.email,Dept:u.department,Role:u.role})),`missed_w${curWk}.csv`)}><Ic n="download" s={14}/> Export</button></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{notSub.map(u=><span key={u.id} style={{fontSize:12,background:"#fee2e2",color:DG,padding:"3px 10px",borderRadius:20}}>{u.name}</span>)}</div></div>}
        </div>}
        {aTab==="compare"&&<div style={{...card,padding:24}}>
          <h3 style={{margin:"0 0 16px",fontSize:15}}>Compare Up to 5 Weeks</h3>
          <div style={{display:"flex",gap:10,marginBottom:22,flexWrap:"wrap"}}>
            {cmpWks.map((w,i)=><div key={i} style={{display:"flex",gap:6,alignItems:"center"}}><select style={{...inp,width:"auto"}} value={w} onChange={ev=>setCmpWks(p=>p.map((x,j)=>j===i?Number(ev.target.value):x))}>{Array.from({length:curWk},(_,n)=>n+1).reverse().map(n=><option key={n} value={n}>{getWeekKey(n)}</option>)}</select>{cmpWks.length>1&&<button style={{...btn,background:"#fee2e2",color:DG,padding:"4px 8px",fontSize:12}} onClick={()=>setCmpWks(p=>p.filter((_,j)=>j!==i))}>×</button>}</div>)}
            {cmpWks.length<5&&<button style={{...btn,background:HV,color:"#1a2332",border:`1px solid ${BD}`}} onClick={()=>setCmpWks(p=>[...p,Math.max(1,curWk-p.length)])}>+ Add</button>}
          </div>
          <div style={{display:"grid",gridTemplateColumns:`repeat(${Math.min(cmpWks.length,3)},1fr)`,gap:14}}>
            {cmpWks.map(w=>{const we=wkE(w);const h=wkH(w);const ar=wkAR(w);return(<div key={w} style={{background:HV,borderRadius:12,padding:18,border:`1px solid ${BD}`}}><div style={{fontWeight:700,fontSize:14,marginBottom:12,color:A2}}>{getWeekKey(w)}</div>{[["Hours",`${h}h`],["Entries",we.length],["Approval Rate",`${ar}%`],["Pending",we.filter(e=>e.status==="pending").length],["Rejected",we.filter(e=>e.status==="rejected").length]].map(([l,v])=><div key={l} style={{display:"flex",justifyContent:"space-between",marginBottom:8,fontSize:13}}><span style={{color:MU}}>{l}</span><strong>{v}</strong></div>)}</div>);})}
          </div>
        </div>}
        {aTab==="monthly"&&<div style={{...card,padding:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}><h3 style={{margin:0,fontSize:15}}>Monthly Report — {anaMonth}</h3><button style={{...btn,background:HV,color:"#1a2332",border:`1px solid ${BD}`,display:"flex",gap:6,alignItems:"center",padding:"7px 14px",fontSize:13}} onClick={()=>exportCSV(ae.map(e=>({Week:e.weekKey,Staff:gn(e.userId),Project:e.project,Lead:e.lead,Hours:e.hours,Status:e.status})),"monthly_report.csv")}><Ic n="download" s={14}/> Export</button></div>
          {ae.length===0?<p style={{color:MU,textAlign:"center",padding:20}}>No entries for this period.</p>:<table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Week","Staff","Project","Lead","Hours","Status"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{ae.slice().reverse().map(e=><tr key={e.id}><td style={td}>{e.weekKey}</td><td style={td}><strong>{gn(e.userId)}</strong></td><td style={td}>{e.project}</td><td style={td}>{e.lead}</td><td style={{...td,fontFamily:"monospace",fontWeight:700}}>{e.hours}h</td><td style={td}><SB s={e.status}/></td></tr>)}</tbody></table>}
        </div>}
        {aTab==="staff"&&<div style={{...card,padding:24}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}><h3 style={{margin:0,fontSize:15}}>Staff Performance</h3><button style={{...btn,background:HV,color:"#1a2332",border:`1px solid ${BD}`,display:"flex",gap:6,alignItems:"center",padding:"7px 14px",fontSize:13}} onClick={()=>exportCSV(staff.filter(u=>u.active).map(u=>{const ue=ae.filter(e=>e.userId===u.id);return{Name:u.name,Dept:u.department,Hours:ue.reduce((s,e)=>s+Number(e.hours||0),0),Approved:ue.filter(e=>["approved","approved_correction"].includes(e.status)).length,Pending:ue.filter(e=>e.status==="pending").length,Rejected:ue.filter(e=>e.status==="rejected").length,Points:u.points||0}}),"staff_report.csv")}><Ic n="download" s={14}/> Export</button></div>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Staff","Dept","Hours","Approved","Pending","Rejected","Points","Rate"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead><tbody>{staff.filter(u=>u.active&&!u.suspended).map(u=>{const ue=ae.filter(e=>e.userId===u.id);const uh=ue.reduce((s,e)=>s+Number(e.hours||0),0);const uap=ue.filter(e=>["approved","approved_correction"].includes(e.status)).length;const rate=ue.length?Math.round(uap/ue.length*100):0;return(<tr key={u.id}><td style={td}><strong>{u.name}</strong></td><td style={{...td,fontSize:12,color:MU}}>{u.department}</td><td style={{...td,fontFamily:"monospace",fontWeight:700}}>{uh}h</td><td style={{...td,color:"#22c55e",fontWeight:700}}>{uap}</td><td style={{...td,color:WN,fontWeight:700}}>{ue.filter(e=>e.status==="pending").length}</td><td style={{...td,color:DG,fontWeight:700}}>{ue.filter(e=>e.status==="rejected").length}</td><td style={{...td,fontFamily:"monospace",fontWeight:700,color:A}}>{u.points||0}</td><td style={td}><div style={{display:"flex",alignItems:"center",gap:6}}><div style={{width:60,height:6,background:BD,borderRadius:3}}><div style={{height:"100%",width:`${rate}%`,background:rate>70?"#22c55e":rate>40?WN:DG,borderRadius:3}}/></div><span style={{fontSize:11,fontFamily:"monospace"}}>{rate}%</span></div></td></tr>);})}</tbody></table>
        </div>}
      </div>
    );
  };

  const sectionAudit = () => {
    const AC = {LOGIN:"#3b82f6",LOGOUT:"#6b7280",LOG_ENTRY:"#22c55e",EDIT:"#f59e0b",DELETE:"#ef4444",SUBMIT_WEEK:"#8b5cf6",APPROVE:"#22c55e",APPROVE_NOTE:"#3b82f6",REJECT:"#ef4444",ADD_STAFF:"#06b6d4",EDIT_STAFF:"#f59e0b",ADMIN_OVERRIDE:"#ef4444",PIN_CHANGE:"#f59e0b",RESUBMIT:"#06b6d4"};
    const filt = audit.filter(a=>{
      if(auditFilt.user!=="all"&&a.userId!==auditFilt.user)return false;
      if(auditFilt.action!=="all"&&a.action!==auditFilt.action)return false;
      if(auditFilt.from&&a.ts<auditFilt.from)return false;
      if(auditFilt.to&&a.ts>auditFilt.to+"T23:59:59")return false;
      return true;
    }).slice().reverse();
    return (
      <div>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20,flexWrap:"wrap",gap:10}}>
          <h2 style={{margin:0,fontSize:22,fontWeight:800}}>Audit Trail</h2>
          <button style={{...btn,background:HV,color:"#1a2332",border:`1px solid ${BD}`,display:"flex",gap:6,alignItems:"center"}} onClick={()=>exportCSV(filt.map(a=>({Time:a.ts,User:gn(a.userId),Action:a.action,Detail:a.detail,Device:a.device})),"audit.csv")}><Ic n="download" s={14}/> Export</button>
        </div>
        <div style={{display:"flex",gap:10,marginBottom:16,flexWrap:"wrap"}}>
          <select style={{...inp,width:"auto"}} value={auditFilt.user} onChange={e=>setAuditFilt(f=>({...f,user:e.target.value}))}><option value="all">All Staff</option>{staff.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select style={{...inp,width:"auto"}} value={auditFilt.action} onChange={e=>setAuditFilt(f=>({...f,action:e.target.value}))}><option value="all">All Actions</option>{[...new Set(audit.map(a=>a.action))].map(a=><option key={a} value={a}>{a}</option>)}</select>
          <input style={{...inp,width:150}} type="date" value={auditFilt.from} onChange={e=>setAuditFilt(f=>({...f,from:e.target.value}))}/>
          <input style={{...inp,width:150}} type="date" value={auditFilt.to} onChange={e=>setAuditFilt(f=>({...f,to:e.target.value}))}/>
          <button style={{...btn,background:HV,color:"#1a2332",border:`1px solid ${BD}`}} onClick={()=>setAuditFilt({user:"all",action:"all",from:"",to:""})}>Clear</button>
        </div>
        <div style={{...card,overflow:"hidden"}}>
          {filt.length===0?<div style={{padding:40,textAlign:"center",color:MU}}>No records found.</div>
            :<table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}><thead><tr>{["Timestamp","User","Action","Detail","Device"].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>{filt.slice(0,300).map(a=><tr key={a.id}><td style={{...td,fontFamily:"monospace",fontSize:11,whiteSpace:"nowrap"}}>{fmtDT(a.ts)}</td><td style={td}><strong>{gn(a.userId)}</strong></td><td style={td}><span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:20,background:(AC[a.action]||MU)+"20",color:AC[a.action]||MU,fontFamily:"monospace",whiteSpace:"nowrap"}}>{a.action}</span></td><td style={{...td,color:MU,maxWidth:250}}>{a.detail}</td><td style={td}><span style={{fontSize:11,padding:"2px 8px",borderRadius:20,background:a.device==="mobile"?"#fef3c7":a.device==="tablet"?"#ede9fe":"#dbeafe",color:a.device==="mobile"?"#92400e":a.device==="tablet"?"#7c3aed":"#1e40af",fontFamily:"monospace"}}>{a.device||"web"}</span></td></tr>)}</tbody>
            </table>}
        </div>
      </div>
    );
  };

  const sectionSettings = () => (
    <div>
      <h2 style={{margin:"0 0 22px",fontSize:22,fontWeight:800}}>System Settings</h2>
      <SBConfigPanel toast$={toast$} />
      {/* BRANDING */}
      <div style={{...card,padding:24,marginBottom:20}}>
        <h3 style={{margin:"0 0 16px",fontSize:15}}>🎨 Branding</h3>
        {[["App Name","appName","text"],["Welcome Message","welcomeMsg","text"],["Primary Colour","primaryColor","color"],["Secondary Colour","secondaryColor","color"]].map(([l,k,t])=><div key={k} style={{marginBottom:14}}><label style={lbl}>{l}</label><input style={t==="color"?{height:40,width:80,padding:4,border:`1px solid ${BD}`,borderRadius:8,cursor:"pointer"}:inp} type={t} value={brandingForm[k]||""} onChange={e=>setBrandingForm(f=>({...f,[k]:e.target.value}))}/></div>)}
        <button style={{...btn,background:A,color:"#fff"}} onClick={()=>{setBranding(brandingForm);DB.upsertSetting("branding",brandingForm);toast$("Branding saved!");}}>Save Branding</button>
      </div>
      {/* POINTS */}
      <div style={{...card,padding:24,marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h3 style={{margin:0,fontSize:15}}>🎮 Gamification Points</h3><button style={{...btn,background:A,color:"#fff",padding:"7px 14px",fontSize:13}} onClick={()=>{DB.upsertSetting("pts_cfg",ptsCfg);toast$("Points config saved!");}}>Save</button></div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:14}}>
          {Object.entries(ptsCfg).map(([k,v])=><div key={k}><label style={lbl}>{k.replace(/([A-Z])/g," $1").trim()}</label><input style={inp} type="number" value={v} onChange={e=>setPtsCfg(p=>({...p,[k]:Number(e.target.value)}))}/></div>)}
        </div>
      </div>
      {/* APPROVAL CONFIG */}
      <div style={{...card,padding:24,marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h3 style={{margin:0,fontSize:15}}>✅ Approval Workflow</h3><button style={{...btn,background:A,color:"#fff",padding:"7px 14px",fontSize:13}} onClick={()=>{DB.upsertSetting("approval_cfg",approvalCfg);toast$("Saved!");}}>Save</button></div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div><label style={lbl}>Deadline Hours (alert)</label><input style={inp} type="number" value={approvalCfg.deadlineHours} onChange={e=>setApprovalCfg(f=>({...f,deadlineHours:Number(e.target.value)}))}/></div>
          <div><label style={lbl}>2nd-Level Threshold (hrs)</label><input style={inp} type="number" value={approvalCfg.secondLevelThreshold} onChange={e=>setApprovalCfg(f=>({...f,secondLevelThreshold:Number(e.target.value)}))}/></div>
        </div>
        <label style={{display:"flex",alignItems:"center",gap:8,marginTop:14,cursor:"pointer",fontSize:14}}><input type="checkbox" checked={approvalCfg.requireSecondLevel} onChange={e=>setApprovalCfg(f=>({...f,requireSecondLevel:e.target.checked}))}/> Require 2nd-level admin approval above threshold</label>
      </div>
      {/* HOUR CAPS */}
      <div style={{...card,padding:24,marginBottom:20}}>
        <h3 style={{margin:"0 0 14px",fontSize:15}}>⏱️ Weekly Hour Caps</h3>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:10,maxHeight:280,overflowY:"auto"}}>
          {staff.filter(s=>s.active).map(s=><div key={s.id} style={{display:"flex",alignItems:"center",gap:10}}><span style={{flex:1,fontSize:13}}>{s.name}</span><input style={{...inp,width:70,padding:"6px 10px"}} type="number" min={1} max={100} value={hourCaps[s.id]||45} onChange={e=>setHourCaps(p=>({...p,[s.id]:Number(e.target.value)}))}/><span style={{fontSize:12,color:MU}}>h</span></div>)}
        </div>
        <button style={{...btn,background:A,color:"#fff",marginTop:14}} onClick={()=>{DB.upsertSetting("hour_caps",hourCaps);toast$("Hour caps saved!");}}>Save Hour Caps</button>
      </div>
      {/* WEEK LOCKING */}
      <div style={{...card,padding:24,marginBottom:20}}>
        <h3 style={{margin:"0 0 14px",fontSize:15}}>🔒 Week Locking</h3>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
          {lockedWeeks.map(w=><span key={w} style={{padding:"4px 12px",background:"#fee2e2",color:DG,borderRadius:20,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>{getWeekKey(w)}<button onClick={()=>setLockedWeeks(p=>p.filter(x=>x!==w))} style={{background:"none",border:"none",cursor:"pointer",color:DG,fontSize:16,padding:0,lineHeight:1}}>×</button></span>)}
          {lockedWeeks.length===0&&<span style={{color:MU,fontSize:13}}>No weeks locked</span>}
        </div>
        <div style={{display:"flex",gap:8}}>
          <select style={{...inp,width:"auto"}} id="lock-wk-sel">{Array.from({length:curWk},(_,i)=>curWk-i).map(w=><option key={w} value={w}>{getWeekKey(w)}</option>)}</select>
          <button style={{...btn,background:DG,color:"#fff"}} onClick={()=>{const w=Number(document.getElementById("lock-wk-sel").value);if(!lockedWeeks.includes(w))setLockedWeeks(p=>[...p,w]);}}>Lock Week</button>
        </div>
      </div>
      {/* PUBLIC HOLIDAYS */}
      <div style={{...card,padding:24,marginBottom:20}}>
        <h3 style={{margin:"0 0 14px",fontSize:15}}>📅 Public Holidays</h3>
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <input style={{...inp,flex:1,minWidth:140}} placeholder="Holiday name" value={newHolForm.name} onChange={e=>setNewHolForm(f=>({...f,name:e.target.value}))}/>
          <input style={{...inp,width:160}} type="date" value={newHolForm.date} onChange={e=>setNewHolForm(f=>({...f,date:e.target.value}))}/>
          <button style={{...btn,background:A,color:"#fff"}} onClick={()=>{if(!newHolForm.name||!newHolForm.date)return;setPublicHols(p=>[...p,{id:uid(),...newHolForm}]);setNewHolForm({name:"",date:""});toast$("Holiday added!");}}>Add</button>
        </div>
        {publicHols.map(h=><div key={h.id} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${BD}`,fontSize:13}}><span style={{flex:1}}>{h.name} · {h.date}</span><button style={{...btn,background:"#fee2e2",color:DG,padding:"3px 10px",fontSize:12}} onClick={()=>setPublicHols(p=>p.filter(x=>x.id!==h.id))}>Remove</button></div>)}
      </div>
      {/* ENTRY CATEGORIES */}
      <div style={{...card,padding:24,marginBottom:20}}>
        <h3 style={{margin:"0 0 14px",fontSize:15}}>🏷️ Entry Categories</h3>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
          {entryCategories.map(c=><span key={c} style={{padding:"4px 12px",background:A+"15",color:A,borderRadius:20,fontSize:13,fontWeight:600,display:"flex",alignItems:"center",gap:6}}>{c}<button onClick={()=>setEntryCategories(p=>p.filter(x=>x!==c))} style={{background:"none",border:"none",cursor:"pointer",color:MU,fontSize:16,padding:0,lineHeight:1}}>×</button></span>)}
        </div>
        <div style={{display:"flex",gap:8}}>
          <input style={{...inp,flex:1}} placeholder="New category" value={newCatInput} onChange={e=>setNewCatInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&newCatInput.trim()){setEntryCategories(p=>[...p,newCatInput.trim()]);setNewCatInput("");}}}/>
          <button style={{...btn,background:A,color:"#fff"}} onClick={()=>{if(newCatInput.trim()){setEntryCategories(p=>[...p,newCatInput.trim()]);setNewCatInput("");}}}>Add</button>
        </div>
      </div>
      {/* ANNOUNCEMENTS */}
      <div style={{...card,padding:24,marginBottom:20}}>
        <h3 style={{margin:"0 0 14px",fontSize:15}}>📢 Announcements</h3>
        <div style={{display:"flex",gap:8,marginBottom:12,flexWrap:"wrap"}}>
          <input style={{...inp,flex:2,minWidth:160}} placeholder="Announcement text" id="ann-txt"/>
          <input style={{...inp,width:80}} placeholder="🎉 icon" id="ann-ico"/>
          <input style={{...inp,width:130}} type="date" id="ann-exp"/>
          <button style={{...btn,background:A,color:"#fff"}} onClick={()=>{const t=document.getElementById("ann-txt").value.trim();if(!t)return;setAnnouncements(p=>[...p,{id:uid(),text:t,icon:document.getElementById("ann-ico").value||"📢",color:"#dbeafe",expiresAt:document.getElementById("ann-exp").value||null,createdAt:new Date().toISOString()}]);document.getElementById("ann-txt").value="";document.getElementById("ann-ico").value="";document.getElementById("ann-exp").value="";toast$("Announcement posted!");}}>Post</button>
        </div>
        {announcements.map(a=><div key={a.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${BD}`,fontSize:13}}><span style={{flex:1}}>{a.icon} {a.text}{a.expiresAt&&<span style={{fontSize:11,color:MU}}> · expires {a.expiresAt}</span>}</span><button style={{...btn,background:"#fee2e2",color:DG,padding:"3px 10px",fontSize:12}} onClick={()=>setAnnouncements(p=>p.filter(x=>x.id!==a.id))}>Remove</button></div>)}
      </div>
      {/* IDLE TIMEOUT */}
      <div style={{...card,padding:24,marginBottom:20}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}><h3 style={{margin:0,fontSize:15}}>⏱️ Idle Timeout</h3><button style={{...btn,background:A,color:"#fff",padding:"7px 14px",fontSize:13}} onClick={()=>toast$("Idle timeout updated!")}>Save</button></div>
        <div style={{display:"flex",alignItems:"center",gap:14}}><input style={{...inp,width:100}} type="number" min={1} max={120} value={idleMinutes} onChange={e=>setIdleMinutes(Number(e.target.value))}/><span style={{color:MU,fontSize:14}}>minutes until auto-logout</span></div>
        <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>{[5,15,30,60].map(m=><button key={m} style={{...btn,padding:"5px 12px",fontSize:12,background:idleMinutes===m?A:HV,color:idleMinutes===m?"#fff":"#1a2332",border:`1px solid ${idleMinutes===m?A:BD}`}} onClick={()=>setIdleMinutes(m)}>{m} min</button>)}</div>
      </div>
      {/* PIN RESET REQUESTS */}
      {pinResetReqs.filter(r=>!r.resolved).length>0&&<div style={{...card,padding:24,marginBottom:20,background:"#fef3c7",border:"1px solid #fbbf24"}}>
        <h3 style={{margin:"0 0 14px",fontSize:15,color:"#92400e"}}>🔑 PIN Reset Requests ({pinResetReqs.filter(r=>!r.resolved).length})</h3>
        {pinResetReqs.filter(r=>!r.resolved).map((r,i)=><div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #fbbf24",fontSize:13}}><div style={{flex:1}}><strong>{r.name}</strong> · {r.email}<div style={{fontSize:11,color:"#92400e"}}>{r.requestedAt?.slice(0,16)}</div></div><button style={{...btn,background:"#d1fae5",color:"#065f46",padding:"5px 12px",fontSize:12}} onClick={()=>{const u=staff.find(s=>s.id===r.userId);if(u){const patch={pin:"1234",mustChangePIN:true};setStaff(p=>p.map(s=>s.id===u.id?{...s,...patch}:s));const ov=LS.get("staff_overrides")||{};ov[u.id]={...(ov[u.id]||{}),...patch};LS.set("staff_overrides",ov);addNotif(u.id,"🔑 Your PIN has been reset to 1234. Change it on next login.");}setPinResetReqs(p=>p.map((x,j)=>j===i?{...x,resolved:true}:x));toast$(`PIN reset for ${r.name}`);}}>Reset to 1234</button></div>)}
      </div>}
      {/* FAQ EDITOR */}
      <div style={{...card,padding:24,marginBottom:20}}>
        <h3 style={{margin:"0 0 14px",fontSize:15}}>❓ FAQ Editor</h3>
        {faqItems.map((f,i)=><div key={f.id} style={{marginBottom:12,padding:12,background:HV,borderRadius:10}}>
          <input style={{...inp,marginBottom:6}} value={f.q} onChange={e=>setFaqItems(p=>p.map((x,j)=>j===i?{...x,q:e.target.value}:x))} placeholder="Question"/>
          <textarea style={{...inp,height:60,resize:"vertical"}} value={f.a} onChange={e=>setFaqItems(p=>p.map((x,j)=>j===i?{...x,a:e.target.value}:x))} placeholder="Answer"/>
          <button style={{...btn,background:"#fee2e2",color:DG,padding:"3px 10px",fontSize:12,marginTop:6}} onClick={()=>setFaqItems(p=>p.filter((_,j)=>j!==i))}>Remove</button>
        </div>)}
        <button style={{...btn,background:A,color:"#fff",fontSize:13}} onClick={()=>setFaqItems(p=>[...p,{id:uid(),q:"New question?",a:"Answer here."}])}>+ Add FAQ</button>
      </div>
      {/* DELETED ENTRIES */}
      {deletedE.filter(e=>new Date(e.deletedAt)>new Date(Date.now()-30*86400000)).length>0&&<div style={{...card,padding:24,marginBottom:20}}>
        <h3 style={{margin:"0 0 14px",fontSize:15}}>🗑️ Restorable Entries (within 30 days)</h3>
        {deletedE.filter(e=>new Date(e.deletedAt)>new Date(Date.now()-30*86400000)).map(e=><div key={e.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px solid ${BD}`,fontSize:13}}><div style={{flex:1}}><strong>{gn(e.userId)}</strong> · {e.project} · {e.hours}h<div style={{fontSize:11,color:MU}}>Deleted {e.deletedAt?.slice(0,10)}</div></div><button style={{...btn,background:"#d1fae5",color:"#065f46",padding:"5px 12px",fontSize:12}} onClick={()=>{setEntries(p=>[...p,{...e,deletedAt:undefined,deletedBy:undefined}]);setDeletedE(p=>p.filter(x=>x.id!==e.id));toast$("Entry restored!");}}>Restore</button></div>)}
      </div>}
    </div>
  );

  const sectionProfile = () => {
    const me = staff.find(s=>s.id===user.id);
    const myEntries = entries.filter(e=>e.userId===user.id);
    const myGoal = goals[user.id]||0;
    return (
      <div>
        <h2 style={{margin:"0 0 22px",fontSize:22,fontWeight:800}}>My Profile</h2>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
          <div style={{...card,padding:24}}>
            <div style={{display:"flex",alignItems:"center",gap:16,marginBottom:20}}>
              <div style={{width:56,height:56,borderRadius:"50%",background:(RC[liveRole]||MU)+"20",color:RC[liveRole]||MU,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:24}}>{me?.name[0]}</div>
              <div><h3 style={{margin:0,fontSize:18}}>{me?.name}</h3><div style={{color:MU,fontSize:13}}>{me?.jobTitle}</div><span style={{fontSize:11,fontWeight:700,color:RC[liveRole],background:(RC[liveRole]||MU)+"18",padding:"2px 8px",borderRadius:20,marginTop:4,display:"inline-block"}}>{RL[liveRole]}</span></div>
            </div>
            {[["Department",me?.department],["Email",me?.email],["Points",me?.points||0],["Streak",`🔥 ${me?.streak||0} weeks`],["Total Entries",myEntries.length],["Approved",myEntries.filter(e=>["approved","approved_correction"].includes(e.status)).length]].map(([l,v])=><div key={l} style={{marginBottom:10,paddingBottom:10,borderBottom:`1px solid ${BD}`,display:"flex",justifyContent:"space-between"}}><span style={{fontSize:13,color:MU,fontWeight:600}}>{l}</span><span style={{fontSize:14,fontWeight:600}}>{v}</span></div>)}
          </div>
          <div>
            <div style={{...card,padding:24,marginBottom:16}}>
              <h3 style={{margin:"0 0 14px",fontSize:15}}>Change My PIN</h3>
              {[["New PIN",newPin,setNewPin],["Confirm PIN",confirmPin,setConfirmPin]].map(([l,v,sv])=><div key={l} style={{marginBottom:14}}><label style={lbl}>{l}</label><input style={inp} type="password" maxLength={8} value={v} onChange={e=>sv(e.target.value)} placeholder="Min 4 digits"/></div>)}
              <button style={{...btn,background:A,color:"#fff"}} onClick={()=>{setPinTarget(null);doChangePin();}}>Update PIN</button>
            </div>
            <div style={{...card,padding:24,marginBottom:16}}>
              <h3 style={{margin:"0 0 14px",fontSize:15}}>Weekly Goal</h3>
              <div style={{display:"flex",gap:10}}>
                <input style={{...inp,flex:1}} type="number" min={1} max={80} value={goalInput||myGoal||""} onChange={e=>setGoalInput(e.target.value)} placeholder="Target hours/week"/>
                <button style={{...btn,background:A,color:"#fff"}} onClick={()=>{if(goalInput)setGoals(p=>({...p,[user.id]:Number(goalInput)}));toast$("Goal saved!");}}>Set</button>
              </div>
            </div>
            <div style={{...card,padding:24}}>
              <h3 style={{margin:"0 0 14px",fontSize:15}}>Leave Requests</h3>
              <button style={{...btn,background:A,color:"#fff",marginBottom:12,fontSize:13}} onClick={()=>setShowLeaveForm(true)}>+ Request Leave</button>
              {leaveReqs.filter(l=>l.userId===user.id).slice(-5).reverse().map(l=><div key={l.id} style={{fontSize:13,padding:"6px 0",borderBottom:`1px solid ${BD}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}><span>{l.startDate} → {l.endDate}</span><SB s={l.status}/></div>)}
            </div>
          </div>
          <div style={{...card,padding:24,gridColumn:"1/-1"}}>
            <h3 style={{margin:"0 0 14px",fontSize:15}}>🏅 My Badges</h3>
            {(me?.badges||[]).length===0?<p style={{color:MU,fontSize:13}}>No badges yet. Submit on time and earn approvals to unlock badges!</p>:<div style={{display:"flex",gap:10,flexWrap:"wrap"}}>{(me.badges||[]).map(bid=>{const b=BADGES.find(x=>x.id===bid);return b?<div key={bid} title={b.desc} style={{background:"#fef3c7",border:"1px solid #fbbf24",borderRadius:10,padding:"8px 14px",fontSize:13,fontWeight:600}}>{b.emoji} {b.name}</div>:null;})}</div>}
          </div>
          <div style={{...card,padding:24,gridColumn:"1/-1"}}>
            <h3 style={{margin:"0 0 14px",fontSize:15}}>📋 Saved Templates</h3>
            {templates.length===0?<p style={{color:MU,fontSize:13}}>No templates yet. Use "Save as Template" when logging entries.</p>
              :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>{templates.map(t=><div key={t.id} style={{background:HV,borderRadius:10,padding:12,border:`1px solid ${BD}`}}><div style={{fontWeight:600,fontSize:13,marginBottom:4}}>{t.project}</div><div style={{fontSize:11,color:MU,marginBottom:8}}>{t.lead} · {t.hours}h</div><div style={{display:"flex",gap:6}}><button style={{...btn,background:A,color:"#fff",padding:"4px 10px",fontSize:12}} onClick={()=>{setEntryForm({project:t.project,lead:t.lead,description:t.description||"",completionDate:"",hours:t.hours||"",category:""});setEditEntry(null);setShowForm(true);setNav("timesheet");toast$("Template loaded!");}}>Use</button><button style={{...btn,background:"#fee2e2",color:DG,padding:"4px 10px",fontSize:12}} onClick={()=>setTemplates(p=>p.filter(x=>x.id!==t.id))}>Del</button></div></div>)}</div>}
          </div>
        </div>
      </div>
    );
  };

  const sectionFAQ = () => (
    <div>
      <h2 style={{margin:"0 0 22px",fontSize:22,fontWeight:800}}>Help & FAQ</h2>
      <div style={{...card,padding:24}}>
        {faqItems.map(f=>(
          <div key={f.id} style={{marginBottom:4}}>
            <button style={{width:"100%",textAlign:"left",padding:"14px 18px",background:faqOpen===f.id?A2:HV,color:faqOpen===f.id?"#fff":"#1a2332",border:`1px solid ${faqOpen===f.id?A2:BD}`,borderRadius:faqOpen===f.id?"10px 10px 0 0":10,cursor:"pointer",fontFamily:"inherit",fontWeight:600,fontSize:14,display:"flex",justifyContent:"space-between",alignItems:"center"}} onClick={()=>setFaqOpen(faqOpen===f.id?null:f.id)}>
              <span>{f.q}</span><span>{faqOpen===f.id?"▲":"▼"}</span>
            </button>
            {faqOpen===f.id&&<div style={{padding:"12px 18px",background:"#fff",border:`1px solid ${BD}`,borderRadius:"0 0 10px 10px",fontSize:14,color:MU,lineHeight:1.6}}>{f.a}</div>}
          </div>
        ))}
      </div>
    </div>
  );

  const sectionMessages = () => {
    const threads = isAdmin
      ? [{id:"group_all",name:"📢 All Staff",role:"admin"},{id:"group_owners",name:"👥 All Team Leads",role:"owner"},...staff.filter(s=>s.active&&s.id!==user.id)]
      : [{id:"group_admins",name:"📬 Admin Team",role:"admin"},...staff.filter(s=>s.role==="admin"&&s.id!==user.id)];
    return (
      <div>
        <h2 style={{margin:"0 0 22px",fontSize:22,fontWeight:800}}>Messages</h2>
        <div style={{display:"grid",gridTemplateColumns:"260px 1fr",gap:16,height:540}}>
          <div style={{...card,overflow:"auto",padding:0}}>
            {threads.map(t=>{
              const unr = messages.filter(m=>m.threadId===t.id&&!(m.readBy||[]).includes(user.id)).length;
              return(
                <div key={t.id} style={{padding:"12px 16px",cursor:"pointer",background:msgThread===t.id?A2+"15":"transparent",borderBottom:`1px solid ${BD}`,display:"flex",alignItems:"center",gap:10}} onClick={()=>{setMsgThread(t.id);setMessages(p=>p.map(m=>m.threadId===t.id?{...m,readBy:[...(m.readBy||[]),user.id]}:m));}}>
                  <div style={{width:34,height:34,borderRadius:"50%",background:(RC[t.role]||A2)+"20",color:RC[t.role]||A2,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:13,flexShrink:0}}>{t.name[0]}</div>
                  <div style={{flex:1,minWidth:0}}><div style={{fontWeight:600,fontSize:13}}>{t.name}</div><div style={{fontSize:11,color:MU,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{RL[t.role]||""}</div></div>
                  {unr>0&&<span style={{background:DG,color:"#fff",borderRadius:"50%",width:18,height:18,display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:700,flexShrink:0}}>{unr}</span>}
                </div>
              );
            })}
          </div>
          <div style={{...card,display:"flex",flexDirection:"column",overflow:"hidden"}}>
            {!msgThread
              ?<div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",color:MU,fontSize:14}}>Select a contact to start messaging</div>
              :<>
                <div style={{flex:1,overflowY:"auto",padding:16,display:"flex",flexDirection:"column",gap:8}}>
                  {messages.filter(m=>m.threadId===msgThread||m.senderId===user.id&&m.threadId===msgThread).map(m=>{
                    const isMe=m.senderId===user.id;
                    return(<div key={m.id} style={{display:"flex",justifyContent:isMe?"flex-end":"flex-start"}}>
                      <div style={{maxWidth:"70%",padding:"10px 14px",borderRadius:isMe?"16px 16px 4px 16px":"16px 16px 16px 4px",background:isMe?A:HV,color:isMe?"#fff":"#1a2332",fontSize:14}}>
                        {!isMe&&<div style={{fontSize:11,fontWeight:700,marginBottom:4,color:A}}>{gn(m.senderId)}</div>}
                        <div>{m.body}</div>
                        <div style={{fontSize:10,opacity:.7,marginTop:4,textAlign:"right"}}>{fmtDT(m.createdAt)} {isMe&&"✓✓"}</div>
                      </div>
                    </div>);
                  })}
                </div>
                <div style={{padding:12,borderTop:`1px solid ${BD}`,display:"flex",gap:8,flexShrink:0}}>
                  <input style={{...inp,flex:1}} value={msgText} onChange={e=>setMsgText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMsg()} placeholder="Type a message... (Enter to send)"/>
                  <button style={{...btn,background:A,color:"#fff",padding:"9px 14px"}} onClick={sendMsg}><Ic n="send" s={18}/></button>
                </div>
              </>}
          </div>
        </div>
      </div>
    );
  };

  const sectionOrgChart = () => {
    const depts = [...new Set(staff.filter(s=>s.active).map(s=>s.department))].sort();
    const colors = ["#dbeafe","#d1fae5","#ede9fe","#fef3c7","#fee2e2","#e0f2fe","#faf5ff","#fff7ed"];
    return (
      <div>
        <h2 style={{margin:"0 0 22px",fontSize:22,fontWeight:800}}>Org Chart</h2>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:16}}>
          {depts.map((dept,di)=>{
            const mem=staff.filter(s=>s.active&&s.department===dept);
            const leads=mem.filter(s=>["owner","admin"].includes(s.role));
            const workers=mem.filter(s=>s.role==="staff");
            return(
              <div key={dept} style={{...card,padding:20,borderTop:`4px solid ${A}`}}>
                <div style={{fontWeight:800,fontSize:15,marginBottom:12,color:A2}}>{dept}</div>
                {leads.map(l=><div key={l.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:colors[di%colors.length],borderRadius:10,marginBottom:8}}><div style={{width:30,height:30,borderRadius:"50%",background:RC[l.role]+"30",color:RC[l.role],display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:12,flexShrink:0}}>{l.name[0]}</div><div><div style={{fontWeight:700,fontSize:13}}>{l.name}</div><div style={{fontSize:11,color:MU}}>{RL[l.role]}</div></div></div>)}
                <div style={{marginLeft:16,borderLeft:`2px solid ${BD}`,paddingLeft:12}}>
                  {workers.map(w=><div key={w.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",fontSize:13}}><div style={{width:22,height:22,borderRadius:"50%",background:A+"20",color:A,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700,fontSize:10,flexShrink:0}}>{w.name[0]}</div><span>{w.name}</span></div>)}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // LOGIN PAGE
  // ─────────────────────────────────────────────────────────────────────────
  if (page === "login") return (
    <div style={{minHeight:"100vh",background:`linear-gradient(135deg,#0b1426 0%,${A2} 60%,${A} 100%)`,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:branding.fontFamily,padding:16}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box;}`}</style>
      <div style={{background:"rgba(255,255,255,0.07)",backdropFilter:"blur(24px)",border:"1px solid rgba(255,255,255,0.12)",borderRadius:24,padding:"48px 40px",width:420,maxWidth:"100%"}}>
        <div style={{textAlign:"center",marginBottom:32}}>
          <div style={{width:64,height:64,borderRadius:18,background:A,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 16px",fontSize:28}}>🌿</div>
          <h1 style={{color:"#fff",margin:0,fontSize:22,fontWeight:800}}>{branding.appName}</h1>
          <p style={{color:"#94a3b8",margin:"8px 0 0",fontSize:13}}>{branding.welcomeMsg}</p>
        </div>
        <div style={{marginBottom:14}}>
          <label style={{display:"block",marginBottom:6,fontSize:13,fontWeight:600,color:"#94a3b8"}}>Work Email</label>
          <input style={{width:"100%",padding:"10px 14px",border:"1.5px solid rgba(255,255,255,0.15)",borderRadius:10,fontSize:14,fontFamily:"inherit",outline:"none",background:"rgba(255,255,255,0.08)",color:"#fff",boxSizing:"border-box"}}
            type="email" placeholder="you@datasciencenigeria.ai" value={loginEmail} onChange={e=>setLoginEmail(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doLogin()}/>
        </div>
        <div style={{marginBottom:20}}>
          <label style={{display:"block",marginBottom:6,fontSize:13,fontWeight:600,color:"#94a3b8"}}>PIN</label>
          <input style={{width:"100%",padding:"10px 14px",border:"1.5px solid rgba(255,255,255,0.15)",borderRadius:10,fontSize:14,fontFamily:"inherit",outline:"none",background:"rgba(255,255,255,0.08)",color:"#fff",boxSizing:"border-box"}}
            type="password" placeholder="••••" maxLength={8} value={loginPin} onChange={e=>setLoginPin(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doLogin()}/>
        </div>
        {loginErr&&<div style={{background:"rgba(220,38,38,0.15)",border:"1px solid rgba(220,38,38,0.4)",color:"#fca5a5",padding:"10px 14px",borderRadius:10,fontSize:13,marginBottom:14}}>{loginErr}</div>}
        <button style={{background:A,color:"#fff",width:"100%",padding:13,borderRadius:10,border:"none",cursor:"pointer",fontFamily:"inherit",fontWeight:700,fontSize:15}} onClick={doLogin}>Sign In →</button>
        <p style={{color:"#64748b",textAlign:"center",fontSize:12,marginTop:16}}>Default PIN is <code style={{color:"#22c55e"}}>1234</code> — you'll be asked to change it on first login</p>
        <button onClick={()=>{const em=window.prompt("Enter your work email to request a PIN reset:");if(!em)return;const u=staff.find(s=>s.email.toLowerCase()===em.toLowerCase().trim());if(!u){alert("No account found with that email.");return;}setPinResetReqs(p=>[...p,{userId:u.id,name:u.name,email:u.email,requestedAt:new Date().toISOString(),resolved:false}]);alert("Reset request sent. An admin will reset your PIN shortly.");}} style={{display:"block",margin:"6px auto 0",background:"none",border:"none",color:"#64748b",cursor:"pointer",fontSize:12,textDecoration:"underline"}}>Forgot PIN? Request a reset</button>
      </div>
    </div>
  );

  // ─────────────────────────────────────────────────────────────────────────
  // APP SHELL
  // ─────────────────────────────────────────────────────────────────────────
  const navItems = [
    { id:"dashboard",  l:"Dashboard",  i:"home" },
    { id:"timesheet",  l:"My Timesheet", i:"clock" },
    ...(isOwner ? [{ id:"approvals", l:`Approvals${pending4Owner.length?` (${pending4Owner.length})`:""}`, i:"check" }] : []),
    { id:"leaderboard",l:"Leaderboard", i:"trophy" },
    { id:"messages",   l:`Messages${unreadMsg>0?` (${unreadMsg})`:""}`, i:"chat" },
    ...(isAdmin ? [
      { id:"staff",     l:"Staff",      i:"users" },
      { id:"analytics", l:"Analytics",  i:"chart" },
      { id:"orgchart",  l:"Org Chart",  i:"shield" },
      { id:"audit",     l:"Audit Trail",i:"eye" },
      { id:"settings",  l:"Settings",   i:"settings" },
    ] : []),
    { id:"profile",    l:"My Profile",  i:"person" },
    { id:"faq",        l:"Help & FAQ",  i:"info" },
  ];

  const sections = { dashboard:sectionDash, timesheet:sectionTimesheet, approvals:sectionApprovals, leaderboard:sectionLeaderboard, staff:sectionStaff, analytics:sectionAnalytics, orgchart:sectionOrgChart, audit:sectionAudit, settings:sectionSettings, profile:sectionProfile, faq:sectionFAQ, messages:sectionMessages };

  return (
    <div style={{fontFamily:branding.fontFamily||"'DM Sans',sans-serif",background:"#f0f4f8",minHeight:"100vh",display:"flex"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');*{box-sizing:border-box;}button:hover{opacity:.9;}::-webkit-scrollbar{width:5px;}::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:3px;}`}</style>

      {/* TOAST */}
      {toast&&<div style={{position:"fixed",top:20,right:20,zIndex:99999,background:toast.t==="err"?DG:"#1e293b",color:"#fff",padding:"11px 18px",borderRadius:12,boxShadow:"0 8px 30px rgba(0,0,0,.2)",fontSize:14,fontWeight:500,display:"flex",alignItems:"center",gap:10,maxWidth:360}}><Ic n={toast.t==="err"?"warning":"check"} s={16}/> {toast.m}</div>}

      {/* OFFLINE BANNER */}
      {!isOnline&&<div style={{position:"fixed",top:0,left:0,right:0,background:DG,color:"#fff",textAlign:"center",padding:6,fontSize:13,zIndex:99998}}>📴 You are offline. Changes saved locally.</div>}

      {/* SIDEBAR OVERLAY (mobile) */}
      {isMobile&&sidebar&&<div onClick={()=>setSidebar(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:999}}/>}

      {/* SIDEBAR */}
      <div style={{width:sidebar?240:58,background:"#0b1426",display:"flex",flexDirection:"column",minHeight:"100vh",transition:"width .2s",flexShrink:0,position:isMobile?"fixed":"sticky",top:0,height:"100vh",overflow:"hidden",zIndex:1000}}>
        <div style={{padding:sidebar?"18px 16px 14px":"14px 10px",borderBottom:"1px solid #1e293b",display:"flex",alignItems:"center",gap:10}}>
          {sidebar?<><div style={{width:32,height:32,borderRadius:8,background:A,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0}}>🌿</div><div style={{color:"#fff",fontWeight:800,fontSize:13,lineHeight:1.3}}>{branding.appName}</div></>
            :<div style={{width:32,height:32,borderRadius:8,background:A,display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,margin:"0 auto"}}>🌿</div>}
        </div>
        <div style={{flex:1,padding:"10px 8px",overflowY:"auto"}}>
          {navItems.map(item=>(
            <div key={item.id} style={{display:"flex",alignItems:"center",gap:10,padding:sidebar?"9px 12px":"10px",borderRadius:10,cursor:"pointer",color:nav===item.id?"#fff":"#94a3b8",background:nav===item.id?"#1e3a5f":"transparent",fontWeight:nav===item.id?600:400,fontSize:13,marginBottom:2,transition:"all .15s",justifyContent:sidebar?"flex-start":"center"}} onClick={()=>{setNav(item.id);if(isMobile)setSidebar(false);}} title={!sidebar?item.l:""}>
              <Ic n={item.i} s={17}/>{sidebar&&<span>{item.l}</span>}
            </div>
          ))}
        </div>
        <div style={{padding:"10px 8px",borderTop:"1px solid #1e293b"}}>
          {sidebar&&<div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 10px",marginBottom:4}}>
            <div style={{width:32,height:32,borderRadius:"50%",background:(RC[liveRole]||"#fff")+"30",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,flexShrink:0}}>{user?.name[0]}</div>
            <div style={{overflow:"hidden"}}><div style={{color:"#e2e8f0",fontSize:12,fontWeight:600,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{user?.name}</div><div style={{color:"#64748b",fontSize:10}}>{RL[liveRole]}</div></div>
          </div>}
          <div style={{display:"flex",alignItems:"center",gap:10,padding:sidebar?"9px 12px":"10px",borderRadius:10,cursor:"pointer",color:"#ef4444",justifyContent:sidebar?"flex-start":"center",fontSize:13}} onClick={()=>doLogout()}>
            <Ic n="logout" s={17}/>{sidebar&&<span>Sign Out</span>}
          </div>
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden",minWidth:0}}>
        {/* TOP BAR */}
        <div style={{background:"#fff",borderBottom:`1px solid ${BD}`,padding:"0 24px",height:56,display:"flex",alignItems:"center",gap:16,flexShrink:0}}>
          <button style={{border:"none",background:"none",cursor:"pointer",color:MU,display:"flex",padding:4}} onClick={()=>setSidebar(s=>!s)}><Ic n="filter" s={20}/></button>
          <div style={{fontWeight:700,fontSize:15,color:"#1a2332"}}>{navItems.find(n=>n.id===nav)?.l||"Dashboard"}</div>
          <div style={{flex:1}}/>
          {/* NOTIF BELL */}
          <div style={{position:"relative"}}>
            <button style={{border:"none",background:"none",cursor:"pointer",color:MU,display:"flex",position:"relative",padding:4}} onClick={()=>{setShowNotifs(s=>!s);if(!showNotifs)setNotifs(p=>p.map(n=>n.userId===user?.id?{...n,read:true}:n));}}>
              <Ic n="bell" s={20}/>
              {unread>0&&<span style={{position:"absolute",top:-2,right:-2,background:DG,color:"#fff",fontSize:9,fontWeight:700,width:15,height:15,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center"}}>{unread}</span>}
            </button>
            {showNotifs&&<div style={{position:"absolute",right:0,top:"120%",width:320,...card,zIndex:9999,padding:0,overflow:"hidden",maxHeight:380,overflowY:"auto"}}>
              <div style={{padding:"11px 16px",borderBottom:`1px solid ${BD}`,fontWeight:700,fontSize:14,background:HV}}>Notifications</div>
              {notifs.filter(n=>n.userId===user?.id).length===0?<div style={{padding:24,textAlign:"center",color:MU,fontSize:13}}>No notifications yet</div>:notifs.filter(n=>n.userId===user?.id).slice().reverse().map(n=><div key={n.id} style={{padding:"10px 16px",borderBottom:`1px solid ${BD}`,background:n.read?"#fff":"#f0fdf4",fontSize:13}}><div>{n.message}</div><div style={{color:MU,fontSize:11,marginTop:3}}>{fmtDT(n.createdAt)}</div></div>)}
            </div>}
          </div>
          {/* AVATAR */}
          <div style={{width:32,height:32,borderRadius:"50%",background:(RC[liveRole]||MU)+"20",color:RC[liveRole]||MU,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:13,cursor:"pointer",flexShrink:0}} onClick={()=>setNav("profile")} title="My Profile">{user?.name[0]}</div>
        </div>

        {/* PAGE CONTENT */}
        <div style={{flex:1,overflowY:"auto",padding:isMobile?16:28}} onClick={()=>showNotifs&&setShowNotifs(false)}>
          {(sections[nav]||sectionDash)()}
        </div>
      </div>

      {/* PIN CHANGE MODAL */}
      {showPinModal&&<Modal onClose={()=>setShowPinModal(false)} width={380}>
        <h3 style={{margin:"0 0 8px"}}>Set New PIN</h3>
        <p style={{color:MU,fontSize:13,margin:"0 0 18px"}}>For: <strong>{(pinTarget||user)?.name}</strong></p>
        {[["New PIN",newPin,setNewPin],["Confirm PIN",confirmPin,setConfirmPin]].map(([l,v,sv])=><div key={l} style={{marginBottom:14}}><label style={lbl}>{l}</label><input style={inp} type="password" maxLength={8} value={v} onChange={e=>sv(e.target.value)} onKeyDown={e=>e.key==="Enter"&&doChangePin()}/></div>)}
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}><button style={{...btn,background:HV,color:"#1a2332",border:`1px solid ${BD}`}} onClick={()=>setShowPinModal(false)}>Cancel</button><button style={{...btn,background:A,color:"#fff"}} onClick={doChangePin}>Set PIN</button></div>
      </Modal>}

      {/* LEAVE REQUEST MODAL */}
      {showLeaveForm&&<Modal onClose={()=>setShowLeaveForm(false)} width={440}>
        <h3 style={{margin:"0 0 18px"}}>Request Leave</h3>
        {[["Start Date","startDate","date"],["End Date","endDate","date"]].map(([l,k,t])=><div key={k} style={{marginBottom:14}}><label style={lbl}>{l}</label><input style={inp} type={t} value={leaveForm[k]} onChange={e=>setLeaveForm(f=>({...f,[k]:e.target.value}))}/></div>)}
        <div style={{marginBottom:18}}><label style={lbl}>Reason (optional)</label><textarea style={{...inp,height:80,resize:"vertical"}} value={leaveForm.reason} onChange={e=>setLeaveForm(f=>({...f,reason:e.target.value}))}/></div>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end"}}>
          <button style={{...btn,background:HV,color:"#1a2332",border:`1px solid ${BD}`}} onClick={()=>setShowLeaveForm(false)}>Cancel</button>
          <button style={{...btn,background:A,color:"#fff"}} onClick={()=>{if(!leaveForm.startDate||!leaveForm.endDate){toast$("Start and end date required","err");return;}const lr={id:uid(),userId:user.id,...leaveForm,status:"pending",createdAt:new Date().toISOString()};setLeaveReqs(p=>[...p,lr]);staff.filter(s=>s.role==="admin").forEach(a=>addNotif(a.id,`🏖️ ${user.name} requested leave: ${leaveForm.startDate} → ${leaveForm.endDate}`));setShowLeaveForm(false);setLeaveForm({startDate:"",endDate:"",reason:""});toast$("Leave request submitted!");}}>Submit</button>
        </div>
      </Modal>}
    </div>
  );
}
