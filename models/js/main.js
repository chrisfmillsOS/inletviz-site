"use strict";

const PACIFIC_TZ = "America/Vancouver";

// ---------------------------------------------------------------------------
// Plotly base layout
// ---------------------------------------------------------------------------

const LAYOUT_BASE = {
  paper_bgcolor: "white",
  plot_bgcolor:  "#f8fafc",
  font:  { family: "Inter, system-ui, sans-serif", color: "#1a2530", size: 11 },
  margin: { t: 12, r: 20, b: 56, l: 60 },
  xaxis: {
    gridcolor: "#e8edf2", linecolor: "#dde3e9",
    tickfont: { size: 10, color: "#6b8090" }, zeroline: false,
  },
  yaxis: {
    gridcolor: "#e8edf2", linecolor: "#dde3e9",
    tickfont: { size: 10, color: "#6b8090" }, zeroline: false,
  },
  legend: {
    bgcolor: "rgba(255,255,255,0.9)", bordercolor: "#dde3e9",
    borderwidth: 1, font: { size: 10, color: "#1a2530" },
  },
  hoverlabel: { bgcolor: "#fff", bordercolor: "#0080a0", font: { color: "#1a2530", size: 11 } },
};

const CONFIG = {
  responsive: true,
  displayModeBar: true,
  modeBarButtonsToRemove: ["toImage", "sendDataToCloud"],
  displaylogo: false,
};

// ---------------------------------------------------------------------------
// Colour scales
// ---------------------------------------------------------------------------

const TURB_COLORSCALE = [
  [0.0, "#f0f7ff"], [0.15, "#b8d9f0"], [0.35, "#5ba8d8"],
  [0.6,  "#1e6fa8"], [0.8,  "#d4700a"], [1.0,  "#8b1a00"],
];
const CHL_COLORSCALE = [
  [0.0, "#f5fff0"], [0.2, "#b8e8a0"], [0.45, "#4caf50"],
  [0.7, "#1b6e20"], [0.9,  "#0a3d10"], [1.0,  "#001a05"],
];
const FRASER_COLORSCALE = [
  [0.0, "#f7fbff"], [0.2, "#c6dbef"], [0.4, "#6baed6"],
  [0.65,"#2171b5"], [0.85,"#08519c"], [1.0, "#08306b"],
];
const PHYTO_COLORSCALE = [
  [0.0, "#f7fcf5"], [0.2, "#c7e9c0"], [0.4, "#74c476"],
  [0.65,"#238b45"], [0.85,"#006d2c"], [1.0, "#00441b"],
];

const LAYER_COLORS = {
  surface_0_10:      "#0080a0",
  mid_20_40:         "#e07b00",
  near_bottom_40_50: "#b03010",
};
const LAYER_LABELS = {
  surface_0_10:      "Surface (0–10 m)",
  mid_20_40:         "Mid-water (20–40 m)",
  near_bottom_40_50: "Near-bottom (40–50 m)",
};

// ---------------------------------------------------------------------------
// Pacific time helpers
// ---------------------------------------------------------------------------

function fmtPacific(isoStr, opts = {}) {
  if (!isoStr) return "—";
  try { return new Date(isoStr).toLocaleString("en-CA", { timeZone: PACIFIC_TZ, ...opts }); }
  catch { return isoStr; }
}

function fmtPacificDate(isoStr) {
  return fmtPacific(isoStr, { year: "numeric", month: "short", day: "numeric" });
}

function fmtPacificDateTime(isoStr) {
  return fmtPacific(isoStr, {
    year: "numeric", month: "short", day: "numeric",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
}

function timeAgo(isoStr) {
  if (!isoStr) return "";
  const h = Math.floor((Date.now() - new Date(isoStr)) / 3600000);
  if (h < 1)  return "< 1 hour ago";
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d} day${d > 1 ? "s" : ""} ago`;
}

// ---------------------------------------------------------------------------
// Day-of-week tick builder for categorical x-axes (recent heatmaps)
// One tick at the first block of each calendar day, labelled "Mon", "Tue" etc.
// ---------------------------------------------------------------------------

function buildDayTicks(time_iso, time_labels) {
  const tickvals = [], ticktext = [];
  let lastDate = null;
  time_iso.forEach((iso, i) => {
    const d = new Date(iso);
    const date = d.toLocaleDateString("en-CA", { timeZone: PACIFIC_TZ });
    if (date !== lastDate) {
      const dow = d.toLocaleDateString("en-CA", { timeZone: PACIFIC_TZ, weekday: "short" });
      tickvals.push(time_labels[i]);
      ticktext.push(dow);
      lastDate = date;
    }
  });
  return { tickvals, ticktext };
}

// ---------------------------------------------------------------------------
// Sensor outage detection
// Returns { coverage, shapes, sparseFraction }
// coverage[ti] = fraction of depth bins with real data at time index ti
// shapes = Plotly shape objects to overlay over outage runs
// ---------------------------------------------------------------------------

const OUTAGE_THRESHOLD  = 0.10; // <10% depth coverage = profiler down
const OUTAGE_MIN_BLOCKS = 2;    // only flag runs of ≥2 consecutive blocks (= 8 h)
const OFFLINE_THRESHOLD = 0.80; // >80% sparse → show "offline" state instead of chart

function detectOutages(heatmapData) {
  const { observed, time_labels } = heatmapData || {};
  if (!observed || !observed.length || !time_labels) {
    return { coverage: null, shapes: [], sparseFraction: 0 };
  }
  const nDepths = observed.length;
  const nTimes  = time_labels.length;

  const coverage = Array.from({ length: nTimes }, (_, ti) =>
    observed.reduce((s, depthRow) => s + (depthRow[ti] ? 1 : 0), 0) / nDepths
  );

  const shapes = [];
  let inOutage = false, start = 0;

  const flush = (end) => {
    if (end - start >= OUTAGE_MIN_BLOCKS) {
      shapes.push({
        type: "rect", xref: "x", yref: "paper",
        x0: start - 0.5, x1: end - 0.5,
        y0: 0, y1: 1,
        fillcolor: "rgba(140,140,140,0.13)",
        line: { width: 0 },
        layer: "above",
      });
    }
  };

  coverage.forEach((cov, i) => {
    if (cov < OUTAGE_THRESHOLD) {
      if (!inOutage) { inOutage = true; start = i; }
    } else {
      if (inOutage) { flush(i); inOutage = false; }
    }
  });
  if (inOutage) flush(nTimes);

  const sparseFraction = coverage.filter(c => c < OUTAGE_THRESHOLD).length / nTimes;
  return { coverage, shapes, sparseFraction };
}

// Find the last time_iso where any depth bin had a real observation.
// Returns an ISO string or null.
function findLastObservedTime(heatmapData) {
  const { observed, time_iso } = heatmapData || {};
  if (!observed || !time_iso) return null;
  const nDepths = observed.length;
  for (let ti = time_iso.length - 1; ti >= 0; ti--) {
    for (let di = 0; di < nDepths; di++) {
      if (observed[di][ti]) return time_iso[ti];
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

function showLoading(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML =
    `<div class="state-msg"><div class="spinner"></div><span>Loading…</span></div>`;
}

function showNoData(id) {
  const el = document.getElementById(id);
  if (el) el.innerHTML =
    `<div class="state-msg"><span>No data available.</span></div>`;
}

function showError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.innerHTML =
    `<div class="state-msg"><span style="color:#c84020">⚠ ${msg}</span></div>`;
}

function setOutageBanner(bannerId, sparseFraction) {
  const el = document.getElementById(bannerId);
  if (!el) return;
  if (sparseFraction > 0.25) {
    const pct = Math.round(sparseFraction * 100);
    el.textContent = `${pct}% of this window has no profiler data — values in grey areas are interpolated estimates, not real readings.`;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

// ---------------------------------------------------------------------------
// Recent heatmap (sensor data — depth × 4-hour blocks, last 14 days)
// ---------------------------------------------------------------------------

function buildRecentHeatmap(el, heatmapData, colorscale, unitLabel, bannerId) {
  if (!heatmapData || !heatmapData.time_labels || !heatmapData.time_labels.length) {
    showNoData(el.id); return;
  }

  const { time_labels, time_iso, depths, values } = heatmapData;
  const { shapes, sparseFraction } = detectOutages(heatmapData);

  // When the vast majority of data is interpolated, replace the chart with a
  // clear offline message rather than displaying a misleading smooth surface.
  if (sparseFraction >= OFFLINE_THRESHOLD) {
    const lastSeen = findLastObservedTime(heatmapData);
    const since    = lastSeen ? fmtPacificDate(lastSeen) : "an unknown date";
    el.innerHTML   = `<div class="offline-msg">
      <div class="offline-icon">📡</div>
      <div class="offline-text">
        <strong>Sensor offline since ${since}</strong>
        <span>No real readings available for this period. Check back later or view the Full History tab for past data.</span>
      </div>
    </div>`;
    if (bannerId) document.getElementById(bannerId).hidden = true;
    return;
  }

  if (bannerId) setOutageBanner(bannerId, sparseFraction);

  const hoverText = values.map((depthRow, di) =>
    depthRow.map((v, ti) => {
      const dt  = time_iso?.[ti] ? fmtPacificDateTime(time_iso[ti]) : time_labels[ti];
      const obs = heatmapData.observed?.[di]?.[ti];
      return `${dt}<br>${depths[di]} m<br>${v != null ? v.toFixed(2) + " " + unitLabel : "no data"}${obs ? "" : " (interpolated)"}`;
    })
  );

  const { tickvals, ticktext } = buildDayTicks(time_iso || [], time_labels);

  const trace = {
    type: "heatmap",
    x: time_labels, y: depths, z: values,
    colorscale, zsmooth: false,
    text: hoverText, hovertemplate: "%{text}<extra></extra>",
    colorbar: {
      title: { text: unitLabel, font: { size: 11 } },
      tickfont: { size: 10 }, thickness: 14, len: 0.85,
    },
  };

  Plotly.newPlot(el, [trace], {
    ...LAYOUT_BASE,
    shapes,
    yaxis: { ...LAYOUT_BASE.yaxis, title: { text: "depth (m)", font: { size: 10 } }, autorange: "reversed" },
    xaxis: { ...LAYOUT_BASE.xaxis, tickvals, ticktext, tickangle: 0 },
  }, CONFIG);
}

// ---------------------------------------------------------------------------
// Recent heatmap (model data — same shape, fixed global zmin/zmax)
// ---------------------------------------------------------------------------

function buildRecentHeatmapModel(el, heatmapData, colorscale, unitLabel, zmin, zmax) {
  if (!heatmapData || !heatmapData.time_labels || !heatmapData.time_labels.length) {
    showNoData(el.id); return;
  }

  const { time_labels, time_iso, depths, values } = heatmapData;
  const { tickvals, ticktext } = buildDayTicks(time_iso || [], time_labels);

  const hoverText = values.map((depthRow, di) =>
    depthRow.map((v, ti) => {
      const dt = time_iso?.[ti] ? fmtPacificDateTime(time_iso[ti]) : time_labels[ti];
      return `${dt}<br>${depths[di]} m<br>${v != null ? v.toFixed(3) + " " + unitLabel : "no data"}`;
    })
  );

  const trace = {
    type: "heatmap",
    x: time_labels, y: depths, z: values,
    colorscale, zsmooth: "best", zmin, zmax,
    text: hoverText, hovertemplate: "%{text}<extra></extra>",
    colorbar: {
      title: { text: unitLabel, font: { size: 11 } },
      tickfont: { size: 10 }, thickness: 14, len: 0.85,
    },
  };

  Plotly.newPlot(el, [trace], {
    ...LAYOUT_BASE,
    yaxis: { ...LAYOUT_BASE.yaxis, title: { text: "depth (m)", font: { size: 10 } }, autorange: "reversed" },
    xaxis: { ...LAYOUT_BASE.xaxis, tickvals, ticktext, tickangle: 0 },
  }, CONFIG);
}

// ---------------------------------------------------------------------------
// Historical heatmap (full record, date axis)
// ---------------------------------------------------------------------------

function buildHistoricalHeatmap(el, dataset, colorscale, unitLabel, zmin, zmax) {
  const hm = dataset?.heatmap;
  if (!hm?.dates?.length) { showNoData(el.id); return; }

  const traceProps = { zmin: undefined, zmax: undefined };
  if (zmin != null) { traceProps.zmin = zmin; traceProps.zmax = zmax; }

  const trace = {
    type: "heatmap",
    x: hm.dates, y: hm.depths, z: hm.values,
    colorscale, zsmooth: "best",
    ...traceProps,
    colorbar: {
      title: { text: unitLabel, font: { size: 11 } },
      tickfont: { size: 10 }, thickness: 14, len: 0.85,
    },
    hovertemplate: "%{x}<br>%{y} m<br>%{z:.3f} " + (dataset.units || "") + "<extra></extra>",
  };

  Plotly.newPlot(el, [trace], {
    ...LAYOUT_BASE,
    yaxis: { ...LAYOUT_BASE.yaxis, title: { text: "depth (m)", font: { size: 10 } }, autorange: "reversed" },
    xaxis: { ...LAYOUT_BASE.xaxis, type: "date", tickformat: "%b %d", dtick: 7 * 86400000, tickangle: -30 },
  }, CONFIG);
}

// ---------------------------------------------------------------------------
// Trend chart (daily layer medians)
// ---------------------------------------------------------------------------

function buildHistoricalTrend(el, dataset, unitLabel) {
  const trend = dataset?.trend;
  if (!trend || !Object.keys(trend).length) { showNoData(el.id); return; }

  const traces = Object.entries(trend)
    .filter(([, v]) => Object.keys(v).length > 0)
    .map(([layer, vals]) => {
      const dates = Object.keys(vals).sort();
      return {
        type: "scatter", mode: "lines",
        name: LAYER_LABELS[layer] || layer,
        x: dates, y: dates.map(d => vals[d]),
        line: { color: LAYER_COLORS[layer] || "#aaa", width: 1.5 },
        hovertemplate: (LAYER_LABELS[layer] || layer) +
          "<br>%{x}: %{y:.3f} " + (dataset.units || unitLabel) + "<extra></extra>",
      };
    });

  // 30-day rolling average on surface
  const surf = trend["surface_0_10"];
  if (surf) {
    const dates = Object.keys(surf).sort();
    const vals  = dates.map(d => surf[d]);
    const WIN   = 30;
    const rolled = vals.map((_, i) => {
      const s = vals.slice(Math.max(0, i - WIN + 1), i + 1).filter(v => v != null);
      return s.length ? s.reduce((a, b) => a + b, 0) / s.length : null;
    });
    traces.push({
      type: "scatter", mode: "lines",
      name: "Surface 30-day avg",
      x: dates, y: rolled,
      line: { color: LAYER_COLORS["surface_0_10"], width: 2.5, dash: "dot" },
      hovertemplate: "30-day avg<br>%{x}: %{y:.3f} " + (dataset.units || unitLabel) + "<extra></extra>",
    });
  }

  Plotly.newPlot(el, traces, {
    ...LAYOUT_BASE,
    yaxis: { ...LAYOUT_BASE.yaxis, title: { text: unitLabel, font: { size: 10 } } },
    xaxis: { ...LAYOUT_BASE.xaxis, type: "date", tickformat: "%b %d", dtick: 7 * 86400000, tickangle: -30 },
    legend: { ...LAYOUT_BASE.legend, orientation: "h", y: -0.25, x: 0 },
  }, CONFIG);
}

// ---------------------------------------------------------------------------
// Deferred render registry — charts in hidden tabs render on first reveal
// ---------------------------------------------------------------------------

const DEFERRED_RENDERS = {};

function deferRender(panelId, renderFn) {
  DEFERRED_RENDERS[panelId] = renderFn;
}

// ---------------------------------------------------------------------------
// Page-level tab switching (Sensor Data ↔ Model Data)
// ---------------------------------------------------------------------------

function setupPageTabs() {
  document.querySelectorAll(".page-tab").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".page-tab").forEach(b => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      document.querySelectorAll(".page").forEach(p => { p.hidden = true; });

      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");
      const page = document.getElementById("page-" + btn.dataset.page);
      if (page) page.hidden = false;
    });
  });
}

// ---------------------------------------------------------------------------
// Section-level tab switching (Recent / History / Trend)
// ---------------------------------------------------------------------------

function setupTabs(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      container.querySelectorAll("[data-tab]").forEach(c => { c.hidden = true; });
      btn.classList.add("active");
      const target = document.getElementById(btn.dataset.target);
      if (!target) return;
      target.hidden = false;
      if (DEFERRED_RENDERS[target.id]) {
        DEFERRED_RENDERS[target.id]();
        delete DEFERRED_RENDERS[target.id];
      } else {
        target.querySelectorAll(".js-plotly-plot").forEach(p => Plotly.relayout(p, {}));
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Header / status bar
// ---------------------------------------------------------------------------

function updateHeader() {
  const el = document.getElementById("meta-bar");
  if (!el) return;

  const lastTurb = RECENT_DATA?.last_data_turb;
  const lastChl  = RECENT_DATA?.last_data_chl;
  const lastData = lastTurb || lastChl;

  const fromDate = TURB_DATA?.heatmap?.dates?.[0] || CHL_DATA?.heatmap?.dates?.[0] || null;
  const stale = lastData && (Date.now() - new Date(lastData)) / 3600000 > 24;

  el.innerHTML = `
    <span>48.627°N 123.499°W</span>
    ${fromDate ? `<span>since <strong>${fmtPacificDate(fromDate)}</strong></span>` : ""}
    <span class="last-data-chip ${stale ? "stale" : ""}">
      <span class="status-dot ${stale ? "stale" : ""}"></span>
      ${lastData
        ? `last reading <strong>${fmtPacificDateTime(lastData)}</strong> <em>(${timeAgo(lastData)})</em>`
        : "no recent data"}
    </span>
  `;
}

// ---------------------------------------------------------------------------
// Global model color scale bounds (computed once across all sites)
// so switching between sites shows directly comparable colours
// ---------------------------------------------------------------------------

let MODEL_FRASER_ZMAX = null;
let MODEL_PHYTO_ZMAX  = null;

function computeGlobalModelBounds(salishData) {
  if (!salishData?.sites) return;
  let fraserMax = 0, phytoMax = 0;
  for (const sd of Object.values(salishData.sites)) {
    for (const hm of [sd.fraser?.heatmap, sd.fraser?.recent]) {
      for (const row of hm?.values || [])
        for (const v of row) if (v != null && v > fraserMax) fraserMax = v;
    }
    for (const hm of [sd.phyto?.heatmap, sd.phyto?.recent]) {
      for (const row of hm?.values || [])
        for (const v of row) if (v != null && v > phytoMax) phytoMax = v;
    }
  }
  MODEL_FRASER_ZMAX = fraserMax > 0 ? fraserMax : null;
  MODEL_PHYTO_ZMAX  = phytoMax  > 0 ? phytoMax  : null;
}

// ---------------------------------------------------------------------------
// SalishSeaCast model section
// ---------------------------------------------------------------------------

const MODEL_CHART_IDS = [
  "chart-model-fraser-recent", "chart-model-fraser-history", "chart-model-fraser-trend",
  "chart-model-phyto-recent",  "chart-model-phyto-history",  "chart-model-phyto-trend",
];
const MODEL_PANEL_IDS = [
  "model-fraser-history-panel", "model-fraser-trend-panel",
  "model-phyto-history-panel",  "model-phyto-trend-panel",
];

function resetModelTabs() {
  ["model-fraser-block", "model-phyto-block"].forEach(blockId => {
    const block = document.getElementById(blockId);
    if (!block) return;
    block.querySelectorAll(".tab-btn").forEach((btn, i) => btn.classList.toggle("active", i === 0));
    block.querySelectorAll("[data-tab]").forEach((panel, i) => { panel.hidden = i !== 0; });
  });
}

function renderModelSection(siteKey) {
  const siteData = SALISH_DATA?.sites?.[siteKey];

  MODEL_CHART_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });
  MODEL_PANEL_IDS.forEach(id => delete DEFERRED_RENDERS[id]);

  if (!siteData) { MODEL_CHART_IDS.forEach(id => showNoData(id)); return; }

  const fraserDataset = siteData.fraser
    ? { heatmap: siteData.fraser.heatmap, trend: siteData.fraser.trend, units: siteData.fraser.units || "—" }
    : null;
  const phytoDataset = siteData.phyto
    ? { heatmap: siteData.phyto.heatmap, trend: siteData.phyto.trend, units: "mmol/m³" }
    : null;

  const fraserLabel = SALISH_DATA?.tracer_units || fraserDataset?.units || "—";
  const unitEl = document.getElementById("model-fraser-unit");
  if (unitEl && fraserLabel) unitEl.textContent = fraserLabel;

  // Render immediately-visible recent panels
  if (siteData.fraser?.recent) {
    buildRecentHeatmapModel(
      document.getElementById("chart-model-fraser-recent"),
      siteData.fraser.recent, FRASER_COLORSCALE, fraserLabel,
      0, MODEL_FRASER_ZMAX
    );
  } else { showNoData("chart-model-fraser-recent"); }

  if (siteData.phyto?.recent) {
    buildRecentHeatmapModel(
      document.getElementById("chart-model-phyto-recent"),
      siteData.phyto.recent, PHYTO_COLORSCALE, "mmol/m³",
      0, MODEL_PHYTO_ZMAX
    );
  } else { showNoData("chart-model-phyto-recent"); }

  // Defer the heavier history/trend panels
  if (fraserDataset) {
    deferRender("model-fraser-history-panel", () =>
      buildHistoricalHeatmap(
        document.getElementById("chart-model-fraser-history"),
        fraserDataset, FRASER_COLORSCALE, fraserLabel, 0, MODEL_FRASER_ZMAX
      )
    );
    deferRender("model-fraser-trend-panel", () =>
      buildHistoricalTrend(
        document.getElementById("chart-model-fraser-trend"),
        fraserDataset, fraserLabel
      )
    );
  }

  if (phytoDataset) {
    deferRender("model-phyto-history-panel", () =>
      buildHistoricalHeatmap(
        document.getElementById("chart-model-phyto-history"),
        phytoDataset, PHYTO_COLORSCALE, "mmol/m³", 0, MODEL_PHYTO_ZMAX
      )
    );
    deferRender("model-phyto-trend-panel", () =>
      buildHistoricalTrend(
        document.getElementById("chart-model-phyto-trend"),
        phytoDataset, "mmol/m³"
      )
    );
  }
}

function setupModelSiteSelector() {
  const selector = document.getElementById("model-site-selector");
  if (!selector) return;
  selector.querySelectorAll(".site-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      // Capture active tab targets before resetting so we can restore them
      const savedTargets = {};
      ["model-fraser-block", "model-phyto-block"].forEach(blockId => {
        const activeBtn = document.getElementById(blockId)?.querySelector(".tab-btn.active");
        if (activeBtn?.dataset.target) savedTargets[blockId] = activeBtn.dataset.target;
      });

      selector.querySelectorAll(".site-pill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentModelSite = btn.dataset.site;
      resetModelTabs();
      renderModelSection(currentModelSite);

      // Restore previously active sub-tab for each section
      Object.entries(savedTargets).forEach(([blockId, targetId]) => {
        const restoredBtn = document.getElementById(blockId)
          ?.querySelector(`[data-target="${targetId}"]`);
        if (restoredBtn) restoredBtn.click();
      });
    });
  });
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

let TURB_DATA     = null;
let CHL_DATA      = null;
let RECENT_DATA   = null;
let META_DATA     = null;
let SALISH_DATA   = null;
let EMULATOR_DATA = null;
let currentModelSite    = "mackenzie_bight";
let currentEmulatorSite = "mackenzie_bight";

async function fetchJSON(url) {
  const r = await fetch(url + "?_=" + Date.now());
  if (!r.ok) throw new Error(`HTTP ${r.status} for ${url}`);
  return r.json();
}

async function loadAll() {
  try {
    [TURB_DATA, CHL_DATA, RECENT_DATA, META_DATA] = await Promise.all([
      fetchJSON("data/turbidity.json"),
      fetchJSON("data/chlorophyll.json"),
      fetchJSON("data/recent.json"),
      fetchJSON("data/metadata.json"),
    ]);
    try { SALISH_DATA   = await fetchJSON("data/salishsea.json"); }  catch (_) {}
    try { EMULATOR_DATA = await fetchJSON("data/emulator.json"); }  catch (_) {}
    return true;
  } catch (e) {
    console.error("Failed to load data:", e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function init() {
  showLoading("chart-turb-recent");
  showLoading("chart-chl-recent");
  showLoading("chart-model-fraser-recent");
  showLoading("chart-model-phyto-recent");

  const ok = await loadAll();
  if (!ok) {
    ["chart-turb-recent", "chart-chl-recent"].forEach(id =>
      showError(id, "Could not load data — has the fetcher run?")
    );
    return;
  }

  updateHeader();

  if (SALISH_DATA) computeGlobalModelBounds(SALISH_DATA);

  // ---- Turbidity ----
  buildRecentHeatmap(
    document.getElementById("chart-turb-recent"),
    RECENT_DATA?.turbidity, TURB_COLORSCALE, "NTU", "turb-outage-banner"
  );
  deferRender("turb-history-panel", () =>
    buildHistoricalHeatmap(
      document.getElementById("chart-turb-history"),
      TURB_DATA, TURB_COLORSCALE, "NTU"
    )
  );
  deferRender("turb-trend-panel", () =>
    buildHistoricalTrend(
      document.getElementById("chart-turb-trend"),
      TURB_DATA, "NTU"
    )
  );

  // ---- Chlorophyll ----
  buildRecentHeatmap(
    document.getElementById("chart-chl-recent"),
    RECENT_DATA?.chlorophyll, CHL_COLORSCALE, "mg/m³", "chl-outage-banner"
  );
  deferRender("chl-history-panel", () =>
    buildHistoricalHeatmap(
      document.getElementById("chart-chl-history"),
      CHL_DATA, CHL_COLORSCALE, "mg/m³"
    )
  );
  deferRender("chl-trend-panel", () =>
    buildHistoricalTrend(
      document.getElementById("chart-chl-trend"),
      CHL_DATA, "mg/m³"
    )
  );

  setupPageTabs();
  setupTabs("turb-section");
  setupTabs("chl-section");

  // ---- Model ----
  setupModelSiteSelector();
  setupTabs("model-fraser-block");
  setupTabs("model-phyto-block");
  if (SALISH_DATA) {
    renderModelSection(currentModelSite);
  } else {
    MODEL_CHART_IDS.forEach(id => showNoData(id));
  }

  // ---- Emulator ----
  renderEmulatorMetrics();
  setupEmulatorSiteSelector();
  setupTabs("emulator-block");
  if (EMULATOR_DATA) {
    renderEmulatorSection(currentEmulatorSite);
  } else {
    EMULATOR_CHART_IDS.forEach(id => showNoData(id));
  }
}

// ---------------------------------------------------------------------------
// Emulator page
// ---------------------------------------------------------------------------

const EMULATOR_CHART_IDS = [
  "chart-emulator-recent", "chart-emulator-history", "chart-emulator-trend",
];

function renderEmulatorMetrics() {
  const el = document.getElementById("emulator-metrics");
  if (!el || !EMULATOR_DATA) return;
  const { model_type, phyto_scale, turb_scale, phyto_weight, turb_weight,
          sensor_mean_ntu, proxy_formula, updated } = EMULATOR_DATA;

  if (model_type === "proxy_normalization") {
    el.innerHTML = `
      <span>model <strong>proxy normalization</strong></span>
      <span>phyto weight <strong>${phyto_weight ?? 0.5}</strong></span>
      <span>phyto scale <strong>${phyto_scale?.toFixed(4) ?? "—"}</strong></span>
      <span>turb weight <strong>${turb_weight ?? 0.5}</strong></span>
      <span>turb scale <strong>${turb_scale?.toFixed(4) ?? "—"}</strong></span>
      <span>sensor mean <strong>${sensor_mean_ntu?.toFixed(3) ?? "—"} NTU</strong></span>
      <span>updated <strong>${fmtPacificDate(updated)}</strong></span>
    `;
  } else {
    el.innerHTML = `
      <span>model <strong>${(model_type || "").replace(/_/g, " ")}</strong></span>
      <span>updated <strong>${fmtPacificDate(updated)}</strong></span>
    `;
  }
  el.hidden = false;
}

function renderEmulatorSection(siteKey) {
  EMULATOR_CHART_IDS.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = "";
  });
  ["emulator-history-panel", "emulator-trend-panel"].forEach(id => delete DEFERRED_RENDERS[id]);

  const siteData = EMULATOR_DATA?.sites?.[siteKey];
  if (!siteData?.heatmap?.dates?.length) {
    EMULATOR_CHART_IDS.forEach(id => showNoData(id));
    return;
  }

  const dataset = { heatmap: siteData.heatmap, trend: siteData.trend, units: "NTU" };

  if (siteData.recent?.time_labels?.length) {
    buildRecentHeatmapModel(
      document.getElementById("chart-emulator-recent"),
      siteData.recent, TURB_COLORSCALE, "NTU", 0, null
    );
  } else { showNoData("chart-emulator-recent"); }

  deferRender("emulator-history-panel", () =>
    buildHistoricalHeatmap(
      document.getElementById("chart-emulator-history"),
      dataset, TURB_COLORSCALE, "NTU"
    )
  );
  deferRender("emulator-trend-panel", () =>
    buildHistoricalTrend(
      document.getElementById("chart-emulator-trend"),
      dataset, "NTU"
    )
  );
}

function setupEmulatorSiteSelector() {
  const selector = document.getElementById("emulator-site-selector");
  if (!selector) return;
  selector.querySelectorAll(".site-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      const savedTarget = document.getElementById("emulator-block")
        ?.querySelector(".tab-btn.active")?.dataset.target;

      selector.querySelectorAll(".site-pill").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentEmulatorSite = btn.dataset.site;

      // Reset sub-tabs to Recent, then render
      const block = document.getElementById("emulator-block");
      if (block) {
        block.querySelectorAll(".tab-btn").forEach((b, i) => b.classList.toggle("active", i === 0));
        block.querySelectorAll("[data-tab]").forEach((p, i) => { p.hidden = i !== 0; });
      }
      renderEmulatorSection(currentEmulatorSite);

      if (savedTarget) {
        const restoredBtn = block?.querySelector(`[data-target="${savedTarget}"]`);
        if (restoredBtn) restoredBtn.click();
      }
    });
  });
}

document.addEventListener("DOMContentLoaded", init);
