import { useMemo, useState } from 'react';
import type { MiguriSoldOutPayload } from '@/utils/auth-api';
import { useLanguage } from '@/i18n/use-language';
import { soldOutTranslator } from '@/i18n/miguri-soldout';

// Read-only fallback when upstream sync no longer provides a complete slot structure.
// Do not infer denominators, zero-sale members, or full-sold-out status from these cells.
export default function RecordedSoldOutCells({ data }: { data: MiguriSoldOutPayload }) {
  const st = soldOutTranslator(useLanguage());
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
      {st('incomplete')}
    </p>
    <div className="flex flex-wrap gap-2 text-xs">
      <select aria-label={st('roundSelect')} value={round} onChange={(event) => { setRound(event.target.value); setPage(0); }} className="min-h-11 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2">
        <option value="">{st('allRounds')}</option>
        {data.rounds.map((item) => <option key={item.round} value={item.round}>{item.windowLabel || st('roundN', { n: item.round })}</option>)}
      </select>
      <input type="search" aria-label={st('searchMember')} placeholder={st('searchMemberPlaceholder')} value={member} onChange={(event) => { setMember(event.target.value); setPage(0); }} className="min-h-11 min-w-0 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3" />
    </div>
    <p className="text-xs text-[var(--text-tertiary)]">{st('matchedCells', { n: cells.length })}</p>
    <div className="overflow-x-auto">
      <table className="w-full whitespace-nowrap text-left text-xs">
        <thead><tr className="border-b border-[var(--border-primary)]"><th className="p-2">{st('member')}</th><th className="p-2">{st('date')}</th><th className="p-2">{st('slot')}</th><th className="p-2">{st('recordedRound')}</th></tr></thead>
        <tbody>{cells.slice(page * 100, (page + 1) * 100).map((cell) => <tr key={`${cell.member}:${cell.date}:${cell.slot}:${cell.round}`} className="border-b border-[var(--border-secondary)]">
          <td className="p-2">{cell.member}</td><td className="p-2">{cell.date}</td><td className="p-2">{st('slotN', { n: cell.slot })}</td><td className="p-2">{st('roundN', { n: cell.round })}</td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="flex items-center justify-between gap-2 text-xs">
      <button type="button" disabled={page === 0} onClick={() => setPage(page - 1)} className="min-h-11 px-3 disabled:opacity-40">{st('prevPage')}</button>
      <span>{page + 1} / {pageCount}</span>
      <button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)} className="min-h-11 px-3 disabled:opacity-40">{st('nextPage')}</button>
    </div>
  </div>;
}
