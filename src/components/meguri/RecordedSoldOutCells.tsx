import { useMemo, useState } from 'react';
import type { MiguriSoldOutPayload } from '@/utils/auth-api';

// Read-only fallback when upstream sync no longer provides a complete slot structure.
// Do not infer denominators, zero-sale members, or full-sold-out status from these cells.
export default function RecordedSoldOutCells({ data }: { data: MiguriSoldOutPayload }) {
  const [round, setRound] = useState('');
  const [member, setMember] = useState('');
  const [page, setPage] = useState(0);
  const cells = useMemo(() => data.cells.filter((cell) => (
    (!round || cell.round <= Number(round))
    && cell.member.replace(/\s/g, '').includes(member.replace(/\s/g, ''))
  )), [data, round, member]);
  const pageCount = Math.max(1, Math.ceil(cells.length / 100));

  return <div className="space-y-4" data-incomplete-soldout>
    <p className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs leading-6 text-amber-900" role="status">
      活动部次结构缺失，以下仅列出已保存的完售格。无法可靠计算总部数、完售率或全完售成员，不把缺失信息视为0。
    </p>
    <div className="flex flex-wrap gap-2 text-xs">
      <select aria-label="回看完售轮次" value={round} onChange={(event) => { setRound(event.target.value); setPage(0); }} className="min-h-11 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2">
        <option value="">全轮次累计</option>
        {data.rounds.map((item) => <option key={item.round} value={item.round}>{item.windowLabel || `第${item.round}次`}</option>)}
      </select>
      <input type="search" aria-label="搜索已记录成员" placeholder="搜索成员" value={member} onChange={(event) => { setMember(event.target.value); setPage(0); }} className="min-h-11 min-w-0 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3" />
    </div>
    <p className="text-xs text-[var(--text-tertiary)]">匹配 {cells.length} 条已记录完售格（不是活动总部数）</p>
    <div className="overflow-x-auto">
      <table className="w-full whitespace-nowrap text-left text-xs">
        <thead><tr className="border-b border-[var(--border-primary)]"><th className="p-2">成员</th><th className="p-2">日期</th><th className="p-2">部次</th><th className="p-2">记录轮次</th></tr></thead>
        <tbody>{cells.slice(page * 100, (page + 1) * 100).map((cell) => <tr key={`${cell.member}:${cell.date}:${cell.slot}:${cell.round}`} className="border-b border-[var(--border-secondary)]">
          <td className="p-2">{cell.member}</td><td className="p-2">{cell.date}</td><td className="p-2">第{cell.slot}部</td><td className="p-2">第{cell.round}次</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="flex items-center justify-between gap-2 text-xs">
      <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="min-h-11 px-3 disabled:opacity-40">上一页</button>
      <span>{page + 1} / {pageCount}</span>
      <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)} className="min-h-11 px-3 disabled:opacity-40">下一页</button>
    </div>
  </div>;
}
