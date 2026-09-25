# inletviz-site

The public website for **InletViz**, which covers water visibility and conditions in Saanich Inlet.
Netlify deploys it to **https://inletviz.netlify.app** on every push to `main`.

It's a static site with no build step. Nobody edits `models/data/` by hand: the
[saanich-viz](https://github.com/chrisfmillsOS/saanich-viz) pipeline rebuilds it
and commits it here once a day (`data: update YYYY-MM-DD`).

| Path | What |
|---|---|
| `index.html` | Landing page with two buttons: the dashboard, and the measurement form |
| `models/` | The dashboard: `index.html`, `js/main.js` (Plotly), `css/style.css`. These are byte-identical to saanich-viz `web/`. |
| `models/data/*.json` | Pipeline outputs: turbidity, chlorophyll, recent, metadata, salishsea, emulator |
| `submit/` | Embedded Google Form where divers submit visibility measurements |
| `netlify.toml` | Publishes the repo root. `models/data/*` gets a 1 h cache plus 24 h stale-while-revalidate. |
| `docs/SITE.md` | Page details, which fields each chart reads, caching |

## Run locally

```bash
python3 -m http.server 8000     # → http://localhost:8000/models/
```

## How data arrives

`saanich-viz/run-pipeline.sh` runs from host cron at 03:00 UTC. It copies the JSON out of
the fetcher's Docker volume into `models/data/`, commits, and runs `git push origin main`.
The pipeline host needs an SSH key with push access to this repo (see saanich-viz
`docs/DEPLOY.md`). If pushes stop, the site keeps working with old data.
`metadata.json` → `updated` shows how old it is.

Field-level JSON structures are in saanich-viz
[`docs/DATA_CONTRACT.md`](https://github.com/chrisfmillsOS/saanich-viz/blob/main/docs/DATA_CONTRACT.md).
Using the data from the DPV dive planner is covered in
[`docs/INTEGRATION.md`](https://github.com/chrisfmillsOS/saanich-viz/blob/main/docs/INTEGRATION.md).

## Moving hosts

The site lives on Netlify, so nothing about it is tied to frigate-nvr. Only the job
that pushes data is. To move that job, clone this repo to `~/inletviz-site` on the
new pipeline host, give the host push access, and follow saanich-viz `docs/DEPLOY.md`.
