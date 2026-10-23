import { useEffect, useRef, useState } from "react";
import { TrendingUp } from "lucide-react";
import type { WinRatePoint, WinRateSeries, WinRateTrend as Trend } from "./meguri-helpers";

const OVERALL_COLOR = "#64748b";
const MEMBER_COLORS = ["#6366f1", "#ec4899", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6"];
const COLUMN_PX = 76;
const DEFAULT_MEMBERS = 3;

const rate = (point: WinRatePoint) => Math.min(1, point.won / point.applied);
const percent = (value: number) => `${Math.round(value * 100)}%`;

/** 中签率推移: one column per single / album, the overall line plus the members picked in the chips. */
export default function WinRateTrend({ trend }: { trend: Trend }) {
  const members = trend.members.slice(0, MEMBER_COLORS.length);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const count = trend.releases.length;
  const active = selected !== null && selected < count ? selected : count - 1;
  const shown = picked ?? members.slice(0, DEFAULT_MEMBERS).map((member) => member.name);
  const lines: Array<WinRateSeries & { color: string; dashed?: boolean }> = [
    { ...trend.overall, color: OVERALL_COLOR, dashed: true },
    ...members
      .map((member, index) => ({ ...member, color: MEMBER_COLORS[index] }))
      .filter((member) => shown.includes(member.name)),
  ];
  const x = (index: number) => ((index + 0.5) / count) * 100;
  const y = (point: WinRatePoint) => (1 - rate(point)) * 100;

  // Open on the latest single when the chart is wider than the card.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [count]);

  const toggle = (name: string) =>
    setPicked(shown.includes(name) ? shown.filter((item) => item !== name) : [...shown, name]);
  const release = trend.releases[active];

  return (
    <section className="rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <TrendingUp size={16} className="text-indigo-500" />
        <h3 className="text-sm font-bold text-[var(--text-primary)]">中签率推移</h3>
        <span className="text-xs text-[var(--text-tertiary)]">按单曲 · 点击查看当期明细</span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[var(--border-primary)] px-3 text-xs font-semibold text-[var(--text-secondary)]">
          <span className="h-0.5 w-3 border-t-2 border-dashed" style={{ borderColor: OVERALL_COLOR }} />
          全部
        </span>
        {members.map((member, index) => {
          const on = shown.includes(member.name);
          return (
            <button
              key={member.name}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(member.name)}
              className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
                on
                  ? "border-indigo-500/30 bg-indigo-500/10 text-[var(--text-primary)]"
                  : "border-[var(--border-primary)] text-[var(--text-tertiary)]"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: on ? MEMBER_COLORS[index] : "var(--border-primary)" }}
              />
              {member.name}
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
                  {lines.map((line) => {
                    const points = line.points
                      .map((point, index) => (point ? `${x(index)},${y(point)}` : ""))
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <polyline
                        key={line.name}
                        points={points}
                        fill="none"
                        stroke={line.color}
                        strokeWidth={line.dashed ? 1.5 : 2}
                        strokeDasharray={line.dashed ? "5 4" : undefined}
                        strokeLinejoin="round"
                        vectorEffect="non-scaling-stroke"
                      />
                    );
                  })}
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
                  aria-label={`${item.title} 中签率明细`}
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

      {release ? (
        <div className="mt-4 rounded-2xl bg-[var(--bg-secondary)] p-3 sm:p-4">
          <div className="text-sm font-bold text-[var(--text-primary)]">{release.title}</div>
          <div className="mt-2 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {lines.map((line) => {
              const point = line.points[active];
              return (
                <div key={line.name} className="flex items-center gap-2 text-xs">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: line.color }} />
                  <span className="min-w-0 flex-1 truncate font-semibold text-[var(--text-primary)]">{line.name}</span>
                  <span className="tabular-nums text-[var(--text-secondary)]">
                    {point ? `${point.won} / ${point.applied} 张` : "未申请"}
                  </span>
                  <span className="w-10 text-right font-bold tabular-nums text-[var(--text-primary)]">
                    {point ? percent(rate(point)) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <p className="mt-3 text-xs leading-5 text-[var(--text-tertiary)]">
        中签率 = 中签张数 ÷ 申请张数（サイン会按抽选次数），与成员排行同一算法，但只计已出结果的申请；同一单曲的
        Music 各次受付与 Meets 合并为一点，跟随上方团体与类型筛选。
      </p>
    </section>
  );
}
