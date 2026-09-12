import { NARRATION_COLORS } from './narration-color';

export default function NarrationColorPicker({ value, onChange }: {
  value?: string;
  onChange: (color?: string) => void;
}) {
  return (
    <fieldset className="bg-[var(--bg-primary)] rounded-xl border border-[var(--border-primary)] p-4" aria-label="旁白颜色">
      <legend className="px-1 text-xs font-medium text-[var(--text-secondary)]">ト書き · 旁白颜色</legend>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" aria-pressed={!value} onClick={() => onChange(undefined)}
          className="min-h-9 rounded-lg border border-[var(--border-primary)] px-3 text-xs aria-pressed:font-bold">原样</button>
        {NARRATION_COLORS.map(preset => (
          <button key={preset.color} type="button" aria-pressed={value === preset.color} onClick={() => onChange(preset.color)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--border-primary)] px-2 text-xs aria-pressed:font-bold">
            <span aria-hidden="true" className="h-3 w-3 rounded-full" style={{ backgroundColor: preset.color }} />{preset.label}
          </button>
        ))}
        <label className="inline-flex min-h-9 items-center gap-2 text-xs">
          自定义
          <input aria-label="自定义旁白颜色" type="color" value={value || '#d97706'} onChange={event => onChange(event.target.value)} className="h-8 w-9 cursor-pointer" />
        </label>
      </div>
      <p className="mt-2 text-[10px] text-[var(--text-tertiary)]">整张 Repo 统一配色，淡色背景＋深色文字。预览与导出一致；选「原样」恢复模板原配色。</p>
    </fieldset>
  );
}
