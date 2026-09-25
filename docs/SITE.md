# inletviz-site

This repo is the public static site for InletViz, which covers Saanich Inlet
water visibility and conditions.

- **Live at:** https://inletviz.com and https://inletviz.netlify.app. The
  `www.` host 301-redirects to the apex.
- **Repo:** `git@github.com:chrisfmillsOS/inletviz-site.git`, branch `main`.
- **Hosting:** Netlify deploys every push to `main`.
- **Data:** produced by the `saanich-viz` pipeline on frigate-nvr and pushed
  here daily. See `~/saanich-viz/docs/PIPELINE.md` and
  `~/saanich-viz/docs/DATA_CONTRACT.md`.

## Layout

```
index.html            landing page
submit/index.html     "Submit a measurement": embedded Google Form
models/index.html     the dashboard (identical copy of saanich-viz/web/index.html)
models/css/style.css  (identical copy of saanich-viz/web/css/style.css)
models/js/main.js     dashboard logic (identical copy of saanich-viz/web/js/main.js)
models/data/*.json    data files, overwritten by the pipeline
netlify.toml
```

There is no build step, no bundler and no Node code. `NODE_VERSION = "20"` in
`netlify.toml` is unused.

## Pages

| URL | What it does |
|---|---|
| `/` | Static landing page with a title, a tagline and two buttons: **View visibility data** → `/models/` and **Submit a measurement** → `/submit/`. |
| `/submit/` | Embeds the Google Form `1FAIpQLSeHlfhdi3xrakRHkgqhmyotsIwKKvB9GfyfO1e2jKGm9t3bhQ` in an iframe, so divers can report visibility and depth. The responses go to Google Forms. Nothing on the site or in the pipeline reads them. |
| `/models/` | The Plotly dashboard (see below). `/models` 301-redirects to `/models/`. The trailing slash matters, because the page loads `css/`, `js/` and `data/` by relative paths. |

### `/models/` dashboard

The page loads Plotly 2.35.2 from `cdn.plot.ly` and Inter from Google Fonts.
It has three top-level tabs, set by `.page-tab[data-page]`:

1. **Turbidity Estimate** (default, `#page-emulator`)
   - Five site pills: `mackenzie_bight`, `willis_point`, `henderson_point`,
     `yarrow_point` and `deep_cove`. MacKenzie Bight is the default.
   - Sub-tabs **Last 14 Days**, **Full History** and **Trend**.
   - A "Model details" section shows the proxy scale factors.
2. **Sensor Data** (`#page-sensor`)
   - Measured turbidity (NTU) and chlorophyll (mg/m³) from the ONC Yarrow
     Point profiler.
   - Each has **Last 14 Days**, **Full History** and **Trend**.
   - A header bar shows the start date and the last reading, and marks the
     data stale after more than 24 h.
3. **Model Data** (`#page-model`)
   - SalishSeaCast model turbidity ("fraser") and phytoplankton for the same
     five sites.
   - Each has the same three sub-tabs.

Rendering:

- Full History and Trend charts render lazily, the first time their tab is
  shown.
- Turbidity is drawn on a fixed 0 to 1.5 NTU scale (`TURB_COLORSCALE`), with
  diver breakpoints 0.2, 0.4, 0.7 and 1.0 NTU. The emulator uses the same
  scale.
- Model charts use a single colour maximum across all sites, so the sites can
  be compared.

## Data files consumed by `models/js/main.js`

`fetchJSON()` appends `?_=<Date.now()>` to every request to defeat the browser
cache.

| File | Load | Fields used |
|---|---|---|
| `data/turbidity.json` | required (`Promise.all`) | `heatmap.{dates,depths,values}`, `trend.{surface_0_10,mid_20_40,near_bottom_40_50}`, `units` |
| `data/chlorophyll.json` | required | same as turbidity |
| `data/recent.json` | required | `turbidity` and `chlorophyll` → `{time_labels,time_iso,depths,values,observed}`; `last_data_turb`, `last_data_chl` (header) |
| `data/metadata.json` | required | **none.** It is loaded, but if it fails the whole page shows "Could not load data". |
| `data/salishsea.json` | optional (errors ignored) | `tracer_units`; `sites.<key>.fraser` and `.phyto` → `{heatmap, recent, trend, units}` |
| `data/emulator.json` | optional | `model_type`, `phyto_scale`, `turb_scale`, `phyto_weight`, `turb_weight`, `sensor_mean_ntu`, `updated`; `sites.<key>.{heatmap, recent, trend}` |

`physics.json` is **not** published or read. It returns 404.

The dashboard's sensor logic:

- It flags outages as runs of 2 or more 4-hour blocks where fewer than 10% of
  depth bins have `observed == true`.
- It shows a banner when more than 25% of the window is sparse.
- It replaces the chart with "Sensor offline since …" when 80% or more is
  sparse.

## How data arrives

`~/saanich-viz/run-pipeline.sh` runs from host cron on frigate-nvr at 03:00 UTC
daily. After the fetch stages, it:

1. copies `turbidity`, `chlorophyll`, `recent`, `metadata`, `emulator` and
   `salishsea` (`.json`) from the fetcher container into `models/data/`;
2. runs `git add models/data/`;
3. if anything changed, commits `data: update YYYY-MM-DD` and runs
   `git push origin main`.

Netlify then redeploys. Because the pipeline commits here automatically:

- **Keep this checkout clean** on frigate-nvr (`~/inletviz-site`). Uncommitted
  or diverged changes will make the pipeline's push fail.
- Make code and page edits in a separate clone, or pull before pushing.
- Dashboard code changes should be made in `saanich-viz/web/` and copied here,
  or the other way round, so the two copies stay identical. They are identical
  as of 2026-09-25.

As of 2026-09-25, the latest data commit is `data: update 2026-06-23`. The
pipeline has been paused since then.

## Netlify config (`netlify.toml`)

```toml
[build]
  publish = "."

[[headers]]
  for = "/models/data/*"
  [headers.values]
    Cache-Control = "public, max-age=3600, stale-while-revalidate=86400"

[build.environment]
  NODE_VERSION = "20"
```

- Data JSON is cached for 1 h, and served stale for up to 1 day while it
  revalidates. The HTML, JS and CSS use Netlify defaults.
- **There is no CORS header.** Browser apps on other origins, such as the DPV
  dive planner, cannot fetch `/models/data/*.json` directly. Fetch the files
  server-side, or add `Access-Control-Allow-Origin = "*"` to the
  `/models/data/*` headers block.
- There are no redirects, functions or forms config. The submit form is a
  Google Form.

## Running locally

```bash
cd ~/inletviz-site
python3 -m http.server 8000
# open http://localhost:8000/  and  http://localhost:8000/models/
```

This serves the committed `models/data/*.json`. To view fresh pipeline output
without pushing, copy the files from the fetcher first, for example
`docker compose -f ~/saanich-viz/docker-compose.yml cp fetcher:/data/emulator.json models/data/`.
Do not commit them by hand if the pipeline is running.
