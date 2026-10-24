import { useEffect, useRef, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { getAdminActivity, type AdminActivity } from '@/utils/auth-api';

// 46log 活跃度 (2026-10-25): page-view beacons from workers/auth routes/activity.ts. Shown only to ACTIVITY_VIEWER_IDS.
const fmtMs = (ms: number) => {
  const s = Math.round(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}小时${m}分` : m ? `${m}分${s % 60}秒` : `${s}秒`;
};
const avg = (ms: number, views: number) => (views ? fmtMs(ms / views) : '—');
const cell = 'px-3 py-2 text-xs text-[var(--text-secondary)] whitespace-nowrap';
const head = 'px-3 py-2 text-[10px] font-semibold text-[var(--text-tertiary)] text-left whitespace-nowrap';

function Table({ cols, rows }: { cols: string[]; rows: (string | number)[][] }) {
  if (!rows.length) return <p className="text-xs text-[var(--text-tertiary)] py-4">还没有数据</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border-primary)]">
      <table className="w-full">
        <thead className="bg-[var(--bg-secondary)]"><tr>{cols.map(c => <th key={c} className={head}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-[var(--border-primary)]">{r.map((v, j) => <td key={j} className={`${cell} ${j ? 'tabular-nums' : 'max-w-[18rem] truncate'}`}>{v}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Card({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="p-3 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-secondary)]">
      <p className="text-[10px] text-[var(--text-tertiary)]">{label}</p>
      <p className="text-lg font-bold text-[var(--text-primary)] tabular-nums">{value}</p>
      {note && <p className="text-[10px] text-[var(--text-tertiary)]">{note}</p>}
    </div>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2"><h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>{children}</section>
);

export default function ActivityTab({ first }: { first: { data?: AdminActivity; error?: string } }) {
  const [days, setDays] = useState(30);
  const [res, setRes] = useState(first);
  const [loading, setLoading] = useState(false);
  const load = async (d: number) => { setLoading(true); const r = await getAdminActivity(d); setRes({ data: r.data, error: r.success ? undefined : r.error }); setLoading(false); };
  const mounted = useRef(false);
  // The first 30-day report came with the dashboard; every later choice (including back to 30) reloads.
  useEffect(() => { if (mounted.current) void load(days); else mounted.current = true; }, [days]);

  if (res.error === 'analytics_token_missing') return (
    <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-950/30 text-xs text-[var(--text-secondary)] space-y-1">
      <p className="font-semibold">已经在记录，但后台还读不到数据。</p>
      <p>需要给 auth Worker 设置只读令牌 <code>CF_ANALYTICS_TOKEN</code>（Cloudflare API Token，权限 Account Analytics: Read）。</p>
    </div>
  );
  const a = res.data;
  const devices = a ? a.devices.mobile + a.devices.desktop : 0;
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-1">
        {[7, 30, 90].map(d => (
          <button key={d} onClick={() => setDays(d)} className={`px-3 py-1.5 text-xs font-medium rounded-lg cursor-pointer ${days === d ? 'bg-[var(--color-brand-nogi)] text-white' : 'text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)]'}`}>近{d}天</button>
        ))}
        <button onClick={() => load(days)} aria-label="刷新" className="ml-auto p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--bg-tertiary)] cursor-pointer">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
        </button>
      </div>
      {!a ? <p className="text-xs text-red-500">读取失败（{res.error ?? 'unknown'}），稍后再试。</p> : <>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card label="登录用户" value={a.summary.users.people} note={`其中 ${a.summary.users.returning} 人来了 2 天以上`} />
          <Card label="未登录访客" value={a.summary.visitors.people} note={`其中 ${a.summary.visitors.returning} 个来了 2 天以上`} />
          <Card label="浏览量" value={a.summary.users.views + a.summary.visitors.views} note={devices ? `手机 ${Math.round(a.devices.mobile / devices * 100)}%` : undefined} />
          <Card label="每次浏览平均停留" value={avg(a.summary.users.ms + a.summary.visitors.ms, a.summary.users.views + a.summary.visitors.views)} note={`登录用户 ${avg(a.summary.users.ms, a.summary.users.views)}`} />
        </div>
        <Section title="每天">
          <Table cols={['日期（JST）', '登录用户', '访客', '浏览', '停留合计']} rows={[...a.daily].reverse().map(d => [d.day, d.users, d.visitors, d.views, fmtMs(d.ms)])} />
        </Section>
        <Section title="登录用户（按停留时间，前 50）">
          <Table cols={['用户', '最近一天', '活跃天数', '浏览', '停留合计']} rows={a.users.map(u => [u.name || u.id.slice(0, 8), u.lastDay, u.activeDays, u.views, fmtMs(u.ms)])} />
        </Section>
        <Section title="版块">
          <Table cols={['版块', '浏览', '平均停留']} rows={a.sections.map(s => [`/${s.section === 'home' ? '' : s.section}`, s.views, avg(s.ms, s.views)])} />
        </Section>
        <Section title="页面（前 30）">
          <Table cols={['路径', '浏览', '平均停留']} rows={a.pages.map(p => [p.path, p.views, avg(p.ms, p.views)])} />
        </Section>
        <p className="text-[10px] text-[var(--text-tertiary)] leading-relaxed">
          停留时间只算页面在前台显示的时间，单次最多计 30 分钟。登录 Cookie 过期后的访问，按同一浏览器归到该账号。不含自动化浏览器和预览站。数据保留约 90 天；浏览器开启「Do Not Track / GPC」的访问不记录。
        </p>
      </>}
    </div>
  );
}
