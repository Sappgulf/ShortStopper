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

  const bars = values.map((v, i) => {
    const x = pad + i * bw;
    const bh = Math.round(((h - pad * 2) * v) / max);
    const y = h - pad - bh;
    return `<rect x="${x + 2}" y="${y}" width="${Math.max(2, bw - 4)}" height="${bh}" rx="3" />`;
  }).join("");

  const axis = `<line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="currentColor" opacity="0.25"/>`;

  svg.innerHTML = `
    <g fill="currentColor" opacity="0.9">${bars}</g>
    ${axis}
  `;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c])
  );
}

function renderTopChannels(tbody, channelTotals) {
  const rows = Object.entries(channelTotals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  tbody.innerHTML = rows.length
    ? rows.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td class="num">${v}</td></tr>`).join("")
    : `<tr><td class="muted" colspan="2">No channel data yet.</td></tr>`;
}

async function loadStats() {
  const res = await chrome.runtime.sendMessage({ type: "ns.getStats" });
  return res?.stats || { days: {} };
}

async function loadTotals() {
  const res = await chrome.runtime.sendMessage({ type: "ns.getTotals" });
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

