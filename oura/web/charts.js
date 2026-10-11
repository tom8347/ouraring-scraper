// Small SVG chart kit for the dashboard: line, bars, stacked bars, range bars,
// hypnogram, activity strip, scatter, sparkline, ring and arc gauge.
// Every chart re-renders on resize and ships a hover tooltip.

const NS = "http://www.w3.org/2000/svg";
const DAY = 86400000;
const M = { top: 14, right: 14, bottom: 28, left: 44 };

export function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function css(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}
export const color = (c) => (c && c.startsWith("--") ? css(c) : c);

// ── Mounting & resize ────────────────────────────────────────────────

const observers = new WeakMap();

function mount(host, height, render) {
  host.classList.add("chart");
  const draw = () => {
    const w = Math.max(120, Math.floor(host.clientWidth));
    host.replaceChildren();
    const svg = el("svg", { width: w, height, viewBox: `0 0 ${w} ${height}` }, host);
    render(svg, w, height);
  };
  draw();
  observers.get(host)?.disconnect();
  let last = host.clientWidth;
  const ro = new ResizeObserver(() => {
    if (Math.abs(host.clientWidth - last) < 2) return;
    last = host.clientWidth;
    requestAnimationFrame(draw);
  });
  ro.observe(host);
  observers.set(host, ro);
}

function emptyState(svg, w, h, text = "No data for this period") {
  el("text", { x: w / 2, y: h / 2, "text-anchor": "middle", class: "empty" }, svg).textContent = text;
}

// ── Scales & ticks ───────────────────────────────────────────────────

function linear(d0, d1, r0, r1) {
  const k = d1 === d0 ? 0 : (r1 - r0) / (d1 - d0);
  const f = (v) => r0 + (v - d0) * k;
  f.invert = (p) => d0 + (p - r0) / (k || 1);
  return f;
}

export function niceTicks(min, max, count = 4) {
  if (min === max) { min -= 1; max += 1; }
  const raw = (max - min) / count;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const err = raw / pow;
  const step = pow * (err >= 7.5 ? 10 : err >= 3.5 ? 5 : err >= 1.5 ? 2 : 1);
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(+v.toFixed(10));
  return { lo, hi, ticks, step };
}

function extent(arrays, opts = {}) {
  let min = Infinity, max = -Infinity;
  for (const a of arrays) for (const v of a) if (v != null && isFinite(v)) { if (v < min) min = v; if (v > max) max = v; }
  if (min === Infinity) return null;
  if (opts.zero) { min = Math.min(0, min); max = Math.max(0, max); }
  if (opts.yMin != null) min = Math.min(opts.yMin, min);
  if (opts.yMax != null) max = Math.max(opts.yMax, max);
  if (!opts.zero && opts.yMin == null) {
    const pad = (max - min || Math.abs(max) || 1) * 0.08;
    // Don't let padding push a non-negative metric below zero
    min = min >= 0 ? Math.max(0, min - pad) : min - pad;
    max += pad;
  }
  return [min, max];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayTicks(x0, x1, width) {
  const span = (x1 - x0) / DAY + 1;
  const max = Math.max(2, Math.floor(width / 78));
  const out = [];
  const start = new Date(x0);
  if (span / 1 <= max) {
    for (let t = x0; t <= x1; t += DAY) out.push([t, span <= 8 ? `${WD[new Date(t).getDay()]} ${new Date(t).getDate()}` : `${new Date(t).getDate()} ${MONTHS[new Date(t).getMonth()]}`]);
    return out;
  }
  for (const step of [2, 7, 14]) {
    if (span / step <= max) {
      const d = new Date(start);
      if (step >= 7) while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
      for (; +d <= x1; d.setDate(d.getDate() + step)) out.push([+d, `${d.getDate()} ${MONTHS[d.getMonth()]}`]);
      return out;
    }
  }
  for (const step of [1, 2, 3, 6]) {
    if (span / (30.4 * step) <= max) {
      const d = new Date(start.getFullYear(), start.getMonth() + 1, 1);
      for (; +d <= x1; d.setMonth(d.getMonth() + step)) {
        out.push([+d, d.getMonth() === 0 ? `${MONTHS[0]} ${String(d.getFullYear()).slice(2)}` : MONTHS[d.getMonth()]]);
      }
      return out;
    }
  }
  return out;
}

function timeTicks(x0, x1, width) {
  const max = Math.max(2, Math.floor(width / 64));
  const hours = (x1 - x0) / 3600000;
  const step = [1, 2, 3, 4, 6, 12].find((s) => hours / s <= max) || 24;
  const d = new Date(x0);
  d.setMinutes(0, 0, 0);
  while (+d < x0 || d.getHours() % step) d.setHours(d.getHours() + 1);
  const out = [];
  for (; +d <= x1; d.setHours(d.getHours() + step)) out.push([+d, fmtClock(+d)]);
  return out;
}

export function fmtClock(t) {
  const d = new Date(t);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function fmtDay(t, long = false) {
  const d = new Date(t);
  return long
    ? d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

// ── Tooltip ──────────────────────────────────────────────────────────

let tipEl;
function tip() {
  if (!tipEl) {
    tipEl = document.createElement("div");
    tipEl.className = "tooltip";
    document.body.appendChild(tipEl);
  }
  return tipEl;
}

/** rows: [{color, value, label, box}] — built with textContent (labels can be data). */
export function showTip(evt, head, rows) {
  const t = tip();
  t.replaceChildren();
  if (head) {
    const h = document.createElement("div");
    h.className = "tt-head";
    h.textContent = head;
    t.appendChild(h);
  }
  for (const r of rows) {
    const row = document.createElement("div");
    row.className = "tt-row";
    if (r.color) {
      const i = document.createElement("i");
      if (r.box) i.className = "box";
      i.style.background = color(r.color);
      row.appendChild(i);
    }
    const b = document.createElement("b");
    b.textContent = r.value;
    row.appendChild(b);
    if (r.label) {
      const s = document.createElement("span");
      s.textContent = r.label;
      row.appendChild(s);
    }
    t.appendChild(row);
  }
  t.classList.add("show");
  const pad = 14;
  const { innerWidth: W, innerHeight: H } = window;
  const r = t.getBoundingClientRect();
  let x = evt.clientX + pad, y = evt.clientY + pad;
  if (x + r.width > W - 8) x = evt.clientX - r.width - pad;
  if (y + r.height > H - 8) y = evt.clientY - r.height - pad;
  t.style.left = `${x}px`;
  t.style.top = `${y}px`;
}
export function hideTip() { tipEl?.classList.remove("show"); }

// ── Shared pieces ────────────────────────────────────────────────────

function yAxis(svg, y, ticks, x0, x1, fmt) {
  const g = el("g", { class: "grid" }, svg);
  for (const v of ticks) {
    const py = Math.round(y(v)) + 0.5;
    el("line", { x1: x0, x2: x1, y1: py, y2: py }, g);
    el("text", { x: x0 - 8, y: py + 3.5, "text-anchor": "end", class: "axis-label" }, svg).textContent = fmt(v);
  }
}

function xAxis(svg, x, ticks, y0) {
  let lastRight = -Infinity;
  for (const [t, label] of ticks) {
    const px = x(t);
    const approx = label.length * 6.2;
    if (px - approx / 2 < lastRight + 6) continue;
    el("text", { x: px, y: y0 + 18, "text-anchor": "middle", class: "axis-label" }, svg).textContent = label;
    lastRight = px + approx / 2;
  }
}

function linePath(xs, ys, x, y, gapMs) {
  let d = "", pen = false, prevX = null;
  for (let i = 0; i < xs.length; i++) {
    const v = ys[i];
    if (v == null || !isFinite(v)) { pen = false; continue; }
    if (gapMs && prevX != null && xs[i] - prevX > gapMs) pen = false;
    d += `${pen ? "L" : "M"}${x(xs[i]).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
    prevX = xs[i];
  }
  return d;
}

function areaPaths(xs, ys, x, y, base, gapMs) {
  const out = [];
  let seg = [];
  const flush = () => {
    if (seg.length > 1) {
      const top = seg.map(([px, py]) => `${px.toFixed(1)},${py.toFixed(1)}`).join("L");
      out.push(`M${seg[0][0].toFixed(1)},${base}L${top}L${seg[seg.length - 1][0].toFixed(1)},${base}Z`);
    }
    seg = [];
  };
  let prevX = null;
  for (let i = 0; i < xs.length; i++) {
    const v = ys[i];
    if (v == null || !isFinite(v) || (gapMs && prevX != null && xs[i] - prevX > gapMs)) flush();
    if (v != null && isFinite(v)) { seg.push([x(xs[i]), y(v)]); prevX = xs[i]; }
  }
  flush();
  return out;
}

function nearestIndex(xs, t) {
  let lo = 0, hi = xs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] < t) lo = mid; else hi = mid;
  }
  return Math.abs(xs[lo] - t) <= Math.abs(xs[hi] - t) ? lo : hi;
}

function roundedTop(x, y, w, h, r) {
  r = Math.min(r, w / 2, h);
  if (h <= 0) return "";
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

let gradId = 0;

// ── Line chart ───────────────────────────────────────────────────────

/**
 * opts: { x:[ms], series:[{label, values, color, faint, area}], height, kind:"day"|"time",
 *         fmt(v), yMin, yMax, zero, bands:[{from,to,label,color}], refs:[{y,label}], gap(ms),
 *         head(x) -> tooltip header, onHover(i), sync }
 */
export function line(host, opts) {
  const height = opts.height || 220;
  const fmt = opts.fmt || ((v) => `${Math.round(v)}`);
  mount(host, height, (svg, w, h) => {
    const xs = opts.x;
    const ext = extent(opts.series.map((s) => s.values), opts);
    if (!xs.length || !ext) return emptyState(svg, w, h, opts.empty);
    const { lo, hi, ticks } = niceTicks(ext[0], ext[1], opts.ticks || 4);
    const x0 = M.left, x1 = w - M.right, y0 = h - M.bottom, y1 = M.top;
    const xmin = opts.xMin ?? xs[0], xmax = opts.xMax ?? xs[xs.length - 1];
    const x = linear(xmin, xmax === xmin ? xmin + 1 : xmax, x0, x1);
    const y = linear(opts.yMin != null && !opts.zero ? Math.min(opts.yMin, lo) : lo, hi, y0, y1);

    for (const b of opts.bands || []) {
      const bx0 = Math.max(x0, x(b.from)), bx1 = Math.min(x1, x(b.to));
      if (bx1 <= bx0) continue;
      el("rect", { x: bx0, y: y1, width: bx1 - bx0, height: y0 - y1, fill: color(b.color || "--surface-3"), opacity: b.opacity ?? 0.55, rx: 6 }, svg);
      if (b.label && bx1 - bx0 > 40) el("text", { x: bx0 + 8, y: y1 + 14, class: "band-label" }, svg).textContent = b.label;
    }

    yAxis(svg, y, ticks, x0, x1, fmt);
    xAxis(svg, x, opts.kind === "time" ? timeTicks(xmin, xmax, x1 - x0) : dayTicks(xmin, xmax, x1 - x0), y0);

    for (const r of opts.refs || []) {
      const py = y(r.y);
      el("line", { x1: x0, x2: x1, y1: py, y2: py, stroke: color("--text-3"), "stroke-width": 1, "stroke-dasharray": "2 4" }, svg);
      if (r.label) el("text", { x: x0 + 6, y: py - 5, class: "axis-label" }, svg).textContent = r.label;
    }

    for (const s of opts.series) {
      const c = color(s.color);
      if (s.area) {
        const id = `g${++gradId}`;
        const grad = el("linearGradient", { id, x1: 0, x2: 0, y1: 0, y2: 1 }, el("defs", {}, svg));
        el("stop", { offset: "0%", "stop-color": c, "stop-opacity": 0.22 }, grad);
        el("stop", { offset: "100%", "stop-color": c, "stop-opacity": 0 }, grad);
        for (const d of areaPaths(xs, s.values, x, y, y0, opts.gap)) el("path", { d, fill: `url(#${id})` }, svg);
      }
      el("path", {
        d: linePath(xs, s.values, x, y, opts.gap), fill: "none", stroke: c,
        "stroke-width": s.faint ? 1.25 : 2, "stroke-opacity": s.faint ? 0.4 : 1,
        "stroke-linejoin": "round", "stroke-linecap": "round",
      }, svg);
      // Isolated points (no neighbours) would be invisible as a path: draw them as dots
      s.values.forEach((v, i) => {
        if (v == null || s.faint) return;
        const prev = s.values[i - 1], next = s.values[i + 1];
        if (prev == null && next == null) el("circle", { cx: x(xs[i]), cy: y(v), r: 2.5, fill: c }, svg);
      });
    }

    // End label on the main series
    const main = opts.series.find((s) => !s.faint);
    if (main && opts.endLabel !== false) {
      for (let i = xs.length - 1; i >= 0; i--) {
        if (main.values[i] != null) {
          el("circle", { cx: x(xs[i]), cy: y(main.values[i]), r: 4, fill: color(main.color), stroke: color("--surface"), "stroke-width": 2 }, svg);
          break;
        }
      }
    }

    // Hover layer
    const cross = el("line", { class: "crosshair", y1: y1, y2: y0, visibility: "hidden" }, svg);
    const dots = opts.series.map((s) => el("circle", { r: 4, fill: color(s.color), stroke: color("--surface"), "stroke-width": 2, visibility: "hidden" }, svg));
    const hit = el("rect", { class: "hit", x: x0, y: y1, width: x1 - x0, height: y0 - y1 }, svg);
    const head = opts.head || ((t) => (opts.kind === "time" ? fmtClock(t) : fmtDay(t, true)));
    hit.addEventListener("pointermove", (e) => {
      const rect = svg.getBoundingClientRect();
      const i = nearestIndex(xs, x.invert(e.clientX - rect.left));
      const px = x(xs[i]);
      cross.setAttribute("x1", px); cross.setAttribute("x2", px); cross.setAttribute("visibility", "visible");
      const rows = [];
      opts.series.forEach((s, k) => {
        const v = s.values[i];
        if (v == null) { dots[k].setAttribute("visibility", "hidden"); return; }
        dots[k].setAttribute("cx", px); dots[k].setAttribute("cy", y(v)); dots[k].setAttribute("visibility", "visible");
        rows.push({ color: s.color, value: (s.fmt || fmt)(v), label: s.label });
      });
      if (!rows.length) rows.push({ value: "No data" });
      showTip(e, head(xs[i]), rows);
    });
    hit.addEventListener("pointerleave", () => {
      cross.setAttribute("visibility", "hidden");
      dots.forEach((d) => d.setAttribute("visibility", "hidden"));
      hideTip();
    });
  });
}

// ── Bars (one value per day) ─────────────────────────────────────────

/** opts: { x:[ms], values, color, height, fmt, target, label, colorFn(v,i), xMin, xMax } */
export function bars(host, opts) {
  stacked(host, {
    ...opts,
    stacks: [{ label: opts.label, values: opts.values, color: opts.color, colorFn: opts.colorFn }],
  });
}

/** opts: { x:[ms], stacks:[{label, values, color}], height, fmt, target, total(i) } */
export function stacked(host, opts) {
  const height = opts.height || 220;
  const fmt = opts.fmt || ((v) => Math.round(v).toLocaleString());
  mount(host, height, (svg, w, h) => {
    const xs = opts.x;
    const totals = xs.map((_, i) => opts.stacks.reduce((a, s) => a + (s.values[i] || 0), 0));
    const has = xs.map((_, i) => opts.stacks.some((s) => s.values[i] != null));
    if (!xs.length || !has.some(Boolean)) return emptyState(svg, w, h, opts.empty);
    const maxV = Math.max(...totals, opts.target || 0);
    const { hi, ticks } = niceTicks(0, maxV || 1, 4);
    const x0 = M.left, x1 = w - M.right, y0 = h - M.bottom, y1 = M.top;
    const n = Math.round((xs[xs.length - 1] - xs[0]) / DAY) + 1;
    const band = (x1 - x0) / n;
    const bw = Math.max(1, Math.min(24, band - (band > 4 ? 2 : 0.5)));
    const x = (t) => x0 + ((t - xs[0]) / DAY + 0.5) * band;
    const y = linear(0, hi, y0, y1);

    yAxis(svg, y, ticks, x0, x1, opts.axisFmt || ((v) => compact(v)));
    xAxis(svg, x, dayTicks(xs[0], xs[xs.length - 1], x1 - x0), y0);

    if (opts.target) {
      const py = y(opts.target);
      el("line", { x1: x0, x2: x1, y1: py, y2: py, stroke: color("--text-2"), "stroke-width": 1, "stroke-dasharray": "2 4" }, svg);
      el("text", { x: x1, y: py - 5, "text-anchor": "end", class: "axis-label" }, svg).textContent = `Goal ${compact(opts.target)}`;
    }

    const gap = bw >= 6 ? 2 : 0;
    const groups = [];
    xs.forEach((t, i) => {
      if (!has[i]) return;
      const g = el("g", {}, svg);
      let base = y0;
      const segs = opts.stacks.map((s, k) => ({ s, k, v: s.values[i] || 0 })).filter((o) => o.v > 0);
      segs.forEach(({ s, v }, j) => {
        const top = y(y.invert(base) + v);
        const isTop = j === segs.length - 1;
        const hh = base - top - (isTop ? 0 : gap);
        if (hh <= 0) { base = top; return; }
        const fill = color(s.colorFn ? s.colorFn(v, i) : s.color);
        if (isTop && bw >= 6) el("path", { d: roundedTop(x(t) - bw / 2, top, bw, hh, 4), fill }, g);
        else el("rect", { x: x(t) - bw / 2, y: isTop ? top : top + gap, width: bw, height: hh, fill }, g);
        base = top;
      });
      groups.push([g, i]);
    });

    const hits = el("g", {}, svg);
    for (const [g, i] of groups) {
      const r = el("rect", { class: "bar-hit", x: x(xs[i]) - band / 2, y: y1, width: band, height: y0 - y1 }, hits);
      r.addEventListener("pointermove", (e) => {
        g.style.filter = "brightness(1.25)";
        const rows = opts.stacks.filter((s) => s.values[i] != null)
          .map((s) => ({ color: s.colorFn ? s.colorFn(s.values[i], i) : s.color, box: true, value: fmt(s.values[i]), label: s.label }))
          .reverse();
        if (opts.stacks.length > 1) rows.unshift({ value: fmt(totals[i]), label: "Total" });
        showTip(e, fmtDay(xs[i], true), rows);
      });
      r.addEventListener("pointerleave", () => { g.style.filter = ""; hideTip(); });
    }
  });
}

// ── Floating range bars (e.g. bedtime → wake time) ───────────────────

/** opts: { x:[ms], lo:[hours], hi:[hours], color, height } — hours may exceed 24 (after midnight) */
export function rangeBars(host, opts) {
  const height = opts.height || 240;
  mount(host, height, (svg, w, h) => {
    const xs = opts.x;
    const valid = xs.map((_, i) => opts.lo[i] != null && opts.hi[i] != null);
    if (!valid.some(Boolean)) return emptyState(svg, w, h);
    // hi values are morning clock hours → add 24 so the bar runs downward from bedtime
    const his = opts.hi.map((v) => (v == null ? null : v + 24));
    const lo = Math.floor(Math.min(...opts.lo.filter((v) => v != null)));
    const hi = Math.ceil(Math.max(...his.filter((v) => v != null)));
    const x0 = M.left, x1 = w - M.right, y0 = h - M.bottom, y1 = M.top;
    const n = Math.round((xs[xs.length - 1] - xs[0]) / DAY) + 1;
    const band = (x1 - x0) / n;
    const bw = Math.max(1.5, Math.min(14, band - 2));
    const x = (t) => x0 + ((t - xs[0]) / DAY + 0.5) * band;
    const y = linear(lo, hi, y1, y0);
    const step = hi - lo > 8 ? 2 : 1;
    const ticks = [];
    for (let v = lo; v <= hi; v += step) ticks.push(v);
    const clock = (v) => `${String(Math.floor(v % 24)).padStart(2, "0")}:${String(Math.round((v % 1) * 60)).padStart(2, "0")}`;
    yAxis(svg, y, ticks, x0, x1, (v) => clock(v));
    xAxis(svg, x, dayTicks(xs[0], xs[xs.length - 1], x1 - x0), y0);
    const c = color(opts.color);
    xs.forEach((t, i) => {
      if (!valid[i]) return;
      const top = y(opts.lo[i]), bot = y(his[i]);
      const r = el("rect", { x: x(t) - bw / 2, y: top, width: bw, height: Math.max(2, bot - top), rx: Math.min(4, bw / 2), fill: c }, svg);
      const hit = el("rect", { class: "bar-hit", x: x(t) - band / 2, y: y1, width: band, height: y0 - y1 }, svg);
      hit.addEventListener("pointermove", (e) => {
        r.style.filter = "brightness(1.3)";
        showTip(e, fmtDay(t, true), [
          { color: opts.color, box: true, value: clock(opts.lo[i]), label: "Bedtime" },
          { color: opts.color, box: true, value: clock(opts.hi[i]), label: "Wake up" },
        ]);
      });
      hit.addEventListener("pointerleave", () => { r.style.filter = ""; hideTip(); });
    });
  });
}

// ── Hypnogram ────────────────────────────────────────────────────────

const STAGES = { 4: ["Awake", "--stage-awake", 0], 3: ["REM", "--stage-rem", 1], 2: ["Light", "--stage-light", 2], 1: ["Deep", "--stage-deep", 3] };

/** opts: { start: ms, phases: "4422111…" (5-minute codes), height } */
export function hypnogram(host, opts) {
  const height = opts.height || 230;
  mount(host, height, (svg, w, h) => {
    const codes = [...(opts.phases || "")].map(Number);
    if (!codes.length) return emptyState(svg, w, h, "No sleep stages recorded");
    const step = 300000;
    const x0 = 58, x1 = w - M.right, y0 = h - M.bottom, y1 = M.top;
    const xs0 = opts.start, xs1 = opts.start + codes.length * step;
    const x = linear(xs0, xs1, x0, x1);
    const rowH = (y0 - y1) / 4;
    const rowY = (lvl) => y1 + lvl * rowH + rowH / 2;
    const barH = Math.min(26, rowH * 0.62);

    const g = el("g", { class: "grid" }, svg);
    Object.values(STAGES).forEach(([name, , lvl]) => {
      const py = Math.round(rowY(lvl)) + 0.5;
      el("line", { x1: x0, x2: x1, y1: py, y2: py }, g);
      el("text", { x: 0, y: py + 4, class: "axis-label" }, svg).textContent = name;
    });
    xAxis(svg, x, timeTicks(xs0, xs1, x1 - x0), y0);

    // Merge consecutive equal codes into runs
    const runs = [];
    codes.forEach((c, i) => {
      const last = runs[runs.length - 1];
      if (last && last.c === c) last.n++;
      else runs.push({ c, i, n: 1 });
    });

    // Connectors first, so blocks sit on top
    const conn = el("g", { stroke: color("--text-3"), "stroke-width": 1.25, "stroke-opacity": 0.5 }, svg);
    for (let k = 1; k < runs.length; k++) {
      const a = STAGES[runs[k - 1].c], b = STAGES[runs[k].c];
      if (!a || !b) continue;
      const px = x(xs0 + runs[k].i * step);
      el("line", { x1: px, x2: px, y1: rowY(a[2]), y2: rowY(b[2]) }, conn);
    }

    const blocks = el("g", {}, svg);
    for (const r of runs) {
      const s = STAGES[r.c];
      if (!s) continue;
      const bx = x(xs0 + r.i * step), bw = Math.max(1.5, x(xs0 + (r.i + r.n) * step) - bx);
      const rect = el("rect", { x: bx, y: rowY(s[2]) - barH / 2, width: bw, height: barH, rx: Math.min(4, bw / 2), fill: color(s[1]) }, blocks);
      const hit = el("rect", { class: "bar-hit", x: bx, y: y1, width: bw, height: y0 - y1 }, svg);
      hit.addEventListener("pointermove", (e) => {
        rect.style.filter = "brightness(1.25)";
        const from = xs0 + r.i * step, to = from + r.n * step;
        showTip(e, `${fmtClock(from)} – ${fmtClock(to)}`, [{ color: s[1], box: true, value: s[0], label: `${r.n * 5} min` }]);
      });
      hit.addEventListener("pointerleave", () => { rect.style.filter = ""; hideTip(); });
    }
  });
}

// ── Activity intensity strip ─────────────────────────────────────────

const ACT = {
  0: ["Non-wear", null, 0], 1: ["Rest", "--surface-3", 0.12], 2: ["Inactive", "--surface-3", 0.24],
  3: ["Low", "--act-low", 0.5], 4: ["Medium", "--act-med", 0.75], 5: ["High", "--act-high", 1],
};

/** opts: { start: ms, codes: "1112223…" (5-minute classes), height } */
export function activityStrip(host, opts) {
  const height = opts.height || 150;
  mount(host, height, (svg, w, h) => {
    const codes = [...(opts.codes || "")].map(Number);
    if (!codes.length) return emptyState(svg, w, h, "No activity recorded");
    const step = 300000;
    const x0 = 8, x1 = w - 8, y0 = h - M.bottom, y1 = 8;
    const t0 = opts.start, t1 = t0 + codes.length * step;
    const x = linear(t0, t1, x0, x1);
    const bw = Math.max(1, (x1 - x0) / codes.length - 1);
    xAxis(svg, x, timeTicks(t0, t1, x1 - x0), y0);
    el("line", { x1: x0, x2: x1, y1: y0 + 0.5, y2: y0 + 0.5, stroke: color("--grid") }, svg);
    const g = el("g", {}, svg);
    codes.forEach((c, i) => {
      const a = ACT[c];
      if (!a || !a[1]) return;
      const hh = Math.max(2, (y0 - y1) * a[2]);
      el("path", { d: roundedTop(x(t0 + i * step), y0 - hh, bw, hh, bw >= 4 ? 2 : 0), fill: color(a[1]) }, g);
    });
    const hit = el("rect", { class: "hit", x: x0, y: y1, width: x1 - x0, height: y0 - y1 }, svg);
    hit.addEventListener("pointermove", (e) => {
      const rect = svg.getBoundingClientRect();
      const i = Math.max(0, Math.min(codes.length - 1, Math.floor((x.invert(e.clientX - rect.left) - t0) / step)));
      const a = ACT[codes[i]] || ACT[0];
      showTip(e, `${fmtClock(t0 + i * step)} – ${fmtClock(t0 + (i + 1) * step)}`, [{ color: a[1] || "--text-3", box: true, value: a[0] }]);
    });
    hit.addEventListener("pointerleave", hideTip);
  });
}

// ── Scatter ──────────────────────────────────────────────────────────

/** opts: { xs:[], ys:[], labels:[], color, xLabel, yLabel, fx, fy, height } */
export function scatter(host, opts) {
  const height = opts.height || 340;
  mount(host, height, (svg, w, h) => {
    const pts = opts.xs.map((v, i) => [v, opts.ys[i], i]).filter(([a, b]) => a != null && b != null);
    if (pts.length < 3) return emptyState(svg, w, h, "Not enough overlapping days");
    const ex = extent([pts.map((p) => p[0])]), ey = extent([pts.map((p) => p[1])]);
    const tx = niceTicks(ex[0], ex[1], 5), ty = niceTicks(ey[0], ey[1], 4);
    const x0 = M.left + 6, x1 = w - M.right, y0 = h - M.bottom - 14, y1 = M.top;
    const x = linear(tx.lo, tx.hi, x0, x1), y = linear(ty.lo, ty.hi, y0, y1);
    yAxis(svg, y, ty.ticks, x0, x1, opts.fy);
    tx.ticks.forEach((v) => {
      el("text", { x: x(v), y: y0 + 18, "text-anchor": "middle", class: "axis-label" }, svg).textContent = opts.fx(v);
    });
    el("text", { x: (x0 + x1) / 2, y: h - 2, "text-anchor": "middle", class: "axis-label" }, svg).textContent = opts.xLabel;

    // Least-squares trend line
    const n = pts.length;
    const mx = pts.reduce((a, p) => a + p[0], 0) / n, my = pts.reduce((a, p) => a + p[1], 0) / n;
    const sxy = pts.reduce((a, p) => a + (p[0] - mx) * (p[1] - my), 0);
    const sxx = pts.reduce((a, p) => a + (p[0] - mx) ** 2, 0);
    if (sxx > 0) {
      const k = sxy / sxx, b = my - k * mx;
      el("line", { x1: x(tx.lo), y1: y(k * tx.lo + b), x2: x(tx.hi), y2: y(k * tx.hi + b), stroke: color("--text-2"), "stroke-width": 1.5, "stroke-dasharray": "4 4" }, svg);
    }

    const c = color(opts.color);
    const dots = pts.map(([a, b]) => el("circle", { cx: x(a), cy: y(b), r: 4.5, fill: c, "fill-opacity": 0.75, stroke: color("--surface"), "stroke-width": 1.5 }, svg));
    const hit = el("rect", { class: "hit", x: x0, y: y1, width: x1 - x0, height: y0 - y1 }, svg);
    let active = null;
    hit.addEventListener("pointermove", (e) => {
      const rect = svg.getBoundingClientRect();
      const mxp = e.clientX - rect.left, myp = e.clientY - rect.top;
      let best = -1, bd = Infinity;
      pts.forEach(([a, b], k) => {
        const d = (x(a) - mxp) ** 2 + (y(b) - myp) ** 2;
        if (d < bd) { bd = d; best = k; }
      });
      if (active) active.setAttribute("r", 4.5);
      if (best < 0 || bd > 40 * 40) { hideTip(); return; }
      active = dots[best];
      active.setAttribute("r", 7);
      const [a, b, i] = pts[best];
      showTip(e, opts.labels[i], [
        { value: opts.fx(a), label: opts.xLabel },
        { value: opts.fy(b), label: opts.yLabel },
      ]);
    });
    hit.addEventListener("pointerleave", () => { if (active) active.setAttribute("r", 4.5); hideTip(); });
  });
}

// ── Sparkline (stat tiles; no axes, no hover) ────────────────────────

export function spark(host, values, c, height = 56) {
  mount(host, height, (svg, w, h) => {
    const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null);
    if (pts.length < 2) return;
    const ex = extent([values]);
    const x = linear(0, values.length - 1, 0, w), y = linear(ex[0], ex[1], h - 6, 6);
    const xs = values.map((_, i) => i);
    const id = `s${++gradId}`;
    const grad = el("linearGradient", { id, x1: 0, x2: 0, y1: 0, y2: 1 }, el("defs", {}, svg));
    el("stop", { offset: "0%", "stop-color": color(c), "stop-opacity": 0.25 }, grad);
    el("stop", { offset: "100%", "stop-color": color(c), "stop-opacity": 0 }, grad);
    for (const d of areaPaths(xs, values, x, y, h)) el("path", { d, fill: `url(#${id})` }, svg);
    el("path", { d: linePath(xs, values, x, y), fill: "none", stroke: color(c), "stroke-width": 2, "stroke-linecap": "round", "stroke-linejoin": "round" }, svg);
    const [li, lv] = pts[pts.length - 1];
    el("circle", { cx: x(li), cy: y(lv), r: 4, fill: color(c), stroke: color("--surface"), "stroke-width": 2 }, svg);
  });
}

// ── Ring & arc gauge (static SVG strings) ────────────────────────────

export function ring(frac, c, size = 76, stroke = 4) {
  const r = (size - stroke) / 2 - 1, C = 2 * Math.PI * r;
  const f = Math.max(0, Math.min(1, frac || 0));
  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="rgba(224,222,244,.1)" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color(c)}" stroke-width="${stroke}"
      stroke-linecap="round" stroke-dasharray="${(C * f).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

/** Oura-style arc: 0–100 along a wide arc, with tick dots and a knob at the score. */
export function arcGauge(score) {
  // A shallow arc (160° → 20°) like the Oura home screen
  const W = 480, H = 210, cx = W / 2, r = 230, cy = 262;
  const a0 = (160 * Math.PI) / 180, a1 = (20 * Math.PI) / 180;
  const pt = (f) => {
    const a = a0 + (a1 - a0) * f;
    return [+(cx + r * Math.cos(a)).toFixed(1), +(cy - r * Math.sin(a)).toFixed(1)];
  };
  const f = Math.max(0, Math.min(1, (score || 0) / 100));
  const [sx, sy] = pt(0), [ex, ey] = pt(1), [kx, ky] = pt(f);
  const dots = [0.25, 0.5, 0.75].map((t) => { const [x, y] = pt(t); return `<circle cx="${x}" cy="${y}" r="2.5" fill="rgba(224,222,244,.45)"/>`; }).join("");
  return `<svg viewBox="0 0 ${W} ${H}">
    <defs><linearGradient id="arcg" x1="0" x2="1"><stop offset="0" stop-color="rgba(224,222,244,.2)"/><stop offset="1" stop-color="#e0def4"/></linearGradient>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter></defs>
    <path d="M${sx},${sy} A${r},${r} 0 0 1 ${ex},${ey}" fill="none" stroke="rgba(224,222,244,.1)" stroke-width="5" stroke-linecap="round"/>
    ${score != null ? `<path d="M${sx},${sy} A${r},${r} 0 0 1 ${kx},${ky}" fill="none" stroke="url(#arcg)" stroke-width="5" stroke-linecap="round"/>` : ""}
    ${dots}
    <text x="${sx - 6}" y="${sy + 18}" fill="#6e6a86" font-size="11" text-anchor="middle">0</text>
    <text x="${ex + 6}" y="${ey + 18}" fill="#6e6a86" font-size="11" text-anchor="middle">100</text>
    ${score != null ? `<circle cx="${kx}" cy="${ky}" r="13" fill="#e0def4" opacity=".35" filter="url(#glow)"/><circle cx="${kx}" cy="${ky}" r="7" fill="#e0def4"/>` : ""}
  </svg>`;
}

export function compact(v) {
  const a = Math.abs(v);
  if (a >= 1e6) return `${+(v / 1e6).toFixed(1)}M`;
  if (a >= 1e4) return `${Math.round(v / 1e3)}K`;
  if (a >= 1e3) return `${+(v / 1e3).toFixed(1)}K`;
  return `${+v.toFixed(2)}`;
}
