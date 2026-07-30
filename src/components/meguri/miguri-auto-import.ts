import type { MiguriImportRecord } from '@/utils/auth-api';

export const MIGURI_HANDOFF_PREFIX = 'MIGURI46LOG1:';
export const MIGURI_IMPORT_CHUNK_SIZE = 500;

export type MiguriImportNextStep = 'music' | 'meets' | 'done';

export type MiguriImportHandoff = {
  version: 1;
  source: 'fortunemusic' | 'fortunemeets';
  next: MiguriImportNextStep;
  records: MiguriImportRecord[];
  completedAt?: string;
};

const ALLOWED_REFERRER_HOSTS = ['fortunemusic.jp', 'fortunemeets.app'];

function isAllowedHostname(hostname: string): boolean {
  return ALLOWED_REFERRER_HOSTS.some((allowed) => (
    hostname === allowed || hostname.endsWith(`.${allowed}`)
  ));
}

export function parseMiguriImportHandoff(
  windowName: string,
  referrer: string,
): MiguriImportHandoff | null {
  if (!windowName.startsWith(MIGURI_HANDOFF_PREFIX)) return null;

  let referrerHostname = '';
  try {
    referrerHostname = new URL(referrer).hostname;
  } catch {
    return null;
  }
  if (!isAllowedHostname(referrerHostname)) return null;

  try {
    const payload = JSON.parse(windowName.slice(MIGURI_HANDOFF_PREFIX.length)) as Partial<MiguriImportHandoff>;
    if (payload.version !== 1) return null;
    if (payload.source !== 'fortunemusic' && payload.source !== 'fortunemeets') return null;
    if (!['music', 'meets', 'done'].includes(payload.next || '')) return null;
    if (!Array.isArray(payload.records) || payload.records.length === 0) return null;
    return payload as MiguriImportHandoff;
  } catch {
    return null;
  }
}

export function splitMiguriImportRecords(records: MiguriImportRecord[]): MiguriImportRecord[][] {
  const chunks: MiguriImportRecord[][] = [];
  for (let index = 0; index < records.length; index += MIGURI_IMPORT_CHUNK_SIZE) {
    chunks.push(records.slice(index, index + MIGURI_IMPORT_CHUNK_SIZE));
  }
  return chunks;
}
