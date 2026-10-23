import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { TrendingUp } from "lucide-react";
import { pivotWinRate, type WinRatePoint, type WinRateTrend as Trend } from "./meguri-helpers";

type Cut = "member" | "slot";
type Tab = "releases" | "members" | "schedule";
type Line = { key: string; name: string; color: string; points: Array<WinRatePoint | null>; dashed?: boolean };
type Column = { key: string; label: string; color?: string };
type Row = { key: string; label: string; sub?: string; points: Array<WinRatePoint | null>; active?: boolean; onSelect?: () => void };

const OVERALL_COLOR = "#64748b";
const NO_SLOT_COLOR = "#94a3b8";
const LINE_COLORS = ["#6366f1", "#ec4899", "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#14b8a6"];
const COLUMN_PX = 76;
const DEFAULT_MEMBERS = 3;
const WEEKDAYS = "日月火水木金土";

const rate = (point: WinRatePoint) => Math.min(1, point.won / point.applied);
const percent = (value: number) => `${Math.round(value * 100)}%`;
const slotLabel = (slot: number) => (slot > 0 ? `第${slot}部` : "不分部");
const slotColor = (slot: number) => (slot > 0 ? LINE_COLORS[(slot - 1) % LINE_COLORS.length] : NO_SLOT_COLOR);
const bySlot = (left: number, right: number) => (left || 99) - (right || 99);
const byDate = (left: string, right: string) => (left || "9999").localeCompare(right || "9999");

function dateLabel(date: string) {
  const match = date.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!match) return date || "日期未知";
  return `${Number(match[1])}/${Number(match[2])}(${WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()]})`;
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex max-w-full self-start overflow-x-auto rounded-xl border border-[var(--border-primary)] p-1">
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          aria-pressed={value === key}
          onClick={() => onChange(key)}
          className={`min-h-9 shrink-0 rounded-lg px-3 text-[11px] font-semibold ${
            value === key ? "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300" : "text-[var(--text-secondary)]"
          }`}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** A small menu for long or many options (venue, single, member) so they don't spread over rows of buttons. */
function Picker({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="inline-flex min-w-0 max-w-full items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
      <span className="shrink-0">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-9 min-w-0 max-w-[16rem] cursor-pointer truncate rounded-lg border border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 font-semibold text-[var(--text-primary)]"
      >
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function Chip({ on, color, onClick, children }: { on: boolean; color?: string; onClick?: () => void; children: ReactNode }) {
  const className = `inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors ${
    on ? "border-indigo-500/30 bg-indigo-500/10 text-[var(--text-primary)]" : "border-[var(--border-primary)] text-[var(--text-tertiary)]"
  }`;
  const dot = color ? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: on ? color : "var(--border-primary)" }} /> : null;
  if (!onClick) return <span className={className}>{dot}{children}</span>;
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={className}>
      {dot}
      {children}
    </button>
  );
}

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

/** The one table behind 单曲一览, 成员×部 and 全日程: sticky header and first column, a totals footer. */
function Matrix({ corner, columns, rows, footer }: { corner: string; columns: Column[]; rows: Row[]; footer: Row }) {
  const rowHead = (row: Row, background: string) => (
    <th scope="row" className={`sticky left-0 z-10 px-3 py-2 text-left font-normal ${background}`}>
      {row.onSelect ? (
        <button
          type="button"
          onClick={row.onSelect}
          title={row.label}
          className={`block max-w-[7rem] text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 sm:max-w-[11rem] ${
            row.active ? "text-indigo-700 dark:text-indigo-300" : "text-[var(--text-primary)]"
          }`}
        >
          <span className="block font-bold">{row.label}</span>
          {row.sub ? <span className="block truncate text-[10px] text-[var(--text-tertiary)]">{row.sub}</span> : null}
        </button>
      ) : (
        <span className="block max-w-[7rem] truncate font-bold text-[var(--text-primary)] sm:max-w-[11rem]">{row.label}</span>
      )}
    </th>
  );
  return (
    <div className="max-h-[28rem] overflow-auto rounded-2xl border border-[var(--border-primary)]">
      <table className="w-full min-w-max border-collapse text-xs tabular-nums">
        <thead className="sticky top-0 z-20 bg-[var(--bg-secondary)]">
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-[var(--bg-secondary)] px-3 py-2 text-left font-semibold text-[var(--text-secondary)]">
              {corner}
            </th>
            {columns.map((column) => (
              <th key={column.key} scope="col" className="px-3 py-2 text-right font-semibold text-[var(--text-secondary)]">
                <span className="inline-flex items-center gap-1.5">
                  {column.color ? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: column.color }} /> : null}
                  {column.label}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const background = row.active ? "bg-[var(--bg-secondary)]" : "bg-[var(--bg-primary)]";
            return (
              <tr key={row.key} className={`border-t border-[var(--border-primary)] ${background}`}>
                {rowHead(row, background)}
                {row.points.map((point, index) => (
                  <td key={columns[index]?.key ?? index} className="px-3 py-2 text-right">
                    <RateCell point={point} />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--border-primary)] bg-[var(--bg-secondary)]">
            {rowHead(footer, "bg-[var(--bg-secondary)]")}
            {footer.points.map((point, index) => (
              <td key={columns[index]?.key ?? index} className="px-3 py-2 text-right">
                <RateCell point={point} />
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function TrendChart({
  releases,
  lines,
  active,
  onSelect,
}: {
  releases: Trend["releases"];
  lines: Line[];
  active: number;
  onSelect: (index: number) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const count = releases.length;
  const x = (index: number) => ((index + 0.5) / count) * 100;
  const y = (point: WinRatePoint) => (1 - rate(point)) * 100;
  const columns = { gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` };

  // Open on the latest single when the chart is wider than the card.
  useEffect(() => {
    if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
  }, [count]);

  return (
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
                    key={line.key}
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
                      key={`${line.key}-${index}`}
                      className="absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[var(--bg-primary)]"
                      style={{ left: `${x(index)}%`, top: `${y(point)}%`, backgroundColor: line.color }}
                    />
                  ) : null,
                ),
              )}
            </div>
          </div>
          <div className="grid" style={columns}>
            {releases.map((item, index) => (
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
          <div className="absolute inset-0 grid" style={columns}>
            {releases.map((item, index) => (
              <button
                key={item.key}
                type="button"
                aria-pressed={index === active}
                aria-label={`${item.title} 中签率`}
                onClick={() => onSelect(index)}
                className={`rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  index === active ? "bg-indigo-500/[0.06]" : ""
                }`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 中签率推移: one 类型/会场 at a time (部 never cross 個別 / リアミ / venues), by member or by 部, with three tables. */
export default function WinRateTrend({ trend }: { trend: Trend }) {
  const defaultSection = [...trend.sections].sort((left, right) => right.applied - left.applied)[0]?.key ?? "";
  const [sectionKey, setSectionKey] = useState(defaultSection);
  const [cut, setCut] = useState<Cut>("member");
  const [tab, setTab] = useState<Tab>("releases");
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [releaseKey, setReleaseKey] = useState<string | null>(null);
  const [scheduleMember, setScheduleMember] = useState("");

  const section = trend.sections.find((item) => item.key === sectionKey) ?? trend.sections.find((item) => item.key === defaultSection);
  // Two levels: category tabs, then a venue menu. Sections come busiest venue first, so a tab opens on that venue.
  const kinds = Array.from(new Set(trend.sections.map((item) => item.kind)));
  const venues = trend.sections.filter((item) => item.kind === section?.kind);
  const cells = useMemo(() => trend.cells.filter((cell) => cell.section === section?.key), [trend.cells, section?.key]);
  const byRelease = useMemo(
    () => pivotWinRate(cells, (cell) => (cut === "member" ? cell.member : String(cell.slot)), (cell) => cell.release),
    [cells, cut],
  );
  const releases = trend.releases.filter((release) => byRelease.columns.includes(release.key));
  const selectedIndex = releases.findIndex((item) => item.key === releaseKey);
  const activeIndex = selectedIndex >= 0 ? selectedIndex : releases.length - 1;
  const release = releases[activeIndex];

  // Series of the current cut: members by volume, 部 in order. Only the first colours get a line; tables show all.
  const series = byRelease.rows
    .slice()
    .sort((left, right) =>
      cut === "member"
        ? (byRelease.rowTotal(right)?.applied ?? 0) - (byRelease.rowTotal(left)?.applied ?? 0) || left.localeCompare(right, "ja")
        : bySlot(Number(left), Number(right)),
    )
    .map((key, index) => ({
      key,
      name: cut === "member" ? key : slotLabel(Number(key)),
      color: cut === "member" ? LINE_COLORS[index] : slotColor(Number(key)),
      points: releases.map((item) => byRelease.at(key, item.key)),
    }));
  const lineable = series.filter((item) => item.color);
  const pickKey = `${section?.key}|${cut}`;
  const shown = picked[pickKey] ?? (cut === "member" ? lineable.slice(0, DEFAULT_MEMBERS) : lineable).map((item) => item.key);
  const lines: Line[] = [
    { key: "all", name: "全部", color: OVERALL_COLOR, dashed: true, points: releases.map((item) => byRelease.columnTotal(item.key)) },
    ...lineable.filter((item) => shown.includes(item.key)),
  ];
  const toggle = (key: string) =>
    setPicked({ ...picked, [pickKey]: shown.includes(key) ? shown.filter((item) => item !== key) : [...shown, key] });

  const releaseCells = useMemo(() => cells.filter((cell) => cell.release === release?.key), [cells, release?.key]);
  const scheduleMembers = Array.from(new Set(releaseCells.map((cell) => cell.member)));
  const member = scheduleMembers.includes(scheduleMember) ? scheduleMember : "";
  const table = (() => {
    if (tab === "releases") {
      const columns: Column[] = [{ key: "all", label: "全部", color: OVERALL_COLOR }, ...series.map((item) => ({ key: item.key, label: item.name, color: item.color }))];
      return {
        corner: "单曲",
        columns,
        rows: releases.map((item, index) => ({
          key: item.key,
          label: item.label,
          sub: item.title.startsWith(`${item.label}『`) ? item.title.slice(item.label.length) : item.date,
          points: [byRelease.columnTotal(item.key), ...series.map((line) => line.points[index])],
          active: index === activeIndex,
          onSelect: () => setReleaseKey(item.key),
        })),
        footer: { key: "total", label: "合计", points: [byRelease.total, ...series.map((line) => byRelease.rowTotal(line.key))] },
      };
    }
    const members = pivotWinRate(releaseCells, (cell) => cell.member, (cell) => cell.slot);
    const slots = members.columns.slice().sort(bySlot);
    const slotColumns: Column[] = slots.map((slot) => ({ key: String(slot), label: slotLabel(slot), color: slotColor(slot) }));
    if (tab === "members") {
      return {
        corner: "成员",
        columns: [...slotColumns, { key: "total", label: "合计" }],
        rows: members.rows
          .slice()
          .sort((left, right) => (members.rowTotal(right)?.applied ?? 0) - (members.rowTotal(left)?.applied ?? 0) || left.localeCompare(right, "ja"))
          .map((member) => ({ key: member, label: member, points: [...slots.map((slot) => members.at(member, slot)), members.rowTotal(member)] })),
        footer: { key: "total", label: "全部", points: [...slots.map((slot) => members.columnTotal(slot)), members.total] },
      };
    }
    const days = pivotWinRate(
      releaseCells.filter((cell) => !member || cell.member === member),
      (cell) => cell.date,
      (cell) => cell.slot,
    );
    return {
      corner: "日期",
      columns: [...slotColumns, { key: "day", label: "当日" }],
      rows: days.rows
        .slice()
        .sort(byDate)
        .map((date) => ({ key: date, label: dateLabel(date), points: [...slots.map((slot) => days.at(date, slot)), days.rowTotal(date)] })),
      footer: { key: "total", label: "每部合计", points: [...slots.map((slot) => days.columnTotal(slot)), days.total] },
    };
  })();

  if (!section || !release) return null;

  return (
    <section className="rounded-3xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-indigo-500" />
          <h3 className="text-sm font-bold text-[var(--text-primary)]">中签率推移</h3>
        </div>
        <Segmented label="线条" value={cut} options={[["member", "按成员"], ["slot", "按部"]]} onChange={setCut} />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {kinds.length > 1 ? (
          <Segmented
            label="类型"
            value={section.kind}
            options={kinds.map((kind) => [kind, kind] as [string, string])}
            onChange={(kind) => setSectionKey(trend.sections.find((item) => item.kind === kind)?.key ?? defaultSection)}
          />
        ) : (
          <span className="text-xs font-semibold text-[var(--text-secondary)]">{section.kind}</span>
        )}
        {venues.length > 1 ? (
          <Picker
            label="会场"
            value={section.key}
            options={venues.map((item) => [item.key, item.venue || "未注明会场"] as [string, string])}
            onChange={setSectionKey}
          />
        ) : section.venue ? (
          <span className="text-xs text-[var(--text-tertiary)]">{section.venue}</span>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Chip on={false}>
          <span className="h-0.5 w-3 border-t-2 border-dashed" style={{ borderColor: OVERALL_COLOR }} />
          全部
        </Chip>
        {lineable.map((item) => (
          <Chip key={item.key} on={shown.includes(item.key)} color={item.color} onClick={() => toggle(item.key)}>
            {item.name}
          </Chip>
        ))}
      </div>

      <TrendChart releases={releases} lines={lines} active={activeIndex} onSelect={(index) => setReleaseKey(releases[index].key)} />

      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <Segmented
          label="表格"
          value={tab}
          options={[["releases", "单曲一览"], ["members", "成员×部"], ["schedule", "全日程"]]}
          onChange={setTab}
        />
        {tab === "releases" ? null : (
          <Picker
            label="单曲"
            value={release.key}
            options={releases.map((item) => [item.key, item.title] as [string, string])}
            onChange={setReleaseKey}
          />
        )}
        {tab === "schedule" ? (
          <Picker
            label="成员"
            value={member}
            options={[["", "全部成员"], ...scheduleMembers.map((name) => [name, name] as [string, string])]}
            onChange={setScheduleMember}
          />
        ) : null}
      </div>

      <div className="mt-3">
        <Matrix corner={table.corner} columns={table.columns} rows={table.rows} footer={table.footer} />
      </div>

      <p className="mt-3 text-xs leading-5 text-[var(--text-tertiary)]">
        中签率 = 中签张数 ÷ 申请张数（サイン会按抽选次数），与成员排行同一算法，但只计已出结果的申请。個別 / 全国 / リアミ / サイン会与各会场分开统计，部不跨类型或会场合并；
        同一单曲的各次受付合并。「每部合计」看哪一部更难抽。跟随上方团体与类型筛选。
      </p>
    </section>
  );
}
