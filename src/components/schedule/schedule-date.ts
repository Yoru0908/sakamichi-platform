/** Stable across Node ICU, Chromium and WebKit; SSR does not depend on locale punctuation. */
export const tokyoToday = (now = new Date()) => new Date(now.getTime() + 9 * 3600e3).toISOString().slice(0, 10);
export function formatDateHeading(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
  return `${month}月${day}日 周${weekday}`;
}
