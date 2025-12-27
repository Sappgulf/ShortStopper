import { sendRuntimeMessage } from "../../../platform/chrome.js";

function todayKey() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function sum(arr) { return arr.reduce((a, b) => a + b, 0); }

function lastNDaysKeys(n) {
  const out = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setDate(d.getDate() - i);
    const yyyy = x.getFullYear();
    const mm = String(x.getMonth() + 1).padStart(2, "0");
    const dd = String(x.getDate()).padStart(2, "0");
    out.push(`${yyyy}-${mm}-${dd}`);
  }
  return out;
}

function getDayTotal(stats, day) {
  return stats?.days?.[day]?.total || 0;
}

function getDayChannels(stats, day) {
  return stats?.days?.[day]?.channels || {};
}

function renderChart(svg, values) {
  const w = 600, h = 160, pad = 18;
  const max = Math.max(1, ...values);
  const n = values.length;

  const bw = (w - pad * 2) / n;
  const svgNS = "http://www.w3.org/2000/svg";

  while (svg.firstChild) svg.removeChild(svg.firstChild);

  const g = document.createElementNS(svgNS, "g");
  g.setAttribute("fill", "currentColor");
  g.setAttribute("opacity", "0.9");

  values.forEach((v, i) => {
    const x = pad + i * bw;
    const bh = Math.round(((h - pad * 2) * v) / max);
    const y = h - pad - bh;
    const rect = document.createElementNS(svgNS, "rect");
    rect.setAttribute("x", String(x + 2));
    rect.setAttribute("y", String(y));
    rect.setAttribute("width", String(Math.max(2, bw - 4)));
    rect.setAttribute("height", String(bh));
    rect.setAttribute("rx", "3");
    g.appendChild(rect);
  });

  const axis = document.createElementNS(svgNS, "line");
  axis.setAttribute("x1", String(pad));
  axis.setAttribute("y1", String(h - pad));
  axis.setAttribute("x2", String(w - pad));
  axis.setAttribute("y2", String(h - pad));
  axis.setAttribute("stroke", "currentColor");
  axis.setAttribute("opacity", "0.25");

  svg.appendChild(g);
  svg.appendChild(axis);
}

const SOURCE_LABELS = {
  "site:youtube": "YouTube Shorts",
  "site:instagram": "Instagram Reels",
  "site:facebook": "Facebook Reels",
  "site:tiktok": "TikTok",
  "site:snapchat": "Snapchat Spotlight",
  "site:pinterest": "Pinterest Watch"
};

function formatSourceKey(key) {
  if (SOURCE_LABELS[key]) return SOURCE_LABELS[key];
  if (key.startsWith("site:")) return key.slice("site:".length);
  return key;
}

function renderTopChannels(tbody, channelTotals) {
  const rows = Object.entries(channelTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  tbody.textContent = "";
  if (!rows.length) {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.className = "muted";
    td.colSpan = 2;
    td.textContent = "No source data yet.";
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }

  rows.forEach(([k, v]) => {
    const tr = document.createElement("tr");
    const tdName = document.createElement("td");
    tdName.textContent = formatSourceKey(k);
    const tdValue = document.createElement("td");
    tdValue.className = "num";
    tdValue.textContent = String(v);
    tr.append(tdName, tdValue);
    tbody.appendChild(tr);
  });
}

async function loadStats() {
  const res = await sendRuntimeMessage({ type: "ns.getStats" });
  return res?.stats || { days: {} };
}

async function loadTotals() {
  const res = await sendRuntimeMessage({ type: "ns.getTotals" });
  return { blockedTotal: res?.blockedTotal ?? 0, blockedDate: res?.blockedDate ?? todayKey() };
}

async function refresh(days) {
  const [stats, totals] = await Promise.all([loadStats(), loadTotals()]);
  const keys = lastNDaysKeys(days);
  const values = keys.map((k) => getDayTotal(stats, k));

  document.getElementById("rangeNote").textContent = `Last ${days} days`;
  document.getElementById("topNote").textContent = `Last ${days} days`;

  document.getElementById("todayTotal").textContent = totals.blockedTotal;

  const last7 = lastNDaysKeys(7).map((k) => getDayTotal(stats, k));
  document.getElementById("weekTotal").textContent = sum(last7);

  let peakV = 0, peakD = "—";
  keys.forEach((k, i) => {
    if (values[i] > peakV) { peakV = values[i]; peakD = k; }
  });
  document.getElementById("peakTotal").textContent = peakV;
  document.getElementById("peakDate").textContent = peakD;

  renderChart(document.getElementById("chart"), values);

  const channelTotals = {};
  keys.forEach((k) => {
    const ch = getDayChannels(stats, k);
    for (const [ck, v] of Object.entries(ch)) {
      channelTotals[ck] = (channelTotals[ck] || 0) + v;
    }
  });
  renderTopChannels(document.getElementById("topChannels"), channelTotals);
}

document.getElementById("days").addEventListener("change", (e) => {
  refresh(parseInt(e.target.value, 10));
});

refresh(14);
