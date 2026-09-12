import { useEffect, useMemo, useRef, useState } from 'react';
import { GROUPS, type GroupKey } from './blog-config';
import type { Analysis, Edge } from '../../utils/blog-relations/analyze';
import { SOURCE_SCHEMA_VERSION, type SourceMonth } from '../../utils/blog-relations/contract.ts';
import { relationshipRanking, generationRelations } from './relationship-helpers.ts';

type CatalogMonth = { group: GroupKey; month: string; blogCount: number; latestSourceUpdate: string };
const panel = 'rounded-xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 sm:p-5';
const control = 'min-h-10 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-3 text-sm text-[var(--text-primary)]';
const pairKey = (edge: Edge) => `${edge.from}::${edge.to}`;
const PAGE_SIZE = 10;

async function readApi<T>(query: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`/api/blog-relations${query}`, { signal, credentials: 'same-origin' });
  const result = await response.json();
  if (!response.ok || result.success !== true || !result.data) throw new Error(result.error || '关系分析读取失败');
  return result.data as T;
}
function analyzeInWorker(source: SourceMonth, signal: AbortSignal): Promise<Analysis> {
  if (source.version !== SOURCE_SCHEMA_VERSION || !Array.isArray(source.rows)) return Promise.reject(new Error('存档格式已更新，请刷新页面。'));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./relationship-analysis.worker.ts', import.meta.url), { type: 'module' });
    const dispose = () => { worker.terminate(); clearTimeout(timer); signal.removeEventListener('abort', abort); };
    const abort = () => { dispose(); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { dispose(); reject(new Error('本机分析超时，请选择其他月份或重试。')); }, 30_000);
    worker.onmessage = (event: MessageEvent<{ success: boolean; data?: Analysis; error?: string }>) => {
      dispose();
      if (event.data.success && event.data.data) resolve(event.data.data);
      else reject(new Error(event.data.error || '日语提及分析失败'));
    };
    worker.onerror = (event) => { event.preventDefault(); dispose(); reject(new Error('无法启动分析线程，请刷新页面或更换浏览器。')); };
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort(); else worker.postMessage(source);
  });
}
function formatTime(value: string | null) {
  if (!value) return '未知';
  const date = new Date(/(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? '未知' : `${date.toLocaleString('zh-CN', { timeZone: 'Asia/Tokyo', hour12: false })} JST`;
}

export default function BlogInteractions() {
  const [catalog, setCatalog] = useState<CatalogMonth[]>([]);
  const [group, setGroup] = useState<GroupKey>('sakurazaka');
  const [month, setMonth] = useState('');
  const [tab, setTab] = useState<'mentions' | 'ranking' | 'generation'>('mentions');
  const [member, setMember] = useState('');
  const [direction, setDirection] = useState<'both' | 'incoming' | 'outgoing'>('both');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [sourceFetchedAt, setSourceFetchedAt] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [selectedPair, setSelectedPair] = useState('');
  const [evidencePage, setEvidencePage] = useState(1);
  const evidenceHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setCatalogLoading(true); setCatalogError('');
    readApi<{ months: CatalogMonth[] }>('', controller.signal).then((data) => {
      if (!controller.signal.aborted) setCatalog(data.months);
    }).catch((err) => { if (!controller.signal.aborted) setCatalogError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setCatalogLoading(false); });
    return () => controller.abort();
  }, [retry]);

  const months = useMemo(() => catalog.filter((entry) => entry.group === group).map((entry) => entry.month).sort().reverse(), [catalog, group]);
  useEffect(() => { if (!months.includes(month)) setMonth(months[0] || ''); }, [months, month]);
  useEffect(() => {
    setMember(''); setDirection('both'); setSelectedPair(''); setEvidencePage(1); setAnalysis(null); setSourceFetchedAt(null); setError('');
    if (!month || !months.includes(month)) return;
    const controller = new AbortController();
    setLoading(true);
    readApi<SourceMonth>(`?group=${group}&month=${month}&format=source`, controller.signal).then(async (source) => {
      if (source.group !== group || source.month !== month) throw new Error('存档月份不匹配，请重试。');
      const data = await analyzeInWorker(source, controller.signal);
      if (!controller.signal.aborted) { setAnalysis(data); setSourceFetchedAt(source.sourceFetchedAt); }
    }).catch((err) => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [group, month, months, retry]);
  useEffect(() => { if (selectedPair) evidenceHeading.current?.focus(); }, [selectedPair]);

  const current = analysis?.group === group && analysis.month === month ? analysis : null;
  const edges = current?.edges || [];
  const filtered = edges.filter((edge) => !member || (direction !== 'incoming' && edge.from === member) || (direction !== 'outgoing' && edge.to === member));
  const ranking = relationshipRanking(edges);
  const generation = generationRelations(edges);
  const selected = edges.find((edge) => pairKey(edge) === selectedPair);
  const choose = (edge: Edge) => { setSelectedPair(pairKey(edge)); setEvidencePage(1); };
  const unavailable = current ? current.coverage.sourceRows - current.coverage.duplicateRows - current.coverage.analyzedBlogs : 0;

  return (
    <section className="space-y-4" aria-label="博客提及关系分析">
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs text-[var(--text-secondary)]">团体
          <select aria-label="团体" className={control} value={group} onChange={(event) => setGroup(event.target.value as GroupKey)}>
            {(['sakurazaka', 'nogizaka', 'hinatazaka'] as GroupKey[]).map((key) => <option key={key} value={key}>{GROUPS[key].name}</option>)}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-[var(--text-secondary)]">博客月份（JST）
          <select aria-label="博客月份（JST）" className={control} value={month} onChange={(event) => setMonth(event.target.value)} disabled={!months.length}>
            {!months.length && <option value="">暂无存档月份</option>}
            {months.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <button className={control} type="button" onClick={() => setRetry((value) => value + 1)}>重新读取</button>
      </div>

      <div className={`${panel} text-xs leading-6 text-[var(--text-secondary)]`}>
        <h2 className="mb-1 text-base font-semibold text-[var(--text-primary)]">真实博客提及 · 可查看原文依据</h2>
        <p>方向为「博客作者 → 文中被提及成员」。只分析本站存档中的日语正文，不分析译文、图片或私下关系，不计算“亲密度”。目前仅统计同团成员，包含名录内的毕业成员。</p>
        <p>识别全名、带敬称的唯一简称，以及同段全名可消歧的简称。裸单字、无法确认的昵称不计入；未识别不代表没有交流。引述、告知中的名字也可能被计入，因此数字只代表文字提及。</p>
        <p>双语存档只读取标记为日语的段落；早期缺失正文明确排除。数据源缓存10分钟，浏览器后台线程按需计算，不阻塞页面操作；不再回退旧静态数据，也不再声称按周更新。</p>
      </div>

      {(catalogLoading || loading) && <p className="loading-state" role="status">正在读取日语存档并计算提及依据…</p>}
      {(catalogError || error) && <div className={`${panel} text-sm text-red-600`} role="alert">{catalogError || error}</div>}
      {!catalogLoading && !catalogError && !months.length && <p className={panel}>该团暂无可查询的本站存档月份，不代表官方没有发布博客。</p>}
      {current && !loading && !catalogError && !error && <>
        <div className={`${panel} text-xs leading-6 text-[var(--text-secondary)]`} data-relations-coverage>
          <div className="flex flex-wrap gap-x-6 gap-y-1 font-semibold text-[var(--text-primary)]">
            <span>源记录 {current.coverage.sourceRows} 篇</span><span>已分析日语正文 {current.coverage.analyzedBlogs} 篇</span>
            <span>未纳入 {unavailable} 篇</span><span>去重 {current.coverage.duplicateRows} 条</span><span>提及组合 {edges.length} 组</span>
          </div>
          <p>独立原文 {current.coverage.originalBlogs} 篇 · 双语存档日语段落 {current.coverage.bilingualJapaneseBlogs} 篇 · 缺日语正文 {current.coverage.missingJapanese} 篇 · 非名录作者 {current.coverage.unknownAuthor} 篇 · 来源/日期异常 {current.coverage.invalidSource + current.coverage.invalidDate} 篇 · 超出大小限制 {current.coverage.oversized} 篇</p>
          {current.unknownAuthors.length > 0 && <p>未纳入作者：{current.unknownAuthors.join('、')}</p>}
          <p>源数据读取：{formatTime(sourceFetchedAt)} · 本机计算时间：{formatTime(current.computedAt)} · 存档最新变更：{formatTime(current.latestSourceUpdate)}</p>
          <p>仅代表本站实际存档，不代表官网全量；当月为截至计算时的部分月份。口径版本：{current.version}</p>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="分析视图">
          {([['mentions', '提及关系'], ['ranking', '被提及排行'], ['generation', '期别提及']] as const).map(([key, label]) =>
            <button key={key} className={control} type="button" aria-pressed={tab === key} style={tab === key ? { borderColor: 'var(--color-brand-nogi)', color: 'var(--color-brand-nogi)' } : {}} onClick={() => { setTab(key); setSelectedPair(''); }}>{label}</button>)}
        </div>

        {!edges.length ? <p className={panel}>{current.coverage.analyzedBlogs ? `已分析的 ${current.coverage.analyzedBlogs} 篇中，没有识别出符合当前规则的同团提及。` : '没有可用的日语正文，无法得出提及统计。'}</p> : tab === 'mentions' ? <div className={panel}>
          <label className="mb-4 flex flex-wrap items-center gap-2 text-sm">查看成员
            <select aria-label="查看成员" className={control} value={member} onChange={(event) => { setMember(event.target.value); setSelectedPair(''); }}>
              <option value="">所有成员</option>{current.members.map((item) => <option key={item.name} value={item.name}>{item.name}</option>)}
            </select>
          </label>
          {member && <label className="mb-3 flex flex-wrap items-center gap-2 text-sm">方向
            <select aria-label="方向" className={control} value={direction} onChange={(event) => { setDirection(event.target.value as typeof direction); setSelectedPair(''); }}>
              <option value="both">提及与被提及</option><option value="incoming">谁提及该成员</option><option value="outgoing">该成员提及谁</option>
            </select>
          </label>}
          <p className="mb-3 text-xs text-[var(--text-tertiary)]">按涉及博客篇数排序；同一篇重复提及算1篇，出现次数另列。选择一组查看具体依据。</p>
          <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead><tr className="border-b border-[var(--border-primary)]"><th className="p-2">作者 → 对象</th><th className="p-2 whitespace-nowrap">博客 / 出现处数</th><th className="p-2">依据</th></tr></thead>
            <tbody>{filtered.map((edge) => <tr key={pairKey(edge)} className="border-b border-[var(--border-primary)] last:border-0">
              <td className="p-2"><span className="font-medium">{edge.from}</span><span className="mx-1 text-[var(--text-tertiary)]">→</span><span>{edge.to}</span></td>
              <td className="p-2 whitespace-nowrap">{edge.articleCount} 篇 / {edge.occurrences} 处</td>
              <td className="p-2"><button className={`${control} whitespace-nowrap`} type="button" onClick={() => choose(edge)} aria-label={`查看 ${edge.from} 提及 ${edge.to} 的依据`}>查看依据</button></td>
            </tr>)}</tbody>
          </table></div>
          {!filtered.length && <p className="py-4 text-sm text-[var(--text-tertiary)]">当前存档及识别规则下，没有该成员的提及记录。</p>}
        </div> : tab === 'ranking' ? <div className={`${panel} space-y-3`}>
          <p className="text-xs text-[var(--text-tertiary)]">按被提及的独立博客篇数排序，不是人气或私交排名。点击成员查看来源组合。</p>
          {ranking.map((item, index) => <div key={item.name} className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-primary)] pb-3">
            <span className="text-sm">{index + 1}. {item.name} <span className="text-xs text-[var(--text-tertiary)]">{item.generation}</span></span>
            <button className={control} type="button" onClick={() => { setMember(item.name); setDirection('incoming'); setTab('mentions'); }}>{item.blogCount} 篇 / {item.occurrences} 处 · 查看来源</button>
          </div>)}
        </div> : <div className={panel}>
          <p className="mb-3 text-xs leading-6 text-[var(--text-tertiary)]">作者期别 → 被提及期别。数字为「作者 × 对象 × 博客」提及记录数；同一篇提及多位成员会形成多条记录，不是去重博客篇数。点击数字查看对应组合。</p>
          <div className="overflow-x-auto"><table className="w-full text-center text-sm"><thead><tr><th className="p-2">提及 → 被提及</th>{generation.generations.map((gen) => <th key={gen} className="p-2 whitespace-nowrap">{gen}</th>)}</tr></thead>
            <tbody>{generation.generations.map((from, row) => <tr key={from}><th className="p-2 whitespace-nowrap">{from}</th>{generation.generations.map((to, col) => <td key={to} className="p-1"><button className={`${control} w-full`} disabled={!generation.matrix[row][col]} onClick={() => { const edge = edges.find((edge) => edge.fromGen === from && edge.toGen === to); if (edge) { setSelectedPair(`generation:${from}:${to}`); setEvidencePage(1); } }}>{generation.matrix[row][col]}</button></td>)}</tr>)}</tbody>
          </table></div>
          {selectedPair.startsWith('generation:') && <div className="mt-4 space-y-2">{edges.filter((edge) => selectedPair === `generation:${edge.fromGen}:${edge.toGen}`).map((edge) => <button key={pairKey(edge)} className={`${control} mr-2`} onClick={() => choose(edge)}>{edge.from} → {edge.to} · {edge.articleCount} 篇</button>)}</div>}
        </div>}

        {selected && <section className={`${panel} space-y-4`} aria-labelledby="relation-evidence-title" data-relations-evidence>
          <div className="flex items-start justify-between gap-3">
            <div><h3 id="relation-evidence-title" tabIndex={-1} ref={evidenceHeading} className="text-base font-semibold">{selected.from} → {selected.to}</h3><p className="mt-1 text-xs text-[var(--text-tertiary)]">{selected.articleCount} 篇博客 / {selected.occurrences} 处文字提及。每篇最多展示3处片段，其余见原文；片段仅做空白和 Unicode 标准化。</p></div>
            <button className={`${control} shrink-0 whitespace-nowrap`} onClick={() => setSelectedPair('')}>关闭依据</button>
          </div>
          {selected.evidence.slice((evidencePage - 1) * PAGE_SIZE, evidencePage * PAGE_SIZE).map((evidence) => <article key={evidence.blogId} className="border-t border-[var(--border-primary)] pt-4">
            <h4 className="font-medium">{evidence.title}</h4><p className="my-2 text-xs text-[var(--text-tertiary)]">{evidence.publishedAt} JST · 本篇 {evidence.occurrences} 处 · {evidence.source === 'original_content' ? '独立原文存档' : '双语存档的日语段落'}</p>
            <div className="space-y-2">{evidence.snippets.map((snippet, index) => <blockquote key={index} className="whitespace-pre-line break-words rounded-lg bg-[var(--bg-secondary)] p-3 text-sm leading-7">{snippet.before}<mark className="rounded bg-amber-200 px-0.5 text-black">{snippet.match}</mark>{snippet.after}<span className="mt-1 block text-[10px] text-[var(--text-tertiary)]">{snippet.kind === 'full-name' ? '全名' : snippet.kind === 'honorific' ? '简称＋敬称' : '同段全名消歧的简称'}</span></blockquote>)}</div>
            <div className="mt-3 flex flex-wrap gap-3 text-xs"><a className="underline" href={evidence.sourceUrl} target="_blank" rel="noopener noreferrer">官方原文 ↗</a><a className="underline" href={`/blog/#blog/${encodeURIComponent(evidence.blogId)}`} target="_blank" rel="noopener noreferrer">站内博客 ↗</a></div>
          </article>)}
          <div className="flex flex-wrap items-center gap-3 text-xs"><button className={control} disabled={evidencePage <= 1} onClick={() => setEvidencePage((value) => value - 1)}>上一页依据</button><span>第 {evidencePage} / {Math.ceil(selected.evidence.length / PAGE_SIZE)} 页</span><button className={control} disabled={evidencePage * PAGE_SIZE >= selected.evidence.length} onClick={() => setEvidencePage((value) => value + 1)}>下一页依据</button></div>
        </section>}
      </>}
    </section>
  );
}
