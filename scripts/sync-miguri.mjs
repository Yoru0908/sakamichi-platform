import { pathToFileURL } from 'node:url';

import { buildMiguriSyncPayload, fetchFortuneEventsWithDetails } from '../src/utils/fortune-music.ts';

export async function syncMiguri({
  endpoint = process.env.MIGURI_SYNC_URL,
  secret = process.env.MIGURI_SYNC_SECRET,
  loadEvents = fetchFortuneEventsWithDetails,
  fetchImpl = fetch,
  dryRun = false,
} = {}) {
  const events = await loadEvents();
  const payload = buildMiguriSyncPayload(events);

  if (dryRun) {
    return {
      posted: false,
      payload,
    };
  }

  if (!endpoint) {
    throw new Error('Missing MIGURI_SYNC_URL');
  }

  if (!secret) {
    throw new Error('Missing MIGURI_SYNC_SECRET');
  }

  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-miguri-sync-secret': secret,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await res.text();
  if (!res.ok) {
    throw new Error(`Miguri sync failed (${res.status}): ${responseText || 'empty response'}`);
  }

  return {
    posted: true,
    payload,
    responseText,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const dryRun = argv.includes('--dry-run');
  const result = await syncMiguri({ dryRun });

  const eventCount = result.payload.events.length;
  if (dryRun) {
    console.log(JSON.stringify(result.payload, null, 2));
    console.log(`[miguri-sync] dry run complete: ${eventCount} events`);
    return;
  }

  console.log(`[miguri-sync] synced ${eventCount} events`);
  if (result.responseText) {
    console.log(result.responseText);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error('[miguri-sync] failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  });
}
