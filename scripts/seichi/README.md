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

## 清水ひなた My Maps automation

The public 日向坂46 My Maps source `shimizu-hinata-main` is checked every six
hours and promoted into `public/seichi/hinatazaka-all.geojson`.

- Source Map ID: `14Otcijw10dc-Fyu1P-q-BygLgiLK2sQ`
- Entrypoint: `/vol1/sakamichi-platform/scripts/seichi/run_shimizu_hinata_sync.sh`
- Runtime: `/vol1/seichi-sync/shimizu-hinata/`
- Report: `/vol1/seichi-sync/reports/shimizu-hinata-latest.json`
- Log: `/vol1/seichi-sync/logs/shimizu-hinata-sync.log`
- Cron: `31 */6 * * *`
- Dynamic endpoint: `/api/seichi-data/hinatazaka` with the Pages snapshot as fallback

The promoter requires at least 3,500 source points and permits at most 50
additions or 10 removals per normal run. It validates coordinates and unique
stable source keys. Legacy/matched images are retained, Google My Maps images
use `/api/proxy-image`, and direct YouTube thumbnails remain unchanged. Rows not
owned by this Map ID are preserved so manually curated additions are not erased.

Manual run:

```bash
SEICHI_REPO_DIR=/vol1/sakamichi-platform \
SEICHI_RUNTIME_DIR=/vol1/seichi-sync \
/vol1/sakamichi-platform/scripts/seichi/run_shimizu_hinata_sync.sh
```

## fumi article automation

fumi's public article tags are checked automatically on Homeserver. Tag indexes
are fetched on each run, while immutable article pages and GSI geocoding results
are cached under `/vol1/seichi-sync/fumi/cache/`.

```text
fumi public tag/article pages
  -> sync_fumi_articles.py (complete managed supplement after the fixed cutoff)
  -> promote_fumi_articles.py (quality gate; preserve every non-fumi feature)
  -> public/seichi/sakurazaka-all.geojson
  -> tests + git commit/push to sakamichi-platform
  -> Cloudflare Pages build
```

- Entrypoint: `/vol1/sakamichi-platform/scripts/seichi/run_fumi_sync.sh`
- Runtime and cache: `/vol1/seichi-sync/fumi/`
- Reports: `/vol1/seichi-sync/reports/fumi-*.json`
- Log: `/vol1/seichi-sync/logs/fumi-sync.log`
- Cron: `43 */6 * * *`

Manual run:

```bash
SEICHI_REPO_DIR=/vol1/sakamichi-platform \
SEICHI_RUNTIME_DIR=/vol1/seichi-sync \
/vol1/sakamichi-platform/scripts/seichi/run_fumi_sync.sh
```

The fumi promoter requires at least 700 managed features, permits at most 50
additions or 10 removals in one run, validates stable unique IDs and WGS84
coordinates, and replaces only features whose ID starts with `fumi-article:`.
My Maps imports and manually curated records remain untouched. The fumi and
overseas runners share a Git publication lock so they cannot commit concurrently.
Both stop at 85% `/vol1` usage and rotate their individual logs at 5 MiB.

## YouTube policy

YouTube subtitles and official descriptions may be used to prepare a review
list, but YouTube locations are never part of an automatic publication job.
They are verified and added manually, with a separate source record per video
appearance. Private homes and unconfirmed recording studios are excluded.
