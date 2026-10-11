import * as C from "./charts.js";

// ── Constants ────────────────────────────────────────────────────────

const PAGES = [
  { id: "today", title: "Today", icon: "sun" },
  { id: "sleep", title: "Sleep", icon: "moon" },
  { id: "readiness", title: "Readiness", icon: "sprout" },
  { id: "activity", title: "Activity", icon: "flame" },
  { id: "heart", title: "Heart", icon: "heart" },
  { id: "stress", title: "Stress & resilience", icon: "waves" },
  { sep: true },
  { id: "trends", title: "Trends", icon: "trend" },
  { id: "data", title: "Data", icon: "db" },
];

const RANGES = { "1W": 7, "1M": 30, "3M": 91, "6M": 182, "1Y": 365, All: 100000 };

const ACCENT = {
  Sleep: "--c-sleep", Readiness: "--c-readiness", Activity: "--c-activity",
  Heart: "--c-heart", Stress: "--c-stress", Body: "--c-body",
};

const LEVELS = ["Limited", "Adequate", "Solid", "Strong", "Exceptional"];

const ICONS = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6z"/>',
  sprout: '<path d="M12 21v-9"/><path d="M12 12c0-4.2 3-6.6 7.5-6.6 0 4.2-3 6.6-7.5 6.6z"/><path d="M12 14.5c0-3.4-2.4-5.4-6.2-5.4 0 3.4 2.4 5.4 6.2 5.4z"/>',
  flame: '<path d="M12 3c.8 3.1 5.2 5.3 5.2 10.2a5.2 5.2 0 0 1-10.4 0c0-2.6 1.4-4.2 2.6-5.2.3 1.6 1 2.6 2 3.1.5-3-1-5.6.6-8.1z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.4A4.1 4.1 0 0 1 12 7.2a4.1 4.1 0 0 1 7.5 2.4C19.5 15.4 12 20 12 20z"/>',
  waves: '<path d="M3 9.5c1.8-1.8 3.6-1.8 5.4 0s3.6 1.8 5.4 0 3.6-1.8 5.4 0"/><path d="M3 15c1.8-1.8 3.6-1.8 5.4 0s3.6 1.8 5.4 0 3.6-1.8 5.4 0"/>',
  trend: '<path d="M3.5 17.5 9 12l4 3.5 7.5-8"/><path d="M15 7.5h5.5V13"/>',
  db: '<ellipse cx="12" cy="5.5" rx="7.5" ry="2.8"/><path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13"/><path d="M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8"/>',
  sync: '<path d="M20 11.5A8 8 0 0 0 5.6 6.8L4 8.5"/><path d="M4 4v4.5h4.5"/><path d="M4 12.5a8 8 0 0 0 14.4 4.7L20 15.5"/><path d="M20 20v-4.5h-4.5"/>',
  left: '<path d="M15 18l-6-6 6-6"/>',
  right: '<path d="M9 18l6-6-6-6"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  crown: '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5z" fill="currentColor" stroke="none"/>',
  run: '<circle cx="14" cy="4.5" r="1.8"/><path d="M8 21l3-6 3 2.5V22M6.5 12.5 9 9l4 .5 2.5 3.5 3 .5"/><path d="M11 15l2-5.5"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  lungs: '<path d="M12 4v8M12 12c-1 1-2.5 1.5-3.5 1.5M12 12c1 1 2.5 1.5 3.5 1.5"/><path d="M8.5 7C6 7 4 11 4 16c0 2 1 3 2.5 3S9 18 9 16V9.5C9 8 9 7 8.5 7zM15.5 7C18 7 20 11 20 16c0 2-1 3-2.5 3S15 18 15 16V9.5C15 8 15 7 15.5 7z"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
};

const icon = (name, attrs = "") =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" ${attrs}>${ICONS[name]}</svg>`;

// ── State ────────────────────────────────────────────────────────────

const state = {
  page: "today",
  date: null,
  range: "1M",
  summary: null,
  index: new Map(),
  meta: {},
  dayCache: new Map(),
};

const store = {
  get(k, d) { try { const v = localStorage.getItem(`oura:${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`oura:${k}`, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};

// ── Utilities ────────────────────────────────────────────────────────

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1).replace(/_/g, " ") : "");

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseDay(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
const dayMs = (s) => +parseDay(s);
function addDays(s, n) {
  const d = parseDay(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}
const todayIso = () => iso(new Date());

function dateLabel(s) {
  const t = todayIso();
  if (s === t) return "Today";
  if (s === addDays(t, -1)) return "Yesterday";
  return parseDay(s).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: parseDay(s).getFullYear() === new Date().getFullYear() ? undefined : "numeric" });
}

function fmtH(h) {
  if (h == null) return "—";
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}
function fmtMin(m) {
  if (m == null) return "—";
  m = Math.round(m);
  return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} min`;
}
function clockH(h) {
  if (h == null) return "—";
  const m = Math.round(h * 60) % (24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
function num(v, dec = 0) {
  if (v == null || !isFinite(v)) return "—";
  return v.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
const signed = (v, dec = 1) => (v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(dec)}`);

function metricInfo(key) {
  return state.summary.metrics.find((m) => m.key === key);
}

/** Formatter for a metric's values (used by charts and tiles). */
function formatter(key) {
  const m = metricInfo(key) || { unit: "", decimals: 0 };
  if (m.unit === "h") return fmtH;
  if (m.unit === "clock") return clockH;
  if (m.unit === "min") return fmtMin;
  if (m.unit === "level") return (v) => LEVELS[Math.round(v) - 1] || "—";
  if (m.unit === "°C") return (v) => `${signed(v, 2)} °C`;
  const u = m.unit ? (m.unit === "%" ? "%" : ` ${m.unit}`) : "";
  return (v) => `${num(v, m.decimals)}${u}`;
}

function val(key, day = state.date) {
  const i = state.index.get(day);
  if (i == null) return null;
  return state.summary.values[key]?.[i] ?? null;
}

/** Continuous daily window ending at `end` (gaps stay null). */
function windowDays(end, n) {
  const first = state.summary.days[0];
  const out = [];
  let d = end;
  for (let k = 0; k < n && d >= first; k++) { out.push(d); d = addDays(d, -1); }
  return out.reverse();
}

function series(key, days) {
  const arr = state.summary.values[key] || [];
  return days.map((d) => { const i = state.index.get(d); return i == null ? null : arr[i] ?? null; });
}

function rolling(values, n = 7) {
  return values.map((_, i) => {
    let s = 0, c = 0;
    for (let k = Math.max(0, i - n + 1); k <= i; k++) if (values[k] != null) { s += values[k]; c++; }
    return c >= Math.min(3, n) ? s / c : null;
  });
}

function mean(values) {
  const v = values.filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function status(score) {
  if (score == null) return { cls: "neutral", word: "No data" };
  if (score >= 85) return { cls: "optimal", word: "Optimal" };
  if (score >= 70) return { cls: "good", word: "Good" };
  if (score >= 60) return { cls: "fair", word: "Fair" };
  return { cls: "attention", word: "Pay attention" };
}

function statusTag(score) {
  const s = status(score);
  if (s.cls === "neutral") return "";
  return `<span class="status ${s.cls}">${s.word}${s.cls === "optimal" ? icon("crown") : ""}</span>`;
}

function toast(msg, ms = 3200) {
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), ms);
}

async function loadDay(day) {
  if (!state.dayCache.has(day)) state.dayCache.set(day, api(`/api/day?d=${day}`));
  return state.dayCache.get(day);
}

// ── Reusable blocks ──────────────────────────────────────────────────

function contribRow(label, score, text, neutral = false) {
  const s = status(score);
  const right = text ?? s.word;
  const cls = !neutral && (s.cls === "attention" || s.cls === "fair") ? s.cls : "";
  return `<div class="contrib-row">
    <div class="contrib-head"><span>${esc(label)}</span><span class="${text ? "" : cls}">${esc(right)}</span></div>
    <div class="bar-track"><div class="bar-fill ${cls}" style="width:${Math.max(2, Math.min(100, score ?? 0))}%"></div></div>
  </div>`;
}

function tile(label, value, note = "") {
  return `<div class="tile"><div class="tile-label">${esc(label)}</div>
    <div class="tile-value">${value}</div>${note ? `<div class="tile-note">${note}</div>` : ""}</div>`;
}

const unitVal = (v, unit) => (v === "—" ? "—" : `${v}<small>${unit}</small>`);

function emptyDay(what) {
  return `<div class="card empty-state"><div class="headline">No ${what} data</div>
    <p>Nothing was recorded for ${esc(dateLabel(state.date).toLowerCase())}. Try another day with ← →.</p></div>`;
}

function trendCard(id, title, sub = "") {
  return `<div class="card"><div class="chart-head"><div><h3 class="card-title">${esc(title)}</h3>${sub ? `<div class="card-sub" style="margin:0">${sub}</div>` : ""}</div><div id="${id}-stat" class="chart-head-stat"></div></div><div id="${id}"></div><div id="${id}-legend"></div></div>`;
}

/** Line chart of a daily metric over the current range (raw + 7-day average on long ranges). */
function trendLine(id, key, colorVar, opts = {}) {
  const host = document.getElementById(id);
  if (!host) return;
  const days = windowDays(state.date, RANGES[state.range]);
  const raw = series(key, days);
  const fmt = opts.fmt || formatter(key);
  const long = days.length > 45;
  const s = long
    ? [{ label: "Daily", values: raw, color: colorVar, faint: true }, { label: "7-day average", values: rolling(raw), color: colorVar, area: true }]
    : [{ label: metricInfo(key)?.label, values: raw, color: colorVar, area: true }];
  C.line(host, { x: days.map(dayMs), series: s, fmt, height: opts.height || 200, refs: opts.refs, yMin: opts.yMin, yMax: opts.yMax, zero: opts.zero });
  const avg = mean(raw);
  const stat = document.getElementById(`${id}-stat`);
  if (stat) stat.innerHTML = avg == null ? "" : `<div class="big" style="text-align:right">${fmt(avg)}</div><div class="card-sub" style="text-align:right;margin:0">${state.range === "All" ? "all-time" : state.range} average</div>`;
  const legend = document.getElementById(`${id}-legend`);
  if (legend) legend.innerHTML = long ? `<div class="legend"><span><i class="line faint" style="background:${C.color(colorVar)}"></i>Daily</span><span><i class="line" style="background:${C.color(colorVar)}"></i>7-day average</span></div>` : "";
}

function legend(items, kind = "box") {
  return `<div class="legend">${items.map(([label, c]) => `<span><i class="${kind === "line" ? "line" : ""}" style="background:${C.color(c)}"></i>${esc(label)}</span>`).join("")}</div>`;
}

function trendDays() {
  return windowDays(state.date, RANGES[state.range]);
}

/** Samples {start, interval, items} → {x, values}. */
function samples(s) {
  if (!s) return { x: [], values: [] };
  return { x: s.items.map((_, i) => s.start + i * s.interval * 1000), values: s.items };
}

/** Full-day heart rate: daytime samples plus the 5-min overnight samples from sleep. */
function dayHeartRate(d) {
  const lo = dayMs(d.day), hi = lo + 86400000;
  const pts = d.heartrate.map(([t, bpm, src]) => [t, bpm, src]);
  if (d.sleep?.hr) {
    const s = samples(d.sleep.hr);
    s.x.forEach((t, i) => { if (t >= lo && t < hi && s.values[i] != null) pts.push([t, s.values[i], "sleep"]); });
  }
  pts.sort((a, b) => a[0] - b[0]);
  const bands = [];
  if (d.sleep) bands.push({ from: d.sleep.start, to: d.sleep.end, label: "SLEEP", color: "--surface-3" });
  for (const n of d.naps) if (n.start && n.end) bands.push({ from: n.start, to: n.end, label: n.type === "rest" ? "REST" : "NAP", color: "--surface-3", opacity: 0.35 });
  for (const w of d.workouts) bands.push({ from: w.start, to: w.end, label: (w.label || w.activity || "workout").toUpperCase().replace(/_/g, " "), color: "--c-activity", opacity: 0.14 });
  return { x: pts.map((p) => p[0]), values: pts.map((p) => p[1]), bands, lo, hi };
}

function drawDayHR(id, d, height = 240) {
  const host = document.getElementById(id);
  if (!host) return;
  const hr = dayHeartRate(d);
  C.line(host, {
    x: hr.x, series: [{ label: "Heart rate", values: hr.values, color: "--c-heart", area: true }],
    kind: "time", gap: 20 * 60000, height, bands: hr.bands, xMin: hr.lo, xMax: hr.hi,
    fmt: (v) => `${Math.round(v)} bpm`, endLabel: false, empty: "No heart rate recorded",
  });
}

function stageBreakdown(sl) {
  const d = sl.durations;
  const total = (d.deep || 0) + (d.rem || 0) + (d.light || 0);
  const rows = [["Awake", d.awake, "--stage-awake"], ["REM", d.rem, "--stage-rem"], ["Light", d.light, "--stage-light"], ["Deep", d.deep, "--stage-deep"]];
  const max = Math.max(...rows.map((r) => r[1] || 0));
  return `<div class="list" style="margin-top:6px">${rows.map(([label, sec, c]) => `
    <div style="display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;padding:5px 0">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="height:8px;border-radius:4px;background:${C.color(c)};width:${Math.max(4, ((sec || 0) / max) * 70)}%"></div>
        <span style="font-size:13.5px">${label}</span>
      </div>
      <span style="color:var(--text-2);font-variant-numeric:tabular-nums;font-size:13.5px">${fmtH((sec || 0) / 3600)}${label !== "Awake" && total ? ` · ${Math.round(((sec || 0) / total) * 100)}%` : ""}</span>
    </div>`).join("")}</div>`;
}

const HEADLINES = {
  readiness: { optimal: "You're well recovered", good: "Recovery is on track", fair: "Take it a little easier", attention: "Prioritise rest today" },
  sleep: { optimal: "A restorative night", good: "Solid sleep", fair: "A lighter night", attention: "A rough night" },
  activity: { optimal: "A great day of movement", good: "Nicely active", fair: "Room to move more", attention: "A quiet day" },
};

function headline(kind, score) {
  const s = status(score).cls;
  return HEADLINES[kind][s] || "Waiting for data";
}

function extremes(prefix, labels) {
  const items = Object.entries(labels).map(([k, l]) => [l, val(prefix + k)]).filter(([, v]) => v != null);
  items.sort((a, b) => b[1] - a[1]);
  return { best: items[0], worst: items[items.length - 1] };
}

// ── Pages ────────────────────────────────────────────────────────────

const RC = {
  resting_heart_rate: "Resting heart rate", hrv_balance: "HRV balance", body_temperature: "Body temperature",
  recovery_index: "Recovery index", previous_night: "Sleep", sleep_balance: "Sleep balance",
  sleep_regularity: "Sleep regularity", previous_day_activity: "Previous day activity", activity_balance: "Activity balance",
};
const SC = {
  total_sleep: "Total sleep", efficiency: "Efficiency", restfulness: "Restfulness", rem_sleep: "REM sleep",
  deep_sleep: "Deep sleep", latency: "Latency", timing: "Timing",
};
const AC = {
  stay_active: "Stay active", move_every_hour: "Move every hour", meet_daily_targets: "Meet daily goals",
  training_frequency: "Training frequency", training_volume: "Training volume", recovery_time: "Recovery time",
};

const pages = {};

pages.today = async (root) => {
  const r = val("readiness_score");
  const rhr = val("rhr");
  const resLvl = val("resilience_level");
  const stressWord = state.summary.labels.stress_summary[state.date];
  const chip = (page, label, inner, frac, c) =>
    `<a class="ring-chip" href="#/${page}/${state.date}/${state.range}"><div class="ring">${C.ring(frac, c)}<div class="rv ${typeof inner === "string" && inner.length > 3 ? "word" : ""}">${inner}</div></div><div class="rl">${label}</div></a>`;
  const ex = extremes("rc_", RC);
  const age = state.summary.profile?.age;

  const vitals = [
    ["readiness_score", "Readiness", "readiness", (v) => status(v).word, (v) => status(v).cls, "--c-readiness"],
    ["sleep_score", "Sleep score", "sleep", (v) => status(v).word, (v) => status(v).cls, "--c-sleep"],
    ["activity_score", "Activity score", "activity", (v) => status(v).word, (v) => status(v).cls, "--c-activity"],
    ["rhr", "Resting heart rate", "heart", () => "Last night", () => "neutral", "--c-heart"],
    ["hrv", "Heart rate variability", "heart", () => "Last night", () => "neutral", "--c-heart"],
    ["readiness_temp", "Body temperature", "readiness", (v) => (Math.abs(v) < 0.5 ? "Typical" : v > 0 ? "Elevated" : "Lowered"), (v) => (Math.abs(v) < 0.5 ? "good" : "fair"), "--c-readiness"],
    ["sleep_breath", "Respiratory rate", "sleep", () => "Last night", () => "neutral", "--c-sleep"],
    ["spo2", "Blood oxygen", "heart", (v) => (v >= 95 ? "Normal" : "Low"), (v) => (v >= 95 ? "good" : "fair"), "--c-body"],
    ["vascular_age", "Cardiovascular age", "heart", (v) => (age ? (v < age ? `${age - v} yrs younger` : v > age ? `${v - age} yrs older` : "Aligned") : ""), (v) => (age && v > age + 2 ? "fair" : "good"), "--c-heart"],
    ["resilience_level", "Resilience", "stress", (v) => LEVELS[v - 1], (v) => (v >= 3 ? "good" : "fair"), "--c-stress"],
    ["stress_high", "Daytime stress", "stress", () => cap(stressWord || "—"), () => "neutral", "--c-stress"],
    ["steps", "Steps", "activity", () => "Today's total", () => "neutral", "--c-activity"],
  ];
  const sparkDays = windowDays(state.date, 14);

  root.innerHTML = `
    <section class="card hero-card fade-in">
      <div class="rings">
        ${chip("readiness", "Readiness", r != null ? Math.round(r) : "—", r / 100, "--text")}
        ${chip("sleep", "Sleep", val("sleep_score") != null ? Math.round(val("sleep_score")) : "—", val("sleep_score") / 100, "--c-sleep")}
        ${chip("activity", "Activity", val("activity_score") != null ? Math.round(val("activity_score")) : "—", val("activity_score") / 100, "--c-activity")}
        ${chip("heart", "Resting HR", rhr != null ? Math.round(rhr) : "—", rhr ? Math.min(1, 40 / rhr) : 0, "--c-heart")}
        ${chip("heart", "HRV", val("hrv") != null ? Math.round(val("hrv")) : "—", Math.min(1, (val("hrv") || 0) / 120), "--c-heart")}
        ${chip("stress", "Stress", stressWord ? cap(stressWord) : "—", stressWord ? 1 : 0, "--c-stress")}
        ${chip("stress", "Resilience", resLvl ? LEVELS[resLvl - 1] : "—", (resLvl || 0) / 5, "--c-stress")}
      </div>
      <div class="hero" style="margin-top:22px">
        <div class="gauge-wrap">${C.arcGauge(r)}<div class="gauge-center"><div class="score-big">${r != null ? Math.round(r) : "—"}</div><span class="eyebrow">Readiness</span></div></div>
        <div>
          ${statusTag(r)}
          <h2 class="headline">${headline("readiness", r)}</h2>
          <p class="lede">${ex.best ? `Your strongest contributor is <b>${esc(ex.best[0].toLowerCase())}</b> (${Math.round(ex.best[1])})${ex.worst && ex.worst[1] < 75 ? `, while <b>${esc(ex.worst[0].toLowerCase())}</b> (${Math.round(ex.worst[1])}) could use some attention` : ""}.` : "No readiness data recorded for this day yet."}
          ${val("sleep_total") != null ? ` You slept <b>${fmtH(val("sleep_total"))}</b>${val("steps") != null ? ` and have taken <b>${num(val("steps"))}</b> steps` : ""}.` : ""}</p>
        </div>
      </div>
    </section>

    <h2 class="section-title">Vitals <small>14-day trend</small></h2>
    <div class="grid cols-4">
      ${vitals.map(([key, label, page, word, cls], k) => {
        const v = val(key);
        const f = formatter(key);
        let display = v == null ? "—" : f(v);
        const m = metricInfo(key);
        if (v != null && m && ["bpm", "ms", "/min", "yrs"].includes(m.unit)) display = `${num(v, m.decimals)}<small>${m.unit}</small>`;
        if (v != null && key === "stress_high") display = `${fmtMin(v)}`;
        return `<a class="card vital link" href="#/${page}/${state.date}/${state.range}">
          <div class="v-label">${label}</div>
          <div class="v-status ${v == null ? "neutral" : cls(v)}">${v == null ? "No data" : esc(word(v))}</div>
          <div class="v-spark" id="spark-${k}"></div>
          <div class="v-value">${display}</div></a>`;
      }).join("")}
    </div>

    <div class="grid cols-2" style="margin-top:16px">
      <div class="card"><h3 class="card-title">${icon("heart", 'width="14"')} Heart rate</h3><p class="card-sub">Through the day, with sleep and workouts shaded</p><div id="today-hr"></div></div>
      <div class="card"><h3 class="card-title">${icon("moon", 'width="14"')} Sleep stages</h3><p class="card-sub" id="today-sleep-sub">Last night</p><div id="today-hyp"></div></div>
    </div>`;

  vitals.forEach(([key, , , , , c], k) => C.spark(document.getElementById(`spark-${k}`), series(key, sparkDays), c));

  const d = await loadDay(state.date);
  drawDayHR("today-hr", d, 230);
  if (d.sleep) {
    $("#today-sleep-sub").textContent = `${C.fmtClock(d.sleep.start)} – ${C.fmtClock(d.sleep.end)} · ${fmtH(d.sleep.durations.total / 3600)} asleep`;
    C.hypnogram(document.getElementById("today-hyp"), { start: d.sleep.start, phases: d.sleep.phases, height: 230 });
  } else {
    C.hypnogram(document.getElementById("today-hyp"), { phases: "", height: 230 });
  }
};

pages.sleep = async (root) => {
  const score = val("sleep_score");
  const d = await loadDay(state.date);
  const sl = d.sleep;
  const dur = sl?.durations || {};
  const pct = (k) => (dur.total ? Math.round(((dur[k] || 0) / dur.total) * 100) : null);
  const texts = {
    total_sleep: fmtH(val("sleep_total")), efficiency: val("sleep_efficiency") != null ? `${num(val("sleep_efficiency"))}%` : null,
    rem_sleep: sl ? `${fmtH(dur.rem / 3600)}, ${pct("rem")}%` : null, deep_sleep: sl ? `${fmtH(dur.deep / 3600)}, ${pct("deep")}%` : null,
    latency: val("sleep_latency") != null ? fmtMin(val("sleep_latency")) : null,
  };

  root.innerHTML = `
    <div class="hero fade-in">
      <div>
        <div class="score-line"><span class="score-big">${score != null ? Math.round(score) : "—"}</span>${statusTag(score)}</div>
        <h2 class="headline">${score != null ? headline("sleep", score) : "No sleep recorded"}</h2>
        <p class="lede">${sl ? `<b>${fmtH(dur.total / 3600)}</b> asleep with <b>${fmtH(dur.deep / 3600)}</b> deep and <b>${fmtH(dur.rem / 3600)}</b> REM. You went to bed at <b>${C.fmtClock(sl.start)}</b> and woke at <b>${C.fmtClock(sl.end)}</b>.` : "There's no main sleep period for this day."}
        ${d.bedtime?.recommendation ? ` Bedtime guidance: <b>${esc(cap(d.bedtime.recommendation).toLowerCase())}</b>.` : ""}</p>
      </div>
      <div class="card"><h3 class="card-title">Sleep contributors</h3>
        <div class="contrib">${Object.entries(SC).map(([k, l]) => contribRow(l, val("sc_" + k), texts[k])).join("")}</div>
      </div>
    </div>

    ${sl ? `
    <div class="grid cols-3" style="margin-top:24px">
      <div class="card span-2"><div class="chart-head"><div><h3 class="card-title">Sleep stages</h3><div class="card-sub" style="margin:0">${C.fmtClock(sl.start)} – ${C.fmtClock(sl.end)} · ${fmtH(dur.in_bed / 3600)} in bed</div></div></div>
        <div id="hyp"></div></div>
      <div class="card"><h3 class="card-title">Time asleep</h3><div class="big" style="font-size:30px;font-weight:300;margin:4px 0 8px">${fmtH(dur.total / 3600)}</div>${stageBreakdown(sl)}
        <dl class="kv" style="margin-top:20px;padding-top:16px;border-top:1px solid var(--hairline)">
          <dt>Bedtime</dt><dd>${C.fmtClock(sl.start)}</dd><dt>Wake up</dt><dd>${C.fmtClock(sl.end)}</dd>
          <dt>Restless periods</dt><dd>${num(val("sleep_restless"))}</dd>
          ${d.bedtime?.recommendation ? `<dt>Guidance</dt><dd>${esc(cap(d.bedtime.recommendation))}</dd>` : ""}
        </dl></div>
    </div>
    <h2 class="section-title">Key metrics</h2>
    <div class="tiles" style="grid-template-columns:repeat(auto-fill,minmax(180px,1fr))">
      ${tile("Total sleep", fmtH(val("sleep_total")))}
      ${tile("Time in bed", fmtH(val("sleep_in_bed")))}
      ${tile("Efficiency", unitVal(num(val("sleep_efficiency")), "%"))}
      ${tile("Latency", fmtMin(val("sleep_latency")))}
      ${tile("Resting heart rate", unitVal(num(val("rhr")), "bpm"))}
      ${tile("Average HRV", unitVal(num(val("hrv")), "ms"))}
      ${tile("Respiratory rate", unitVal(num(val("sleep_breath"), 1), "/min"))}
      ${tile("Blood oxygen", unitVal(num(val("spo2"), 1), "%"), val("bdi") != null ? `Breathing disturbance index ${num(val("bdi"))}` : "")}
    </div>
    <div class="grid cols-2" style="margin-top:16px">
      <div class="card"><h3 class="card-title">Heart rate</h3><p class="card-sub">Lowest ${num(val("rhr"))} bpm · average ${num(val("sleep_avg_hr"))} bpm</p><div id="ohr"></div></div>
      <div class="card"><h3 class="card-title">Heart rate variability</h3><p class="card-sub">Average ${num(val("hrv"))} ms</p><div id="ohrv"></div></div>
    </div>
    ${d.naps.length ? `<div class="card" style="margin-top:16px"><h3 class="card-title">Other sleep periods</h3><div class="list">${d.naps.map((n) => `
      <div class="list-row"><div class="li-icon">${icon("moon")}</div><div class="li-main"><div class="li-title">${esc(cap(n.type))}</div><div class="li-sub">${C.fmtClock(n.start)} – ${C.fmtClock(n.end)}</div></div><div class="li-end">${fmtH((n.total || 0) / 3600)}</div></div>`).join("")}</div></div>` : ""}
    ` : `<div style="margin-top:24px">${emptyDay("sleep")}</div>`}

    <h2 class="section-title">Trends <small>${state.range === "All" ? "All time" : `Last ${state.range}`}</small></h2>
    <div class="grid cols-2">
      ${trendCard("t-score", "Sleep score")}
      <div class="card"><h3 class="card-title">Sleep stages</h3><p class="card-sub">Hours per night</p><div id="t-stages"></div>${legend([["Deep", "--stage-deep"], ["Light", "--stage-light"], ["REM", "--stage-rem"]])}</div>
      <div class="card"><h3 class="card-title">Sleep timing</h3><p class="card-sub">Bedtime to wake-up</p><div id="t-timing"></div></div>
      ${trendCard("t-eff", "Efficiency")}
    </div>`;

  if (sl) {
    C.hypnogram(document.getElementById("hyp"), { start: sl.start, phases: sl.phases, height: 250 });
    const hr = samples(sl.hr), hrv = samples(sl.hrv);
    C.line(document.getElementById("ohr"), { x: hr.x, series: [{ label: "Heart rate", values: hr.values, color: "--c-heart", area: true }], kind: "time", fmt: (v) => `${Math.round(v)} bpm`, height: 190, refs: val("rhr") ? [{ y: val("rhr"), label: `Lowest ${num(val("rhr"))}` }] : [] });
    C.line(document.getElementById("ohrv"), { x: hrv.x, series: [{ label: "HRV", values: hrv.values, color: "--c-sleep", area: true }], kind: "time", fmt: (v) => `${Math.round(v)} ms`, height: 190 });
  }
  const days = trendDays();
  trendLine("t-score", "sleep_score", "--c-sleep");
  C.stacked(document.getElementById("t-stages"), {
    x: days.map(dayMs), height: 210, fmt: fmtH, axisFmt: (v) => `${v}h`,
    stacks: [
      { label: "Deep", values: series("sleep_deep", days), color: "--stage-deep" },
      { label: "Light", values: series("sleep_light", days), color: "--stage-light" },
      { label: "REM", values: series("sleep_rem", days), color: "--stage-rem" },
    ],
  });
  C.rangeBars(document.getElementById("t-timing"), { x: days.map(dayMs), lo: series("sleep_bedtime", days), hi: series("sleep_waketime", days), color: "--c-sleep", height: 210 });
  trendLine("t-eff", "sleep_efficiency", "--c-sleep");
};

pages.readiness = async (root) => {
  const score = val("readiness_score");
  const ex = extremes("rc_", RC);
  const d = await loadDay(state.date);
  const texts = {
    resting_heart_rate: val("rhr") != null ? `${num(val("rhr"))} bpm` : null,
    body_temperature: val("readiness_temp") != null ? `${signed(val("readiness_temp"), 1)} °C` : null,
  };
  root.innerHTML = `
    <div class="hero fade-in">
      <div>
        <div class="score-line"><span class="score-big">${score != null ? Math.round(score) : "—"}</span>${statusTag(score)}</div>
        <h2 class="headline">${score != null ? headline("readiness", score) : "No readiness data"}</h2>
        <p class="lede">${ex.best ? `Strongest contributor: <b>${esc(ex.best[0])}</b> (${Math.round(ex.best[1])}). Weakest: <b>${esc(ex.worst[0])}</b> (${Math.round(ex.worst[1])}).` : ""}
        ${val("readiness_temp") != null ? ` Body temperature is <b>${signed(val("readiness_temp"), 2)} °C</b> from your baseline.` : ""}</p>
        <div class="tiles" style="margin-top:24px">
          ${tile("Resting heart rate", unitVal(num(val("rhr")), "bpm"))}
          ${tile("Heart rate variability", unitVal(num(val("hrv")), "ms"))}
          ${tile("Body temperature", val("readiness_temp") != null ? `${signed(val("readiness_temp"), 2)}<small>°C</small>` : "—")}
          ${tile("Respiratory rate", unitVal(num(val("sleep_breath"), 1), "/min"))}
        </div>
      </div>
      <div class="card"><h3 class="card-title">Contributors</h3>
        <div class="contrib">${Object.entries(RC).map(([k, l]) => contribRow(l, val("rc_" + k), texts[k])).join("")}</div>
      </div>
    </div>
    ${d.sleep ? `<div class="grid cols-2" style="margin-top:24px">
      <div class="card"><h3 class="card-title">Lowest heart rate</h3><p class="card-sub">${num(val("rhr"))} bpm · average ${num(val("sleep_avg_hr"))} bpm overnight</p><div id="rhr-night"></div></div>
      <div class="card"><h3 class="card-title">Average HRV</h3><p class="card-sub">${num(val("hrv"))} ms overnight</p><div id="hrv-night"></div></div>
    </div>` : ""}
    <h2 class="section-title">Trends <small>${state.range === "All" ? "All time" : `Last ${state.range}`}</small></h2>
    <div class="grid cols-2">
      ${trendCard("t-ready", "Readiness score")}
      ${trendCard("t-temp", "Temperature deviation", "Difference from your baseline")}
      ${trendCard("t-rhr", "Resting heart rate", "Lowest overnight")}
      ${trendCard("t-hrv", "Heart rate variability", "Overnight average")}
    </div>`;
  if (d.sleep) {
    const hr = samples(d.sleep.hr), hrv = samples(d.sleep.hrv);
    C.line(document.getElementById("rhr-night"), { x: hr.x, series: [{ label: "Heart rate", values: hr.values, color: "--c-heart", area: true }], kind: "time", fmt: (v) => `${Math.round(v)} bpm`, height: 200, refs: val("rhr") ? [{ y: val("rhr"), label: `Lowest ${num(val("rhr"))}` }] : [] });
    C.line(document.getElementById("hrv-night"), { x: hrv.x, series: [{ label: "HRV", values: hrv.values, color: "--c-readiness", area: true }], kind: "time", fmt: (v) => `${Math.round(v)} ms`, height: 200 });
  }
  trendLine("t-ready", "readiness_score", "--c-readiness");
  trendLine("t-temp", "readiness_temp", "--c-readiness", { refs: [{ y: 0, label: "Baseline" }] });
  trendLine("t-rhr", "rhr", "--c-heart");
  trendLine("t-hrv", "hrv", "--c-readiness");
};

pages.activity = async (root) => {
  const score = val("activity_score");
  const d = await loadDay(state.date);
  const active = val("active_calories"), target = val("target_calories");
  const actMin = ["low_activity", "medium_activity", "high_activity"].reduce((a, k) => a + (val(k) || 0), 0);
  const texts = {
    stay_active: val("sedentary_time") != null ? `${fmtH(val("sedentary_time"))} inactive` : null,
    move_every_hour: val("inactivity_alerts") != null ? `${num(val("inactivity_alerts"))} alert${val("inactivity_alerts") === 1 ? "" : "s"}` : null,
  };
  root.innerHTML = `
    <div class="hero fade-in">
      <div>
        <div class="score-line"><span class="score-big">${score != null ? Math.round(score) : "—"}</span>${statusTag(score)}</div>
        <h2 class="headline">${score != null ? headline("activity", score) : "No activity data"}</h2>
        <p class="lede">${val("steps") != null ? `<b>${num(val("steps"))}</b> steps and <b>${num(active)}</b> active calories${target ? ` — ${Math.round((active / target) * 100)}% of your ${num(target)} Cal goal` : ""}.` : ""}
        ${val("workout_minutes") ? ` Workouts: <b>${fmtMin(val("workout_minutes"))}</b>.` : ""}</p>
        <div class="tiles" style="margin-top:24px">
          ${tile("Goal progress", target ? `${num(active)}<small>/ ${num(target)} Cal</small>` : "—")}
          ${tile("Total burn", unitVal(num(val("total_calories")), "Cal"))}
          ${tile("Activity time", fmtMin(actMin), `High ${fmtMin(val("high_activity"))} · Med ${fmtMin(val("medium_activity"))}`)}
          ${tile("Steps", num(val("steps")), val("walking_distance") != null ? `${num(val("walking_distance"), 1)} km walking equivalent` : "")}
        </div>
      </div>
      <div class="card"><h3 class="card-title">Contributors</h3>
        <div class="contrib">${Object.entries(AC).map(([k, l]) => contribRow(l, val("ac_" + k), texts[k])).join("")}</div>
      </div>
    </div>
    <div class="grid cols-3" style="margin-top:24px">
      <div class="card span-2"><h3 class="card-title">Daily movement</h3><p class="card-sub">Intensity in 5-minute blocks, from 4 am</p><div id="strip"></div>
        ${legend([["Low", "--act-low"], ["Medium", "--act-med"], ["High", "--act-high"]])}</div>
      <div class="card"><h3 class="card-title">${icon("run", 'width="14"')} Workouts</h3>
        ${d.workouts.length ? `<div class="list">${d.workouts.map((w) => `
          <div class="list-row"><div class="li-icon">${icon("run")}</div><div class="li-main"><div class="li-title">${esc(cap(w.label || w.activity))}</div>
          <div class="li-sub">${C.fmtClock(w.start)} – ${C.fmtClock(w.end)} · ${esc(w.intensity || "")}</div></div>
          <div class="li-end">${fmtMin((w.end - w.start) / 60000)}<br><small>${num(w.calories)} Cal</small></div></div>`).join("")}</div>`
          : `<p class="note">No workouts recorded.</p>`}
      </div>
    </div>
    <h2 class="section-title">Trends <small>${state.range === "All" ? "All time" : `Last ${state.range}`}</small></h2>
    <div class="grid cols-2">
      <div class="card"><h3 class="card-title">Steps</h3><p class="card-sub">Average ${num(mean(series("steps", trendDays())))} per day</p><div id="t-steps"></div></div>
      <div class="card"><h3 class="card-title">Activity time</h3><p class="card-sub">Minutes per day by intensity</p><div id="t-acttime"></div>${legend([["Low", "--act-low"], ["Medium", "--act-med"], ["High", "--act-high"]])}</div>
      ${trendCard("t-ascore", "Activity score")}
      ${trendCard("t-acal", "Active calories")}
    </div>`;
  C.activityStrip(document.getElementById("strip"), { start: d.activity?.start, codes: d.activity?.class_5_min, height: 160 });
  const days = trendDays();
  C.bars(document.getElementById("t-steps"), { x: days.map(dayMs), values: series("steps", days), color: "--c-activity", label: "Steps", height: 210 });
  C.stacked(document.getElementById("t-acttime"), {
    x: days.map(dayMs), height: 210, fmt: fmtMin,
    stacks: [
      { label: "Low", values: series("low_activity", days), color: "--act-low" },
      { label: "Medium", values: series("medium_activity", days), color: "--act-med" },
      { label: "High", values: series("high_activity", days), color: "--act-high" },
    ],
  });
  trendLine("t-ascore", "activity_score", "--c-activity");
  trendLine("t-acal", "active_calories", "--c-activity");
};

pages.heart = async (root) => {
  const d = await loadDay(state.date);
  const hr = d.sleep ? samples(d.sleep.hr).values.filter((v) => v != null) : [];
  const hrv = d.sleep ? samples(d.sleep.hrv).values.filter((v) => v != null) : [];
  const age = state.summary.profile?.age;
  const va = val("vascular_age");
  const hasVo2 = (state.summary.values.vo2_max || []).some((v) => v != null);
  root.innerHTML = `
    <div class="card fade-in"><div class="chart-head"><div><h3 class="card-title">Heart rate</h3>
      <div class="card-sub" style="margin:0">${esc(dateLabel(state.date))} · sleep and workouts shaded</div></div>
      <div style="text-align:right"><div class="big">${num(val("day_hr_avg"))}<small>bpm</small></div><div class="card-sub" style="margin:0">Daytime average</div></div></div>
      <div id="dayhr"></div></div>
    <div class="tiles" style="grid-template-columns:repeat(auto-fill,minmax(190px,1fr));margin-top:16px">
      ${tile("Sleeping range", hr.length ? `${Math.min(...hr)}–${Math.max(...hr)}<small>bpm</small>` : "—")}
      ${tile("Resting heart rate", unitVal(num(val("rhr")), "bpm"), "Lowest overnight")}
      ${tile("Daytime lowest", unitVal(num(val("day_hr_min")), "bpm"))}
      ${tile("Daytime highest", unitVal(num(val("day_hr_max")), "bpm"), "Excluding workouts")}
      ${tile("Average HRV", unitVal(num(val("hrv")), "ms"), hrv.length ? `Max ${Math.max(...hrv)} ms` : "")}
      ${tile("Blood oxygen", unitVal(num(val("spo2"), 1), "%"))}
    </div>
    <h2 class="section-title">${icon("heart")} Heart health</h2>
    <div class="grid cols-3">
      <div class="card"><h3 class="card-title">Cardiovascular age</h3>
        <div class="big" style="font-size:40px;font-weight:300;margin:8px 0 2px">${va != null ? Math.round(va) : "—"}<small style="font-size:14px;color:var(--text-2)"> yrs</small></div>
        <div class="card-sub">${va != null && age ? (va < age ? `${age - va} years younger than your age (${age})` : va > age ? `${va - age} years older than your age (${age})` : `Aligned with your age (${age})`) : "No reading for this day"}</div></div>
      <div class="card"><h3 class="card-title">Pulse wave velocity</h3>
        <div class="big" style="font-size:40px;font-weight:300;margin:8px 0 2px">${num(val("pwv"), 2)}<small style="font-size:14px;color:var(--text-2)"> m/s</small></div>
        <div class="card-sub">How fast your pulse travels through your arteries. Lower generally means more elastic arteries.</div></div>
      <div class="card"><h3 class="card-title">VO2 max</h3>
        <div class="big" style="font-size:40px;font-weight:300;margin:8px 0 2px">${hasVo2 ? num(val("vo2_max") ?? [...state.summary.values.vo2_max].reverse().find((v) => v != null), 1) : "—"}</div>
        <div class="card-sub">${hasVo2 ? "ml/kg/min · cardio capacity" : "No readings yet — take the walking test in the Oura app to estimate it."}</div></div>
    </div>
    <h2 class="section-title">Trends <small>${state.range === "All" ? "All time" : `Last ${state.range}`}</small></h2>
    <div class="grid cols-2">
      ${trendCard("t-rhr", "Resting heart rate")}
      ${trendCard("t-hrv", "Heart rate variability")}
      ${trendCard("t-dayhr", "Daytime average heart rate", "Excluding workouts")}
      ${trendCard("t-va", "Cardiovascular age", age ? `Dotted line: your age (${age})` : "")}
      ${trendCard("t-pwv", "Pulse wave velocity")}
      ${trendCard("t-spo2", "Blood oxygen (SpO2)")}
      ${hasVo2 ? trendCard("t-vo2", "VO2 max") : ""}
    </div>`;
  drawDayHR("dayhr", d, 280);
  trendLine("t-rhr", "rhr", "--c-heart");
  trendLine("t-hrv", "hrv", "--c-heart");
  trendLine("t-dayhr", "day_hr_avg", "--c-heart");
  trendLine("t-va", "vascular_age", "--c-heart", { refs: age ? [{ y: age, label: `Age ${age}` }] : [] });
  trendLine("t-pwv", "pwv", "--c-heart");
  trendLine("t-spo2", "spo2", "--c-body");
  if (hasVo2) trendLine("t-vo2", "vo2_max", "--c-heart");
};

pages.stress = async (root) => {
  const lvl = val("resilience_level");
  const word = state.summary.labels.stress_summary[state.date];
  const days = trendDays();
  root.innerHTML = `
    <div class="hero fade-in">
      <div>
        <span class="eyebrow">Daytime stress</span>
        <h2 class="headline">${word ? cap(word) : "No stress data"}</h2>
        <p class="lede">${val("stress_high") != null ? `<b>${fmtMin(val("stress_high"))}</b> in high stress and <b>${fmtMin(val("recovery_high"))}</b> restored.` : "Daytime stress is measured while you're awake and still."}</p>
        <div class="tiles" style="margin-top:24px">
          ${tile("Stressed", fmtMin(val("stress_high")))}
          ${tile("Restored", fmtMin(val("recovery_high")))}
        </div>
      </div>
      <div class="card"><h3 class="card-title">Resilience</h3>
        <div class="big" style="font-size:34px;font-weight:300;margin:6px 0 0">${lvl ? LEVELS[lvl - 1] : "—"}</div>
        <div class="levels">${LEVELS.map((_, i) => `<div class="${lvl && i < lvl ? "on" : ""}"></div>`).join("")}</div>
        <div class="levels-labels"><span>Limited</span><span>Exceptional</span></div>
        <h3 class="card-title" style="margin-top:22px">Contributors <span style="text-transform:none;letter-spacing:0;color:var(--text-3)">· past 14 days</span></h3>
        <div class="contrib">
          ${contribRow("Nighttime recovery", val("res_sleep_recovery"), val("res_sleep_recovery") != null ? num(val("res_sleep_recovery")) : null, true)}
          ${contribRow("Daytime recovery", val("res_daytime_recovery"), val("res_daytime_recovery") != null ? num(val("res_daytime_recovery")) : null, true)}
          ${contribRow("Daytime stress load", val("res_stress"), val("res_stress") != null ? num(val("res_stress")) : null, true)}
        </div>
      </div>
    </div>
    <h2 class="section-title">Trends <small>${state.range === "All" ? "All time" : `Last ${state.range}`}</small></h2>
    <div class="grid cols-2">
      <div class="card"><h3 class="card-title">Stressed vs restored</h3><p class="card-sub">Time per day${days.length > 45 ? ", 7-day average" : ""}</p><div id="t-sr"></div>${legend([["Stressed", "--cat-2"], ["Restored", "--cat-1"]], "line")}</div>
      <div class="card"><h3 class="card-title">Resilience level</h3><p class="card-sub">Limited → Exceptional</p><div id="t-res"></div></div>
      <div class="card span-2"><h3 class="card-title">Resilience contributors</h3><p class="card-sub">Rolling 14-day scores</p><div id="t-rc"></div>${legend([["Nighttime recovery", "--cat-1"], ["Daytime recovery", "--cat-2"], ["Daytime stress load", "--cat-3"]], "line")}</div>
    </div>`;
  const x = days.map(dayMs);
  const long = days.length > 45;
  const hours = (v) => v.map((m) => (m == null ? null : m / 60));
  const sm = (v) => (long ? rolling(v) : v);
  C.line(document.getElementById("t-sr"), {
    x, height: 220, fmt: fmtH, zero: true,
    series: [
      { label: "Stressed", values: sm(hours(series("stress_high", days))), color: "--cat-2" },
      { label: "Restored", values: sm(hours(series("recovery_high", days))), color: "--cat-1" },
    ],
  });
  C.line(document.getElementById("t-res"), {
    x, height: 220, yMin: 1, yMax: 5, ticks: 4, fmt: (v) => LEVELS[Math.round(v) - 1] || "",
    series: [{ label: "Resilience", values: series("resilience_level", days), color: "--c-stress", area: true }],
  });
  C.line(document.getElementById("t-rc"), {
    x, height: 240,
    fmt: (v) => num(v, 1),
    series: [
      { label: "Nighttime recovery", values: series("res_sleep_recovery", days), color: "--cat-1" },
      { label: "Daytime recovery", values: series("res_daytime_recovery", days), color: "--cat-2" },
      { label: "Daytime stress load", values: series("res_stress", days), color: "--cat-3" },
    ],
  });
};

pages.trends = async (root) => {
  const metrics = state.summary.metrics;
  const defaults = ["readiness_score", "sleep_score", "hrv", "rhr"];
  let selected = store.get("explore", defaults).filter((k) => metricInfo(k));
  if (!selected.length) selected = defaults.filter((k) => metricInfo(k));
  let smooth = store.get("smooth", true);
  const corr = store.get("corr", { x: "sleep_total", y: "hrv", lag: false });
  const groups = [...new Set(metrics.map((m) => m.group))];

  root.innerHTML = `
    <div class="explore fade-in">
      <aside class="card picker">
        <input type="search" id="msearch" placeholder="Search metrics…" autocomplete="off">
        <div id="mlist">${groups.map((g) => `<div data-group="${esc(g)}"><h4>${esc(g)}</h4>${metrics.filter((m) => m.group === g).map((m) => `
          <label data-label="${esc(m.label.toLowerCase())}"><input type="checkbox" value="${m.key}" ${selected.includes(m.key) ? "checked" : ""}>${esc(m.label)}<span class="dot" style="background:${C.color(ACCENT[g])}"></span></label>`).join("")}</div>`).join("")}</div>
      </aside>
      <div>
        <div class="toolbar">
          <label class="switch"><input type="checkbox" id="smooth" ${smooth ? "checked" : ""}>7-day average</label>
          <span class="spacer"></span>
          <button class="today-btn" id="clear">Clear</button>
        </div>
        <div id="panels" class="grid"></div>
        <h2 class="section-title">Correlate <small>Does one metric move with another?</small></h2>
        <div class="card">
          <div class="toolbar">
            <select class="select" id="cx">${metrics.map((m) => `<option value="${m.key}" ${m.key === corr.x ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select>
            <span style="color:var(--text-3)">vs</span>
            <select class="select" id="cy">${metrics.map((m) => `<option value="${m.key}" ${m.key === corr.y ? "selected" : ""}>${esc(m.label)}</option>`).join("")}</select>
            <label class="switch"><input type="checkbox" id="clag" ${corr.lag ? "checked" : ""}>Compare with next day</label>
            <span class="spacer"></span><span id="cstat" style="color:var(--text-2);font-size:13.5px"></span>
          </div>
          <div id="scatter"></div>
        </div>
      </div>
    </div>`;

  const drawPanels = () => {
    const days = trendDays();
    const x = days.map(dayMs);
    const panels = $("#panels");
    if (!selected.length) {
      panels.innerHTML = `<div class="card empty-state"><div class="headline">Pick some metrics</div><p>Choose from the list to chart them side by side.</p></div>`;
      return;
    }
    panels.innerHTML = selected.map((k) => {
      const m = metricInfo(k);
      const v = series(k, days);
      const f = formatter(k);
      const valid = v.filter((a) => a != null);
      return `<div class="card"><div class="panel-head"><span class="ph-title">${esc(m.label)} <span style="color:var(--text-3);font-size:12.5px">${esc(m.group)}</span></span>
        <span class="ph-stats">${valid.length ? `avg <b>${f(mean(v))}</b> · min <b>${f(Math.min(...valid))}</b> · max <b>${f(Math.max(...valid))}</b>` : "no data"}
        <button data-remove="${k}" title="Remove">${icon("x", 'width="13" height="13"')}</button></span></div><div id="p-${k}"></div></div>`;
    }).join("");
    selected.forEach((k) => {
      const m = metricInfo(k);
      const v = series(k, days);
      const c = ACCENT[m.group];
      const host = document.getElementById(`p-${k}`);
      const s = smooth && days.length > 7
        ? [{ label: "Daily", values: v, color: c, faint: true }, { label: "7-day average", values: rolling(v), color: c, area: true }]
        : [{ label: m.label, values: v, color: c, area: true }];
      C.line(host, { x, series: s, fmt: formatter(k), height: 170 });
    });
  };

  const drawCorr = () => {
    const kx = $("#cx").value, ky = $("#cy").value, lag = $("#clag").checked;
    store.set("corr", { x: kx, y: ky, lag });
    const days = trendDays();
    const xs = series(kx, days);
    const ys = lag ? series(ky, days.map((d) => addDays(d, 1))) : series(ky, days);
    const pairs = xs.map((a, i) => [a, ys[i]]).filter(([a, b]) => a != null && b != null);
    let text = "";
    if (pairs.length >= 3) {
      const n = pairs.length;
      const mx = pairs.reduce((s, p) => s + p[0], 0) / n, my = pairs.reduce((s, p) => s + p[1], 0) / n;
      const sxy = pairs.reduce((s, p) => s + (p[0] - mx) * (p[1] - my), 0);
      const sxx = pairs.reduce((s, p) => s + (p[0] - mx) ** 2, 0), syy = pairs.reduce((s, p) => s + (p[1] - my) ** 2, 0);
      const r = sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
      const strength = Math.abs(r) < 0.1 ? "no clear" : Math.abs(r) < 0.3 ? "a weak" : Math.abs(r) < 0.5 ? "a moderate" : "a strong";
      text = `r = ${r.toFixed(2)} · ${strength}${Math.abs(r) >= 0.1 ? (r > 0 ? " positive" : " negative") : ""} relationship · ${n} days`;
    }
    $("#cstat").textContent = text;
    C.scatter(document.getElementById("scatter"), {
      xs, ys, labels: days.map((d) => C.fmtDay(dayMs(d), true)), color: "--c-readiness",
      xLabel: metricInfo(kx).label, yLabel: metricInfo(ky).label + (lag ? " (next day)" : ""), fx: formatter(kx), fy: formatter(ky),
    });
  };

  $("#mlist").addEventListener("change", (e) => {
    if (e.target.type !== "checkbox") return;
    selected = e.target.checked ? [...selected, e.target.value] : selected.filter((k) => k !== e.target.value);
    store.set("explore", selected);
    drawPanels();
  });
  $("#panels").addEventListener("click", (e) => {
    const b = e.target.closest("[data-remove]");
    if (!b) return;
    selected = selected.filter((k) => k !== b.dataset.remove);
    store.set("explore", selected);
    const cb = $(`#mlist input[value="${b.dataset.remove}"]`);
    if (cb) cb.checked = false;
    drawPanels();
  });
  $("#msearch").addEventListener("input", (e) => {
    const q = e.target.value.toLowerCase().trim();
    root.querySelectorAll("#mlist label").forEach((l) => { l.style.display = !q || l.dataset.label.includes(q) ? "" : "none"; });
    root.querySelectorAll("#mlist [data-group]").forEach((g) => { g.style.display = [...g.querySelectorAll("label")].some((l) => l.style.display !== "none") ? "" : "none"; });
  });
  $("#smooth").addEventListener("change", (e) => { smooth = e.target.checked; store.set("smooth", smooth); drawPanels(); });
  $("#clear").addEventListener("click", () => {
    selected = [];
    store.set("explore", selected);
    root.querySelectorAll("#mlist input").forEach((i) => { i.checked = false; });
    drawPanels();
  });
  ["cx", "cy", "clag"].forEach((id) => document.getElementById(id).addEventListener("change", drawCorr));
  drawPanels();
  drawCorr();
};

pages.data = async (root) => {
  const meta = await api("/api/meta");
  const wanted = { personal: "Profile", daily: "Sleep, readiness & activity", heartrate: "Heart rate", workout: "Workouts", tag: "Tags", session: "Sessions", spo2: "Blood oxygen", stress: "Stress & resilience", heart_health: "Cardiovascular age & VO2 max", ring_configuration: "Ring & battery", email: "Email", health_radar: "Symptom radar (undocumented)", meals: "Meals (undocumented)", research: "Raw temperature & IBI (undocumented)" };
  const fmtSize = (b) => (b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
  const ring = meta.ring || {};
  const p = meta.profile || {};
  const lastBattery = meta.battery[meta.battery.length - 1];
  root.innerHTML = `
    <div class="grid cols-3 fade-in">
      <div class="card span-2">
        <div class="chart-head"><div><h3 class="card-title">${icon("sync", 'width="14"')} Sync</h3>
          <div class="card-sub" style="margin:0">Fetches anything new since the last run and refreshes recent days.</div></div>
          <button class="today-btn" id="sync-now" style="padding:8px 16px">Sync now</button></div>
        <table class="table"><thead><tr><th>Endpoint</th><th>Last synced</th></tr></thead>
          <tbody>${Object.entries(meta.state).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join("")}</tbody></table>
        <div class="log" id="sync-log" ${meta.sync_log ? "" : "hidden"}>${esc(meta.sync_log)}</div>
      </div>
      <div class="grid" style="align-content:start">
        <div class="card"><h3 class="card-title">Ring</h3>
          <dl class="kv" style="margin-top:12px">
            <dt>Hardware</dt><dd>${esc(cap(ring.hardware_type || "—"))}</dd>
            <dt>Design</dt><dd>${esc(cap(ring.design || "—"))}</dd>
            <dt>Colour</dt><dd>${esc(cap(ring.color || "—"))}</dd>
            <dt>Size</dt><dd>${esc(ring.size || "—")}</dd>
            <dt>Firmware</dt><dd>${esc(ring.firmware_version || "—")}</dd>
            <dt>Set up</dt><dd>${esc((ring.set_up_at || "—").slice(0, 10))}</dd>
            <dt>Battery</dt><dd>${lastBattery ? `${lastBattery[1]}%${lastBattery[2] ? " · charging" : ""}` : "—"}</dd>
          </dl></div>
        <div class="card"><h3 class="card-title">Profile</h3>
          <dl class="kv" style="margin-top:12px">
            <dt>Age</dt><dd>${esc(p.age ?? "—")}</dd><dt>Height</dt><dd>${p.height ? `${p.height} m` : "—"}</dd>
            <dt>Weight</dt><dd>${p.weight ? `${p.weight} kg` : "—"}</dd><dt>Sex</dt><dd>${esc(p.biological_sex || "—")}</dd>
          </dl></div>
      </div>
    </div>

    <div class="card" style="margin-top:16px"><h3 class="card-title">Ring battery</h3><p class="card-sub">Last 7 days</p><div id="battery"></div></div>

    <div class="card" style="margin-top:16px"><h3 class="card-title">Permissions</h3>
      <p class="card-sub">Scopes granted to this app. Undocumented scopes are requested too; Oura may decline them for personal apps.</p>
      <div class="pills">${Object.entries(wanted).map(([s, l]) => `<span class="pill ${meta.scopes.includes(s) ? "on" : "off"}" title="${esc(s)}">${meta.scopes.includes(s) ? "✓" : "✕"} ${esc(l)}</span>`).join("")}</div>
    </div>

    <h2 class="section-title">Files <small>${esc(meta.data_dir)}</small></h2>
    <div class="card" style="overflow-x:auto"><table class="table">
      <thead><tr><th>File</th><th>Rows</th><th>Columns</th><th>From</th><th>To</th><th>Size</th></tr></thead>
      <tbody>${meta.files.map((f, i) => `<tr class="clickable" data-i="${i}"><td>${esc(f.name)}</td><td>${f.rows != null ? num(f.rows) : "—"}</td><td>${f.columns ? f.columns.length : "—"}</td><td>${esc(f.from || "—")}</td><td>${esc(f.to || "—")}</td><td>${fmtSize(f.size)}</td></tr>
        <tr hidden data-cols="${i}"><td colspan="6" class="cols">${(f.columns || []).map(esc).join(" · ")}</td></tr>`).join("")}</tbody></table>
      <p class="note">Click a row to see its columns. Nested fields use dot notation (<code>contributors.hrv_balance</code>); sample arrays are JSON strings with matching <code>.interval</code> (seconds) and <code>.timestamp</code> (start) columns — e.g. <code>json.loads(row["heart_rate.items"])</code>.</p>
    </div>`;

  const now = Date.now();
  const bat = meta.battery.filter((b) => b[0] > now - 7 * 86400000);
  C.line(document.getElementById("battery"), {
    x: bat.map((b) => b[0]), series: [{ label: "Battery", values: bat.map((b) => b[1]), color: "--c-stress", area: true }],
    kind: "time", yMin: 0, yMax: 100, zero: true, height: 180, gap: 6 * 3600000, fmt: (v) => `${Math.round(v)}%`,
    head: (t) => `${C.fmtDay(t)} ${C.fmtClock(t)}`,
  });
  root.querySelectorAll("tr.clickable").forEach((tr) => tr.addEventListener("click", () => {
    const row = root.querySelector(`tr[data-cols="${tr.dataset.i}"]`);
    row.hidden = !row.hidden;
  }));
  $("#sync-now").addEventListener("click", sync);
};

// ── Shell ────────────────────────────────────────────────────────────

function renderShell() {
  $("#nav").innerHTML = PAGES.map((p, i) => (p.sep ? '<div class="sep"></div>' :
    `<a href="#/${p.id}" data-page="${p.id}" title="${p.title}">${icon(p.icon)}<span>${p.title}</span><kbd>${PAGES.filter((q) => !q.sep).indexOf(p) + 1}</kbd></a>`)).join("");
  $("#sync").innerHTML = `${icon("sync")}<span class="sync-meta"><span>Sync now</span><small id="sync-sub"></small></span>`;
  $("#prev").innerHTML = icon("left");
  $("#next").innerHTML = icon("right");
  $("#cal-icon").innerHTML = icon("cal");
  $("#ranges").innerHTML = Object.keys(RANGES).map((r) => `<button data-r="${r}">${r}</button>`).join("");
}

function updateShell() {
  const page = PAGES.find((p) => p.id === state.page);
  document.body.dataset.page = state.page;
  document.title = `${page.title} · Oura`;
  $("#title").textContent = page.title;
  document.querySelectorAll("#nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.page === state.page);
    a.href = `#/${a.dataset.page}/${state.date}/${state.range}`;
  });
  $("#date-text").textContent = dateLabel(state.date);
  $("#date-input").value = state.date;
  $("#date-input").max = todayIso();
  $("#date-input").min = state.summary.days[0] || "";
  $("#next").disabled = state.date >= todayIso();
  $("#prev").disabled = state.date <= (state.summary.days[0] || state.date);
  $("#today").disabled = state.date === todayIso();
  $("#datenav").style.visibility = state.page === "data" ? "hidden" : "";
  $("#range-wrap").style.display = ["today", "data"].includes(state.page) ? "none" : "";
  document.querySelectorAll("#ranges button").forEach((b) => b.classList.toggle("on", b.dataset.r === state.range));
  const last = Object.values(state.meta.state || {}).sort().pop();
  $("#sync-sub").textContent = last ? `Last: ${dateLabel(last)}` : "";
}

let renderToken = 0;
async function render() {
  updateShell();
  const token = ++renderToken;
  const content = $("#content");
  // Fetch first while the previous view stays put (dimmed), then render in one go:
  // charts measure their container, so they must draw into the live DOM.
  content.classList.add("loading");
  try {
    if (!["trends", "data"].includes(state.page)) await loadDay(state.date);
  } catch { /* the page shows its own empty state */ }
  if (token !== renderToken) return;
  content.classList.remove("loading");
  try {
    await pages[state.page](content);
  } catch (err) {
    console.error(err);
    content.innerHTML = `<div class="card empty-state"><div class="headline">Something went wrong</div><p>${esc(err.message)}</p></div>`;
  }
}

function go(patch, replace = false) {
  Object.assign(state, patch);
  store.set("range", state.range);
  const hash = `#/${state.page}/${state.date}/${state.range}`;
  if (replace) history.replaceState(null, "", hash);
  else if (location.hash !== hash) history.pushState(null, "", hash);
  render();
}

function readHash() {
  const [, page, date, range] = location.hash.split("/");
  if (page && pages[page]) state.page = page;
  if (/^\d{4}-\d{2}-\d{2}$/.test(date || "")) state.date = date;
  if (RANGES[range]) state.range = range;
}

async function sync() {
  const btn = $("#sync");
  if (btn.classList.contains("busy")) return;
  btn.classList.add("busy");
  toast("Syncing with Oura… (a login window opens if re-authorisation is needed)", 6000);
  try {
    const res = await api("/api/sync", { method: "POST" });
    await loadSummary();
    state.dayCache.clear();
    toast(res.ok ? "Sync complete" : "Sync finished with errors — see the Data page");
    render();
  } catch (e) {
    toast(`Sync failed: ${e.message}`);
  } finally {
    btn.classList.remove("busy");
  }
}

async function loadSummary() {
  state.summary = await api("/api/summary");
  state.index = new Map(state.summary.days.map((d, i) => [d, i]));
  try { state.meta = await api("/api/meta"); } catch { state.meta = {}; }
}

function bindShell() {
  $("#prev").addEventListener("click", () => go({ date: addDays(state.date, -1) }));
  $("#next").addEventListener("click", () => go({ date: addDays(state.date, 1) }));
  $("#today").addEventListener("click", () => go({ date: todayIso() }));
  $("#date-input").addEventListener("change", (e) => e.target.value && go({ date: e.target.value }));
  $("#ranges").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) go({ range: b.dataset.r }); });
  $("#sync").addEventListener("click", sync);
  window.addEventListener("hashchange", () => { readHash(); render(); });
  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input, select, textarea") || e.metaKey || e.ctrlKey || e.altKey) return;
    const navPages = PAGES.filter((p) => !p.sep);
    if (e.key === "ArrowLeft" && !$("#prev").disabled) go({ date: addDays(state.date, -1) });
    else if (e.key === "ArrowRight" && !$("#next").disabled) go({ date: addDays(state.date, 1) });
    else if (e.key === "t") go({ date: todayIso() });
    else if (/^[1-9]$/.test(e.key) && navPages[+e.key - 1]) go({ page: navPages[+e.key - 1].id });
  });
}

async function init() {
  renderShell();
  bindShell();
  await loadSummary();
  const days = state.summary.days;
  state.date = days.includes(todayIso()) ? todayIso() : days[days.length - 1] || todayIso();
  state.range = store.get("range", "1M");
  readHash();
  go({}, true);
  // Heartbeat: the server exits a couple of minutes after the last window closes
  setInterval(() => fetch("/api/ping").catch(() => {}), 30_000);
}

init();
