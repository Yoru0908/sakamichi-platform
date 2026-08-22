# Seichi data synchronization

## Overseas map automation

The public Google My Maps source `cyberiz-oversea` is checked by Homeserver every six hours.

```text
Google My Maps public KML
  -> sync_mymaps_sources.py (layers, points, added/changed/removed state)
  -> promote_oversea_mymaps.py (validation, metadata normalization, image policy)
  -> public/seichi/oversea.geojson
  -> tests + git commit/push to sakamichi-platform
  -> /api/seichi-data/oversea (GitHub Raw proxy, 5-minute CDN cache)
  -> SeichiMap (falls back to the Pages static GeoJSON snapshot on proxy failure)
```

### Homeserver

- Repository: `/vol1/sakamichi-platform`
- Entrypoint: `/vol1/sakamichi-platform/scripts/seichi/run_oversea_sync.sh`
- Runtime, lock, KML, state, report, temporary files and logs: `/vol1/seichi-sync/`
- Cron: `17 */6 * * *`

All runtime writes stay under `/vol1`. The runner refuses to write when `/vol1` is at or above 85%, rotates its log at 5 MiB, and uses `flock` to prevent overlapping jobs.

Manual run:

```bash
SEICHI_REPO_DIR=/vol1/sakamichi-platform \
SEICHI_RUNTIME_DIR=/vol1/seichi-sync \
/vol1/sakamichi-platform/scripts/seichi/run_oversea_sync.sh
```

### Publication safeguards

- At least 100 point features must remain.
- One run may add at most 50 or remove at most 10 points.
- Coordinates and unique source keys are validated.
- Existing mirrored images remain on R2.
- New Google My Maps images use the same-origin `/api/proxy-image` endpoint until an optional R2 mirror pass.
- A dirty server worktree, failed tests, invalid KML or a non-fast-forward Git push stops publication.
- Source labels and descriptions are preserved; this pipeline does not translate metadata.

Latest run status is written to `/vol1/seichi-sync/reports/latest.json`; logs are in `/vol1/seichi-sync/logs/oversea-sync.log`.

## fumi articles

The fumi synchronizer remains a separately invoked workflow:

```bash
python3 scripts/seichi/sync_fumi_articles.py \
  --merge-target public/seichi/sakurazaka-all.geojson
```
