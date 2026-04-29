import type { Env } from '../types.ts';

export type GoogleAuthAction = 'login' | 'calendar_connect';

export type GoogleAuthState = {
  origin: string;
  action: GoogleAuthAction;
  returnTo: string;
};

export type MiguriGoogleCalendarSyncStatus = {
  connected: boolean;
  email: string | null;
  calendarId: string | null;
  syncEnabled: boolean;
};

type GoogleCalendarConnectionRow = {
  user_id: string;
  google_sub: string;
  google_email: string;
  calendar_id: string;
  refresh_token: string;
  access_token: string | null;
  access_token_expires_at: string | null;
  sync_enabled: number | boolean;
};

type MiguriCalendarEntryRow = {
  id: string;
  event_slug: string;
  member_name: string;
  event_date: string;
  slot_number: number;
  tickets: number;
  status: string;
  event_title: string | null;
  group_id: 'nogizaka' | 'hinatazaka' | 'sakurazaka' | null;
  start_time: string | null;
  end_time: string | null;
};

type MiguriCalendarWindowRow = {
  event_slug: string;
  label: string;
  start_at: string;
  end_at: string;
  sort_order: number;
  event_title: string | null;
  group_id: 'nogizaka' | 'hinatazaka' | 'sakurazaka' | null;
  first_event_date: string | null;
};

type GoogleCalendarEventMappingRow = {
  id: string;
  user_id: string;
  miguri_entry_id: string;
  calendar_id: string;
  google_event_id: string;
  last_synced_at: string;
};

type GoogleTokenRefreshResponse = {
  access_token: string;
  expires_in?: number;
};

export type GoogleCalendarSyncResult = {
  connected: boolean;
  synced: boolean;
  googleEventId: string | null;
};

export function buildGoogleAuthState(state: GoogleAuthState): string {
  return encodeURIComponent(JSON.stringify(state));
}

export function parseGoogleAuthState(rawState: string | null): GoogleAuthState {
  const decoded = decodeURIComponent(rawState || '');
  if (!decoded) {
    return {
      origin: '',
      action: 'login',
      returnTo: '/',
    };
  }

  if (/^https?:\/\//.test(decoded)) {
    return {
      origin: decoded,
      action: 'login',
      returnTo: '/',
    };
  }

  try {
    const parsed = JSON.parse(decoded) as Partial<GoogleAuthState>;
    return {
      origin: typeof parsed.origin === 'string' ? parsed.origin : '',
      action: parsed.action === 'calendar_connect' ? 'calendar_connect' : 'login',
      returnTo: typeof parsed.returnTo === 'string' && parsed.returnTo ? parsed.returnTo : '/',
    };
  } catch {
    return {
      origin: decoded,
      action: 'login',
      returnTo: '/',
    };
  }
}

async function loadGoogleCalendarConnection(env: Env, userId: string): Promise<GoogleCalendarConnectionRow | null> {
  if (!env.DB) return null;

  try {
    return await env.DB.prepare(`
      SELECT user_id, google_sub, google_email, calendar_id, refresh_token, access_token, access_token_expires_at, sync_enabled
      FROM user_google_calendar_connections
      WHERE user_id = ?
    `).bind(userId).first<GoogleCalendarConnectionRow>();
  } catch {
    return null;
  }
}

export async function loadGoogleCalendarSyncStatus(env: Env, userId: string | null): Promise<MiguriGoogleCalendarSyncStatus> {
  if (!userId) {
    return {
      connected: false,
      email: null,
      calendarId: null,
      syncEnabled: false,
    };
  }

  const connection = await loadGoogleCalendarConnection(env, userId);
  if (!connection) {
    return {
      connected: false,
      email: null,
      calendarId: null,
      syncEnabled: false,
    };
  }

  return {
    connected: true,
    email: connection.google_email,
    calendarId: connection.calendar_id,
    syncEnabled: connection.sync_enabled === undefined ? true : Boolean(connection.sync_enabled),
  };
}

function isUsableAccessToken(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const expiresTime = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiresTime)) return false;
  return expiresTime > Date.now() + 60_000;
}

async function refreshGoogleAccessToken(
  env: Env,
  connection: GoogleCalendarConnectionRow,
  fetchImpl: typeof fetch,
): Promise<{ accessToken: string; expiresAt: string }> {
  const tokenRes = await fetchImpl('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: connection.refresh_token,
    }),
  });

  if (!tokenRes.ok) {
    throw new Error(`google_token_refresh_failed_${tokenRes.status}`);
  }

  const tokenData = await tokenRes.json() as GoogleTokenRefreshResponse;
  const expiresAt = new Date(Date.now() + Math.max(300, Number(tokenData.expires_in || 3600)) * 1000).toISOString();
  await env.DB.prepare(`
    UPDATE user_google_calendar_connections
    SET access_token = ?,
        access_token_expires_at = ?,
        updated_at = datetime('now')
    WHERE user_id = ?
  `).bind(tokenData.access_token, expiresAt, connection.user_id).run();

  return {
    accessToken: tokenData.access_token,
    expiresAt,
  };
}

async function ensureGoogleAccessToken(
  env: Env,
  connection: GoogleCalendarConnectionRow,
  fetchImpl: typeof fetch,
): Promise<string> {
  if (connection.access_token && isUsableAccessToken(connection.access_token_expires_at)) {
    return connection.access_token;
  }

  const refreshed = await refreshGoogleAccessToken(env, connection, fetchImpl);
  return refreshed.accessToken;
}

async function loadSyncableMiguriEntry(env: Env, userId: string, entryId: string): Promise<MiguriCalendarEntryRow | null> {
  if (!env.MIGURI_DB) return null;

  return await env.MIGURI_DB.prepare(`
    SELECT e.id, e.event_slug, e.member_name, e.event_date, e.slot_number, e.tickets, e.status,
           m.title AS event_title, m.group_id,
           s.start_time, s.end_time
    FROM miguri_user_entries e
    LEFT JOIN miguri_events m ON m.slug = e.event_slug
    LEFT JOIN miguri_event_slots s
      ON s.event_slug = e.event_slug AND s.event_date = e.event_date AND s.slot_number = e.slot_number
    WHERE e.user_id = ? AND e.id = ?
  `).bind(userId, entryId).first<MiguriCalendarEntryRow>();
}

async function loadSyncableMiguriEntryIds(env: Env, userId: string): Promise<string[]> {
  if (!env.MIGURI_DB) return [];

  const rows = await env.MIGURI_DB.prepare(`
    SELECT e.id
    FROM miguri_user_entries e
    LEFT JOIN miguri_events m ON m.slug = e.event_slug
    LEFT JOIN miguri_event_slots s
      ON s.event_slug = e.event_slug AND s.event_date = e.event_date AND s.slot_number = e.slot_number
    WHERE e.user_id = ?
      AND m.group_id IS NOT NULL
      AND s.start_time IS NOT NULL
      AND s.end_time IS NOT NULL
    ORDER BY e.event_date, e.slot_number, e.member_name
  `).bind(userId).all<{ id: string }>();

  return (rows.results || []).map((row) => row.id);
}

function toGroupLabel(groupId: 'nogizaka' | 'hinatazaka' | 'sakurazaka' | null): string {
  if (groupId === 'nogizaka') return '乃木坂46';
  if (groupId === 'sakurazaka') return '櫻坂46';
  return '日向坂46';
}

function normalizeWideDateTimeText(value: string): string {
  return value
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xFEE0))
    .replace(/：/g, ':')
    .replace(/\s+/g, '')
    .trim();
}

function padTwo(value: string | number): string {
  return `${value}`.padStart(2, '0');
}

export function parseMiguriWindowDateTime(value: string, referenceYear?: number): string | null {
  const normalized = normalizeWideDateTimeText(value);
  const japaneseMatch = normalized.match(/^(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日(?:[（(][^)）]+[)）])?(\d{1,2}):(\d{2})$/);
  if (japaneseMatch) {
    const year = Number(japaneseMatch[1] || referenceYear || new Date().getFullYear());
    if (!Number.isFinite(year)) return null;
    return `${year}-${padTwo(japaneseMatch[2])}-${padTwo(japaneseMatch[3])}T${padTwo(japaneseMatch[4])}:${padTwo(japaneseMatch[5])}:00+09:00`;
  }

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?(?:([+-]\d{2}:\d{2})|Z)?$/);
  if (!isoMatch) return null;

  const timezone = isoMatch[7] || '+09:00';
  return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}T${isoMatch[4]}:${isoMatch[5]}:${isoMatch[6] || '00'}${timezone}`;
}

function buildMiguriWindowSyncId(window: Pick<MiguriCalendarWindowRow, 'event_slug' | 'label' | 'start_at'>): string {
  return `window:${encodeURIComponent(window.event_slug)}:${encodeURIComponent(window.label)}:${encodeURIComponent(window.start_at)}`;
}

function parseMiguriWindowSyncId(syncItemId: string): { eventSlug: string; label: string; startAt: string } | null {
  if (!syncItemId.startsWith('window:')) return null;
  const parts = syncItemId.split(':');
  if (parts.length !== 4) return null;

  try {
    return {
      eventSlug: decodeURIComponent(parts[1]),
      label: decodeURIComponent(parts[2]),
      startAt: decodeURIComponent(parts[3]),
    };
  } catch {
    return null;
  }
}

function buildGoogleCalendarEntryEventBody(entry: MiguriCalendarEntryRow) {
  return {
    summary: `${toGroupLabel(entry.group_id)} ミーグリ - ${entry.member_name}`,
    description: `${entry.event_title || entry.event_slug || 'Miguri'}\n第${entry.slot_number}部 ${entry.member_name} ${entry.tickets}枚`,
    location: 'Fortune Music Online',
    start: {
      dateTime: `${entry.event_date}T${entry.start_time}:00+09:00`,
      timeZone: 'Asia/Tokyo',
    },
    end: {
      dateTime: `${entry.event_date}T${entry.end_time}:00+09:00`,
      timeZone: 'Asia/Tokyo',
    },
    extendedProperties: {
      private: {
        miguriEntryId: entry.id,
      },
    },
  };
}

function buildGoogleCalendarWindowEventBody(window: MiguriCalendarWindowRow) {
  const referenceYear = window.first_event_date ? Number(window.first_event_date.slice(0, 4)) : undefined;
  const startDateTime = parseMiguriWindowDateTime(window.start_at, referenceYear);
  const endDateTime = parseMiguriWindowDateTime(window.end_at, referenceYear);
  if (!startDateTime || !endDateTime) return null;

  return {
    summary: `${toGroupLabel(window.group_id)} ミーグリ 受付 - ${window.label}`,
    description: `${window.event_title || window.event_slug || 'Miguri'}\n${window.label}\n受付期間`,
    location: 'Fortune Music Online',
    start: {
      dateTime: startDateTime,
      timeZone: 'Asia/Tokyo',
    },
    end: {
      dateTime: endDateTime,
      timeZone: 'Asia/Tokyo',
    },
    extendedProperties: {
      private: {
        miguriWindowId: buildMiguriWindowSyncId(window),
      },
    },
  };
}

async function loadEventMapping(env: Env, userId: string, syncItemId: string): Promise<GoogleCalendarEventMappingRow | null> {
  return await env.DB.prepare(`
    SELECT id, user_id, miguri_entry_id, calendar_id, google_event_id, last_synced_at
    FROM miguri_google_calendar_events
    WHERE user_id = ? AND miguri_entry_id = ?
  `).bind(userId, syncItemId).first<GoogleCalendarEventMappingRow>();
}

async function loadEventMappingsByPrefix(env: Env, userId: string, prefix: string): Promise<GoogleCalendarEventMappingRow[]> {
  const rows = await env.DB.prepare(`
    SELECT id, user_id, miguri_entry_id, calendar_id, google_event_id, last_synced_at
    FROM miguri_google_calendar_events
    WHERE user_id = ? AND miguri_entry_id LIKE ?
  `).bind(userId, `${prefix}%`).all<GoogleCalendarEventMappingRow>();

  return rows.results || [];
}

async function upsertEventMapping(env: Env, userId: string, syncItemId: string, calendarId: string, googleEventId: string) {
  const existing = await loadEventMapping(env, userId, syncItemId);
  const syncedAt = new Date().toISOString();

  if (existing) {
    await env.DB.prepare(`
      UPDATE miguri_google_calendar_events
      SET calendar_id = ?,
          google_event_id = ?,
          last_synced_at = ?,
          updated_at = datetime('now')
      WHERE user_id = ? AND miguri_entry_id = ?
    `).bind(calendarId, googleEventId, syncedAt, userId, syncItemId).run();
    return;
  }

  await env.DB.prepare(`
    INSERT INTO miguri_google_calendar_events (id, user_id, miguri_entry_id, calendar_id, google_event_id, last_synced_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(crypto.randomUUID(), userId, syncItemId, calendarId, googleEventId, syncedAt).run();
}

async function syncMappedGoogleCalendarEvent(
  env: Env,
  connection: GoogleCalendarConnectionRow,
  userId: string,
  syncItemId: string,
  body: string,
  fetchImpl: typeof fetch,
): Promise<GoogleCalendarSyncResult> {
  const accessToken = await ensureGoogleAccessToken(env, connection, fetchImpl);
  const mapping = await loadEventMapping(env, userId, syncItemId);
  const calendarId = connection.calendar_id || 'primary';

  let googleEventId = mapping?.google_event_id || null;
  let response: Response;

  if (mapping?.google_event_id) {
    response = await fetchImpl(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(mapping.google_event_id)}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body,
    });

    if (response.status === 404) {
      response = await fetchImpl(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body,
      });
    }
  } else {
    response = await fetchImpl(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body,
    });
  }

  if (!response.ok) {
    throw new Error(`google_calendar_sync_failed_${response.status}`);
  }

  const responseJson = await response.json() as { id?: string };
  googleEventId = responseJson.id || googleEventId;

  if (!googleEventId) {
    throw new Error('google_calendar_missing_event_id');
  }

  await upsertEventMapping(env, userId, syncItemId, calendarId, googleEventId);

  return {
    connected: true,
    synced: true,
    googleEventId,
  };
}

async function deleteMappedGoogleCalendarEvent(
  env: Env,
  connection: GoogleCalendarConnectionRow,
  userId: string,
  syncItemId: string,
  fetchImpl: typeof fetch,
) {
  const mapping = await loadEventMapping(env, userId, syncItemId);
  if (!mapping) {
    return { connected: true, deleted: false };
  }

  const accessToken = await ensureGoogleAccessToken(env, connection, fetchImpl);
  const response = await fetchImpl(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(mapping.calendar_id)}/events/${encodeURIComponent(mapping.google_event_id)}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`google_calendar_delete_failed_${response.status}`);
  }

  await env.DB.prepare(
    'DELETE FROM miguri_google_calendar_events WHERE user_id = ? AND miguri_entry_id = ?'
  ).bind(userId, syncItemId).run();

  return { connected: true, deleted: true };
}

async function loadSyncableMiguriWindow(env: Env, windowSyncId: string): Promise<MiguriCalendarWindowRow | null> {
  if (!env.MIGURI_DB) return null;

  const parsed = parseMiguriWindowSyncId(windowSyncId);
  if (!parsed) return null;

  return await env.MIGURI_DB.prepare(`
    SELECT w.event_slug, w.label, w.start_at, w.end_at, w.sort_order,
           m.title AS event_title, m.group_id,
           MIN(s.event_date) AS first_event_date
    FROM miguri_event_windows w
    LEFT JOIN miguri_events m ON m.slug = w.event_slug
    LEFT JOIN miguri_event_slots s ON s.event_slug = w.event_slug
    WHERE w.event_slug = ? AND w.label = ? AND w.start_at = ?
      AND m.group_id IS NOT NULL
      AND m.status != 'archived'
    GROUP BY w.event_slug, w.label, w.start_at, w.end_at, w.sort_order, m.title, m.group_id
  `).bind(parsed.eventSlug, parsed.label, parsed.startAt).first<MiguriCalendarWindowRow>();
}

async function loadSyncableMiguriWindows(env: Env): Promise<MiguriCalendarWindowRow[]> {
  if (!env.MIGURI_DB) return [];

  const rows = await env.MIGURI_DB.prepare(`
    SELECT w.event_slug, w.label, w.start_at, w.end_at, w.sort_order,
           m.title AS event_title, m.group_id,
           MIN(s.event_date) AS first_event_date
    FROM miguri_event_windows w
    LEFT JOIN miguri_events m ON m.slug = w.event_slug
    LEFT JOIN miguri_event_slots s ON s.event_slug = w.event_slug
    WHERE m.group_id IS NOT NULL
      AND m.status != 'archived'
    GROUP BY w.event_slug, w.label, w.start_at, w.end_at, w.sort_order, m.title, m.group_id
    ORDER BY w.event_slug, w.sort_order, w.start_at
  `).all<MiguriCalendarWindowRow>();

  return rows.results || [];
}

export async function syncMiguriEntryToGoogleCalendar(
  env: Env,
  userId: string,
  entryId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleCalendarSyncResult> {
  const connection = await loadGoogleCalendarConnection(env, userId);
  if (!connection || connection.sync_enabled === 0 || connection.sync_enabled === false) {
    return {
      connected: false,
      synced: false,
      googleEventId: null,
    };
  }

  const entry = await loadSyncableMiguriEntry(env, userId, entryId);
  if (!entry || !entry.start_time || !entry.end_time || !entry.group_id) {
    return {
      connected: true,
      synced: false,
      googleEventId: null,
    };
  }

  return await syncMappedGoogleCalendarEvent(
    env,
    connection,
    userId,
    entryId,
    JSON.stringify(buildGoogleCalendarEntryEventBody(entry)),
    fetchImpl,
  );
}

export async function syncMiguriEntriesToGoogleCalendar(
  env: Env,
  userId: string,
  entryIds: string[],
  fetchImpl: typeof fetch = fetch,
) {
  let syncedCount = 0;
  let failedCount = 0;

  for (const entryId of entryIds) {
    try {
      const result = await syncMiguriEntryToGoogleCalendar(env, userId, entryId, fetchImpl);
      if (result.synced) syncedCount += 1;
    } catch {
      failedCount += 1;
    }
  }

  return {
    syncedCount,
    failedCount,
  };
}

export async function syncAllMiguriEntriesToGoogleCalendar(
  env: Env,
  userId: string,
  fetchImpl: typeof fetch = fetch,
) {
  const entryIds = await loadSyncableMiguriEntryIds(env, userId);
  return await syncMiguriEntriesToGoogleCalendar(env, userId, entryIds, fetchImpl);
}

export async function syncMiguriWindowToGoogleCalendar(
  env: Env,
  userId: string,
  windowSyncId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GoogleCalendarSyncResult> {
  const connection = await loadGoogleCalendarConnection(env, userId);
  if (!connection || connection.sync_enabled === 0 || connection.sync_enabled === false) {
    return {
      connected: false,
      synced: false,
      googleEventId: null,
    };
  }

  const window = await loadSyncableMiguriWindow(env, windowSyncId);
  if (!window || !window.group_id) {
    return {
      connected: true,
      synced: false,
      googleEventId: null,
    };
  }

  const body = buildGoogleCalendarWindowEventBody(window);
  if (!body) {
    return {
      connected: true,
      synced: false,
      googleEventId: null,
    };
  }

  return await syncMappedGoogleCalendarEvent(
    env,
    connection,
    userId,
    windowSyncId,
    JSON.stringify(body),
    fetchImpl,
  );
}

export async function syncMiguriWindowsToGoogleCalendar(
  env: Env,
  userId: string,
  windowSyncIds: string[],
  fetchImpl: typeof fetch = fetch,
) {
  let syncedCount = 0;
  let failedCount = 0;

  for (const windowSyncId of windowSyncIds) {
    try {
      const result = await syncMiguriWindowToGoogleCalendar(env, userId, windowSyncId, fetchImpl);
      if (result.synced) syncedCount += 1;
    } catch {
      failedCount += 1;
    }
  }

  return {
    syncedCount,
    failedCount,
  };
}

export async function syncAllMiguriWindowsToGoogleCalendar(
  env: Env,
  userId: string,
  fetchImpl: typeof fetch = fetch,
) {
  const connection = await loadGoogleCalendarConnection(env, userId);
  if (!connection || connection.sync_enabled === 0 || connection.sync_enabled === false) {
    return {
      connected: false,
      syncedCount: 0,
      failedCount: 0,
      deletedCount: 0,
    };
  }

  const windows = await loadSyncableMiguriWindows(env);
  const windowSyncIds = windows.map((window) => buildMiguriWindowSyncId(window));
  const currentWindowIds = new Set(windowSyncIds);
  const existingMappings = await loadEventMappingsByPrefix(env, userId, 'window:');

  let deletedCount = 0;
  let failedCount = 0;

  for (const mapping of existingMappings) {
    if (currentWindowIds.has(mapping.miguri_entry_id)) continue;
    try {
      const result = await deleteMappedGoogleCalendarEvent(env, connection, userId, mapping.miguri_entry_id, fetchImpl);
      if (result.deleted) deletedCount += 1;
    } catch {
      failedCount += 1;
    }
  }

  const syncResult = await syncMiguriWindowsToGoogleCalendar(env, userId, windowSyncIds, fetchImpl);

  return {
    connected: true,
    syncedCount: syncResult.syncedCount,
    failedCount: failedCount + syncResult.failedCount,
    deletedCount,
  };
}

export async function syncAllMiguriToGoogleCalendar(
  env: Env,
  userId: string,
  fetchImpl: typeof fetch = fetch,
) {
  const entryResult = await syncAllMiguriEntriesToGoogleCalendar(env, userId, fetchImpl);
  const windowResult = await syncAllMiguriWindowsToGoogleCalendar(env, userId, fetchImpl);

  return {
    entrySyncedCount: entryResult.syncedCount,
    windowSyncedCount: windowResult.syncedCount,
    deletedCount: windowResult.deletedCount,
    failedCount: entryResult.failedCount + windowResult.failedCount,
  };
}

export async function syncAllConnectedMiguriGoogleCalendars(
  env: Env,
  fetchImpl: typeof fetch = fetch,
) {
  if (!env.DB) {
    return {
      userCount: 0,
      failedUserCount: 0,
      entrySyncedCount: 0,
      windowSyncedCount: 0,
      deletedCount: 0,
    };
  }

  const rows = await env.DB.prepare(`
    SELECT user_id
    FROM user_google_calendar_connections
    WHERE sync_enabled != 0
  `).all<{ user_id: string }>();

  let userCount = 0;
  let failedUserCount = 0;
  let entrySyncedCount = 0;
  let windowSyncedCount = 0;
  let deletedCount = 0;

  for (const row of rows.results || []) {
    try {
      const result = await syncAllMiguriToGoogleCalendar(env, row.user_id, fetchImpl);
      userCount += 1;
      entrySyncedCount += result.entrySyncedCount;
      windowSyncedCount += result.windowSyncedCount;
      deletedCount += result.deletedCount;
    } catch {
      failedUserCount += 1;
    }
  }

  return {
    userCount,
    failedUserCount,
    entrySyncedCount,
    windowSyncedCount,
    deletedCount,
  };
}

export async function deleteMiguriEntryFromGoogleCalendar(
  env: Env,
  userId: string,
  entryId: string,
  fetchImpl: typeof fetch = fetch,
) {
  const connection = await loadGoogleCalendarConnection(env, userId);
  if (!connection || !connection.sync_enabled) {
    return { connected: false, deleted: false };
  }

  return await deleteMappedGoogleCalendarEvent(env, connection, userId, entryId, fetchImpl);
}

export async function saveGoogleCalendarConnection(env: Env, userId: string, payload: {
  googleSub: string;
  googleEmail: string;
  refreshToken: string | null;
  accessToken: string;
  accessTokenExpiresAt: string;
  scope: string;
  calendarId?: string;
}) {
  const existing = await loadGoogleCalendarConnection(env, userId);
  const refreshToken = payload.refreshToken || existing?.refresh_token;
  if (!refreshToken) {
    throw new Error('google_calendar_refresh_token_missing');
  }

  await env.DB.prepare(`
    INSERT INTO user_google_calendar_connections (
      user_id,
      google_sub,
      google_email,
      calendar_id,
      refresh_token,
      access_token,
      access_token_expires_at,
      scope,
      sync_enabled
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(user_id) DO UPDATE SET
      google_sub = excluded.google_sub,
      google_email = excluded.google_email,
      calendar_id = excluded.calendar_id,
      refresh_token = excluded.refresh_token,
      access_token = excluded.access_token,
      access_token_expires_at = excluded.access_token_expires_at,
      scope = excluded.scope,
      sync_enabled = 1,
      updated_at = datetime('now')
  `).bind(
    userId,
    payload.googleSub,
    payload.googleEmail,
    payload.calendarId || 'primary',
    refreshToken,
    payload.accessToken,
    payload.accessTokenExpiresAt,
    payload.scope,
  ).run();
}
