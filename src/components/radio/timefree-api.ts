import { API_CONFIG } from '../../utils/constants.ts';
import { refreshToken } from '../../utils/auth-api.ts';

export const TIMEFREE_API_BASE = `${API_CONFIG.baseUrl}/api/radio/timefree`;

export interface ParsedRadikoUrl {
  stationId: string;
  ft: string;
}

export interface TimefreeJob {
  job_id: string;
  status: 'queued' | 'downloading' | 'done' | 'failed';
  station: string;
  ft: string;
  title: string;
  performer: string;
  image: string;
  startTime: string;
  endTime: string;
  progress: number;
  error: string | null;
  created: string;
  download_path?: string;
}

export interface TimefreeResult {
  ok: boolean;
  status: number;
  data?: TimefreeJob;
  error?: string;
}

const STATION_RE = /^[A-Z0-9-]+$/;
const FT_RE = /^\d{14}$/;

/** 与后端 parse_radiko_url 同规则：ts 分享链与 share/?sid=&t= */
export function parseRadikoUrl(url: string): ParsedRadikoUrl | null {
  if (typeof url !== 'string') return null;
  url = url.trim();
  let station = '';
  let ft = '';
  const m = /^https?:\/\/(?:www\.)?radiko\.jp\/#!\/ts\/([^/]+)\/(\d{14})\s*$/.exec(url);
  if (m) {
    station = m[1];
    ft = m[2];
  } else {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    if ((host !== 'radiko.jp' && host !== 'www.radiko.jp') || !parsed.pathname.startsWith('/share')) {
      return null;
    }
    station = parsed.searchParams.get('sid') || '';
    ft = parsed.searchParams.get('t') || '';
  }
  if (!STATION_RE.test(station) || !FT_RE.test(ft)) return null;
  if (!validFt(ft)) return null;
  return { stationId: station, ft };
}

function validFt(ft: string): boolean {
  const y = +ft.slice(0, 4);
  const mo = +ft.slice(4, 6);
  const d = +ft.slice(6, 8);
  const h = +ft.slice(8, 10);
  const mi = +ft.slice(10, 12);
  const s = +ft.slice(12, 14);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** ft (YYYYMMDDHHmmss, JST) → "2026-09-28 05:00" */
export function formatFtJst(ft: string): string {
  return `${ft.slice(0, 4)}-${ft.slice(4, 6)}-${ft.slice(6, 8)} ${ft.slice(8, 10)}:${ft.slice(10, 12)}`;
}

export function errorMessage(code: string | undefined): string {
  switch (code) {
    case 'invalid_url': return '无法识别的 radiko 链接，请粘贴 #!/ts/ 或 share 链接';
    case 'program_not_found': return '找不到该节目，请确认链接中的电台与时间';
    case 'not_ended': return '节目尚未结束，结束后再试';
    case 'expired': return '已超出 radiko 7 天时移期限';
    case 'too_long': return '节目超过 4 小时，暂不支持';
    case 'busy': return '正在下载其他节目，请稍后再试';
    case 'disk_full': return '服务器空间不足，请稍后再试';
    case 'unauthorized': return '请先登录';
    case 'origin_denied': return '请求来源被拒绝';
    case 'auth_upstream': return '登录状态检查失败，请稍后再试';
    case 'not_found': return '任务不存在或已过期';
    default: return '下载失败，请稍后再试';
  }
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<TimefreeResult> {
  const doFetch = () => fetch(`${TIMEFREE_API_BASE}${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  let res = await doFetch();
  if (res.status === 401) {
    const refreshed = await refreshToken();
    if (refreshed) res = await doFetch();
  }
  let body: { ok?: boolean; data?: TimefreeJob; error?: string } = {};
  try {
    body = await res.json();
  } catch {
    // non-JSON body
  }
  if (res.status === 401) {
    return { ok: false, status: res.status, error: 'unauthorized' };
  }
  return {
    ok: res.ok && body.ok !== false,
    status: res.status,
    data: body.data,
    error: body.error,
  };
}

export function createDownload(url: string): Promise<TimefreeResult> {
  return apiFetch('', { method: 'POST', body: JSON.stringify({ url }) });
}

export function getJob(jobId: string): Promise<TimefreeResult> {
  return apiFetch(`/${encodeURIComponent(jobId)}`);
}

export function downloadUrl(downloadPath: string): string {
  return `${API_CONFIG.baseUrl}${downloadPath}`;
}
