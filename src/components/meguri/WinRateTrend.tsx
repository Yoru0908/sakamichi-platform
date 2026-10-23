import { useEffect, useRef, useState } from "react";
import { TrendingUp } from "lucide-react";
import type { WinRatePoint, WinRateSeries, WinRateTrend as Trend } from "./meguri-helpers";

type Cut = "member" | "slot";

const OVERALL_COLOR = "#64748b";
const LINE_COLORS = ["#6366f1", "#ec4899", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6"];
const COLUMN_PX = 76;
const DEFAULT_MEMBERS = 3;
const CUTS: Array<[Cut, string]> = [
  ["member", "按成员"],
  ["slot", "按部"],
];

const rate = (point: WinRatePoint) => Math.min(1, point.won / point.applied);
const percent = (value: number) => `${Math.round(value * 100)}%`;

function RateCell({ point }: { point: WinRatePoint | null }) {
  if (!point) return <span className="text-[var(--text-tertiary)]">—</span>;
  return (
    <>
      <div className="font-bold text-[var(--text-primary)]">{percent(rate(point))}</div>
      <div className="text-[10px] text-[var(--text-tertiary)]">
        {point.won}/{point.applied}
      </div>
    </>
  );
}

/** 中签率推移: one column per single / album; lines and the full table cut by member or by 部. */
export default function WinRateTrend({ trend }: { trend: Trend }) {
  const [cut, setCut] = useState<Cut>("member");
  const [picked, setPicked] = useState<Record<Cut, string[] | null>>({ member: null, slot: null });
  const [selected, setSelected] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const count = trend.releases.length;
  const active = selected !== null && selected < count ? selected : count - 1;
  const all = cut === "member" ? trend.members : trend.slots;
  const colored = all.slice(0, LINE_COLORS.length).map((item, index) => ({ ...item, color: LINE_COLORS[index] }));
  const shown =
    picked[cut] ??
    (cut === "member" ? colored.slice(0, DEFAULT_MEMBERS) : colored).map((item) => item.name);
  const lines: Array<WinRateSeries & { color: string; dashed?: boolean }> = [
    { ...trend.overall, color: OVERALL_COLOR, dashed: true },
    ...colored.filter((item) => shown.includes(item.name)),
  ];
  const colorOf = new Map(colored.map((item) => [item.name, item.color]));
  const x = (index: number) => ((index + 0.5) / count) * 100;
  const y = (point: WinRatePoint) => (1 - rate(point)) * 100;

  // Open on the latest single when the chart is wider than the card.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [count]);

  const toggle = (name: string) =>
    setPicked({ ...picked, [cut]: shown.includes(name) ? shown.filter((item) => item !== name) : [...shown, name] });

  return (
    <section className="rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <TrendingUp size={16} className="text-indigo-500" />
          <h3 className="text-sm font-bold text-[var(--text-primary)]">中签率推移</h3>
          <span className="text-xs text-[var(--text-tertiary)]">按单曲 · 点列或行高亮该期</span>
        </div>
        <div className="flex self-start overflow-x-auto rounded-xl border border-[var(--border-primary)] p-1">
          {CUTS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={cut === value}
              onClick={() => setCut(value)}
              className={`min-h-9 shrink-0 rounded-lg px-3 text-[11px] font-semibold ${
                cut === value ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" : "text-[var(--text-secondary)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[var(--border-primary)] px-3 text-xs font-semibold text-[var(--text-secondary)]">
          <span className="h-0.5 w-3 border-t-2 border-dashed" style={{ borderColor: OVERALL_COLOR }} />
          全部
        </span>
        {colored.map((item) => {
          const on = shown.includes(item.name);
          return (
            <button
              key={item.name}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(item.name)}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
                on
                  ? "border-indigo-500/30 bg-indigo-500/10 text-[var(--text-primary)]"
                  : "border-[var(--border-primary)] text-[var(--text-tertiary)]"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: on ? item.color : "var(--border-primary)" }} />
              {item.name}
            </button>
          );
        })}
      </div>

      <div className="mt-4 flex gap-2">
        <div className="relative h-44 w-9 shrink-0 text-right text-[10px] tabular-nums text-[var(--text-tertiary)]">
          {[1, 0.5, 0].map((value) => (
            <span key={value} className="absolute right-0 -translate-y-1/2" style={{ top: `calc(${(1 - value) * 100}% * 0.9 + 5%)` }}>
              {percent(value)}
            </span>
          ))}
        </div>
        <div ref={scroller} className="min-w-0 flex-1 overflow-x-auto">
          <div className="relative" style={{ minWidth: count * COLUMN_PX }}>
            <div className="relative h-44">
              <div className="pointer-events-none absolute inset-x-0 top-[5%] bottom-[5%]">
                {[0, 50, 100].map((top) => (
                  <div key={top} className="absolute inset-x-0 border-t border-dashed border-[var(--border-primary)]" style={{ top: `${top}%` }} />
                ))}
                <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  {lines.map((line) => (
                    <polyline
                      key={line.name}
                      points={line.points
                        .map((point, index) => (point ? `${x(index)},${y(point)}` : ""))
                        .filter(Boolean)
                        .join(" ")}
                      fill="none"
                      stroke={line.color}
                      strokeWidth={line.dashed ? 1.5 : 2}
                      strokeDasharray={line.dashed ? "5 4" : undefined}
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                </svg>
                {lines.map((line) =>
                  line.points.map((point, index) =>
                    point ? (
                      <span
                        key={`${line.name}-${index}`}
                        className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--bg-primary)]"
                        style={{ left: `${x(index)}%`, top: `${y(point)}%`, backgroundColor: line.color }}
                      />
                    ) : null,
                  ),
                )}
              </div>
            </div>
            <div className="grid" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
              {trend.releases.map((item, index) => (
                <span
                  key={item.key}
                  className={`truncate px-1 pt-2 text-center text-[11px] ${
                    index === active ? "font-bold text-indigo-700 dark:text-indigo-300" : "text-[var(--text-tertiary)]"
                  }`}
                >
                  {item.label}
                </span>
              ))}
            </div>
            <div className="absolute inset-0 grid" style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>
              {trend.releases.map((item, index) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={index === active}
                  aria-label={`${item.title} 中签率`}
                  onClick={() => setSelected(index)}
                  className={`rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                    index === active ? "bg-indigo-500/[0.06]" : ""
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 max-h-[28rem] overflow-auto rounded-2xl border border-[var(--border-primary)]">
        <table className="w-full min-w-max border-collapse text-xs tabular-nums">
          <thead className="sticky top-0 z-20 bg-[var(--bg-secondary)]">
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-[var(--bg-secondary)] px-3 py-2 text-left font-semibold text-[var(--text-secondary)]">
                单曲
              </th>
              {[{ name: "全部", color: OVERALL_COLOR }, ...all.map((item) => ({ name: item.name, color: colorOf.get(item.name) }))].map(
                (column) => (
                  <th key={column.name} scope="col" className="px-3 py-2 text-right font-semibold text-[var(--text-secondary)]">
                    <span className="inline-flex items-center gap-1.5">
                      {column.color ? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: column.color }} /> : null}
                      {column.name}
                    </span>
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {trend.releases.map((release, index) => {
              const row = index === active ? "bg-[var(--bg-secondary)]" : "bg-[var(--bg-primary)]";
              return (
                <tr key={release.key} className={`border-t border-[var(--border-primary)] ${row}`}>
                  <th scope="row" className={`sticky left-0 z-10 px-3 py-2 text-left font-normal ${row}`}>
                    <button
                      type="button"
                      onClick={() => setSelected(index)}
                      title={release.title}
                      className={`block max-w-[7rem] text-left sm:max-w-[11rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                        index === active ? "text-indigo-700 dark:text-indigo-300" : "text-[var(--text-primary)]"
                      }`}
                    >
                      <span className="block font-bold">{release.label}</span>
                      <span className="block truncate text-[10px] text-[var(--text-tertiary)]">
                        {release.title.startsWith(`${release.label}『`)
                          ? release.title.slice(release.label.length)
                          : release.date}
                      </span>
                    </button>
                  </th>
                  {[trend.overall, ...all].map((series) => (
                    <td key={series.name} className="px-3 py-2 text-right">
                      <RateCell point={series.points[index]} />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-[var(--border-primary)] bg-[var(--bg-secondary)]">
              <th scope="row" className="sticky left-0 z-10 bg-[var(--bg-secondary)] px-3 py-2 text-left font-bold text-[var(--text-primary)]">
                合计
              </th>
              {[trend.overall, ...all].map((series) => (
                <td key={series.name} className="px-3 py-2 text-right">
                  <RateCell point={series.applied > 0 ? series : null} />
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-3 text-xs leading-5 text-[var(--text-tertiary)]">
        中签率 = 中签张数 ÷ 申请张数（サイン会按抽选次数），与成员排行同一算法，但只计已出结果的申请；同一单曲的
        Music 各次受付与 Meets 合并为一行，按部时没有部数的记录（如サイン会）计入“未分部”；跟随上方团体与类型筛选。
      </p>
    </section>
  );
}
