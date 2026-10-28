// 年間振り返り (2026-10-27): one year of 握手会 / ライブ / サイン会 as a 1080×1350 card, in the same styles as the まとめ card.
// Only what happened up to today counts, so a recap posted in December never shows a January date. Money is not on this card.
import type { MiguriGroupId } from '@/utils/auth-api';
import { isMiguriLotteryResult, lotteryResultCounts, entryLotteryCounts } from './meguri-helpers.ts';
import { box, draw, drawStrip, H, INNER, PAD, pct, rule, themeOf, W, yearOf, type CardEntry, type MiguriShareStyle, type TextOptions } from './miguri-share.ts';

/** Seconds of talk per ticket, as the person gave them: online 9s; in person Tokyo about 6s, Kyoto about 8s. Estimates, shown as 約. */
export const TALK_SECONDS = { online: 9, tokyo: 6, kyoto: 8 } as const;
/** One signing (one member at one サイン会) takes about 2 minutes. The 口 count is how many were applied for, so it is not used. */
export const SIGN_MINUTES = 2;

export type MiguriRecapCard = {
  year: number;
  /** Lives marked in 参加ログ; null when the log could not be read (signed out, offline). */
  live: number | null;
  onlineDays: number;
  realDays: number;
  signEvents: number;
  won: number;
  applied: number;
  rate: number | null;
  minutes: number;
  topMember: { name: string; won: number } | null;
  topGroup: MiguriGroupId | null;
  /** January to December: 当選枚数 up to today and the lives marked that month (null when the log is unavailable). */
  months: Array<{ label: string; won: number; live: number | null }>;
};

type RecapEntry = CardEntry & { eventSlug?: string | null; eventTitle?: string | null; venue?: string | null; source?: string; group?: MiguriGroupId | null };

const kindOf = (entry: RecapEntry) => (entry.category === 'サイン会' ? 'sign' : entry.category === 'リアミ' ? 'real' : 'online');

export function talkSecondsPerTicket(entry: RecapEntry): number {
  if (kindOf(entry) !== 'real') return TALK_SECONDS.online;
  return /京都|kyoto/i.test(entry.venue ?? '') ? TALK_SECONDS.kyoto : TALK_SECONDS.tokyo;
}

const NOT_A_LIVE = /ミーグリ|ミート|握手|サイン会|リアミ|Meet|オンライン/i;

export type LiveRecord = { id: string; date: string; title: string };

/** 参加ログ records of that year that are marked as attended (not planned) and are not a 握手会 / サイン会. */
export function attendedLives(records: LiveRecord[], year: number, today: string): LiveRecord[] {
  const seen = new Map<string, LiveRecord>();
  for (const record of records) {
    if (yearOf(record.date) === year && record.date <= today && !NOT_A_LIVE.test(record.title)) seen.set(record.id, record);
  }
  return [...seen.values()];
}

export const countAttendedLives = (records: LiveRecord[], year: number, today: string) => attendedLives(records, year, today).length;

export function buildMiguriRecapCard({ entries, year, lives, today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }) }: {
  entries: RecapEntry[];
  year: number;
  /** 参加ログ records, or null when they could not be read. */
  lives: LiveRecord[] | null;
  today?: string;
}): MiguriRecapCard {
  const attended = lives ? attendedLives(lives, year, today) : null;
  const own = entries.filter((entry) => yearOf(entry.date) === year);
  const results = own.filter(isMiguriLotteryResult);
  let applied = 0, won = 0, seconds = 0;
  const memberWon = new Map<string, number>();
  const monthWon = Array.from({ length: 12 }, () => 0);
  const groupWon = new Map<MiguriGroupId, number>();
  const days = { online: new Set<string>(), real: new Set<string>() };
  for (const entry of results) {
    const counts = lotteryResultCounts(entry);
    applied += counts.applied;
    won += counts.won;
    if (counts.won > 0 && entry.date <= today) monthWon[Number(entry.date.slice(5, 7)) - 1] += counts.won;
    if (counts.won > 0) {
      memberWon.set(entry.member, (memberWon.get(entry.member) ?? 0) + counts.won);
      if (entry.group) groupWon.set(entry.group, (groupWon.get(entry.group) ?? 0) + counts.won);
    }
    // 失効 (won but never paid) was not a session you could attend: it counts as a 当選, not as talk time or a day.
    const held = Math.max(0, counts.won - (entry.lapsedTickets || 0));
    if (held > 0 && entry.date <= today) {
      days[kindOf(entry) === 'real' ? 'real' : 'online'].add(entry.date);
      seconds += held * talkSecondsPerTicket(entry);
    }
  }
  const signed = own.filter((entry) => kindOf(entry) === 'sign' && entry.date <= today && entryLotteryCounts(entry).won > 0);
  const signEvents = new Set(signed.map((entry) => `${entry.eventSlug ?? entry.eventTitle ?? ''}|${entry.date}`)).size;
  const signings = new Set(signed.map((entry) => `${entry.eventSlug ?? entry.eventTitle ?? ''}|${entry.date}|${entry.member}`)).size;
  const top = [...memberWon.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))[0];
  const topGroup = [...groupWon.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return {
    year,
    live: attended ? attended.length : null,
    onlineDays: days.online.size,
    realDays: days.real.size,
    signEvents,
    won,
    applied,
    rate: applied > 0 ? won / applied : null,
    minutes: Math.round(seconds / 60 + signings * SIGN_MINUTES),
    topMember: top ? { name: top[0], won: top[1] } : null,
    topGroup,
    months: monthWon.map((won, index) => ({ label: `${index + 1}月`, won, live: attended ? attended.filter((record) => Number(record.date.slice(5, 7)) === index + 1).length : null })),
  };
}

const hoursOf = (minutes: number) => (minutes >= 60 ? `${Math.floor(minutes / 60)}時間${minutes % 60}分` : `${minutes}分`);

export function miguriRecapText(card: MiguriRecapCard): string {
  const days = card.onlineDays + card.realDays;
  return [
    `${card.year}年の推し活 振り返り`,
    '',
    card.live === null ? null : `ライブ ${card.live}本`,
    `ミーグリ ${days}日 / 当選 ${card.won.toLocaleString('ja-JP')}枚`,
    card.signEvents ? `サイン会 ${card.signEvents}回` : null,
    `推しと話した時間 約${hoursOf(card.minutes)}`,
    card.topMember ? `いちばん当たったのは ${card.topMember.name}（${card.topMember.won.toLocaleString('ja-JP')}枚）` : null,
    '',
    `#${card.year}年ミーグリ振り返り #ミーグリ`,
    'https://46log.com/miguri',
  ].filter((line) => line !== null).join('\n');
}

export async function renderMiguriRecapImage(card: MiguriRecapCard, style: MiguriShareStyle = 'auto'): Promise<Blob> {
  if (document.fonts?.ready) await document.fonts.ready;
  const theme = themeOf(style, card);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.lang = 'ja';
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');
  if ('lang' in ctx) (ctx as typeof ctx & { lang: string }).lang = 'ja';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, W, H);
  drawStrip(ctx, theme);
  const text = (value: string, x: number, y: number, options: TextOptions = {}) => draw(ctx, value, x, y, { color: theme.ink, family: theme.body, ...options });
  const fill = () => {
    if (theme.panel) {
      ctx.fillStyle = theme.panel;
      ctx.fill();
      return;
    }
    ctx.strokeStyle = theme.ink;
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 9]);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  text('46log MIGURI', PAD, 108, { size: 28, color: theme.brandColor, weight: 800 });
  text(String(card.year), W - PAD, 108, { size: 28, color: theme.muted, weight: 800, align: 'right', family: theme.num });
  const lead = `${card.year}年の`;
  text(lead, PAD, 204, { size: 88, weight: 800, family: theme.title });
  ctx.font = `800 88px ${theme.title}`;
  text('振り返り', PAD + ctx.measureText(lead).width, 204, { size: 88, weight: 800, family: theme.title, color: theme.titleColor });

  // 話した時間
  box(ctx, PAD, 244, INNER, 170, theme.radius);
  fill();
  text('ミーグリとサイン会で話した時間（目安）', PAD + 40, 296, { size: 26, color: theme.muted });
  text(`約${hoursOf(card.minutes)}`, PAD + 36, 386, { size: 84, weight: 800, family: theme.num, max: INNER - 72 });

  // 数字のタイル
  const tiles: Array<{ label: string; value: string; unit: string }> = [
    { label: 'ライブ', value: card.live === null ? '—' : String(card.live), unit: '本' },
    { label: 'サイン会', value: String(card.signEvents), unit: '回' },
    { label: 'ミーグリ', value: String(card.onlineDays + card.realDays), unit: '日' },
    { label: '当選率', value: card.rate === null ? '—' : pct(card.rate).replace('%', ''), unit: card.rate === null ? '' : '%' },
  ];
  const tileGap = 14, tileW = (INNER - tileGap * 3) / 4, tileY = 424, tileH = 116;
  tiles.forEach(({ label, value, unit }, index) => {
    const x = PAD + index * (tileW + tileGap);
    box(ctx, x, tileY, tileW, tileH, theme.radius * 0.7);
    fill();
    text(label, x + 22, tileY + 38, { size: 22, color: theme.muted, weight: 700, max: tileW - 36 });
    text(value, x + 22, tileY + 94, { size: 56, weight: 800, family: theme.num, max: tileW - 36 - (unit ? 30 : 0) });
    if (unit) {
      ctx.font = `800 56px ${theme.num}`;
      const width = Math.min(ctx.measureText(value).width, tileW - 66);
      text(unit, x + 26 + width, tileY + 94, { size: 24, weight: 800, color: theme.muted });
    }
  });

  // 月ごとの当選枚数 (●= ライブ)
  const hasLive = card.months.some((month) => month.live !== null);
  text('月ごとの当選枚数', PAD, 608, { size: 30, weight: 900 });
  if (hasLive) {
    ctx.font = `900 30px ${theme.body}`;
    text('（●=ライブ、5本以上は ×N）', PAD + ctx.measureText('月ごとの当選枚数').width + 16, 608, { size: 22, weight: 500, color: theme.muted });
  }
  const top = Math.max(1, ...card.months.map((month) => month.won));
  const gap = 12, barWidth = (INNER - gap * 11) / 12, floor = 1080, maxHeight = 380;
  const peak = card.months.findIndex((month) => month.won === top && top > 1);
  card.months.forEach((month, index) => {
    const x = PAD + index * (barWidth + gap), height = Math.max(6, (month.won / top) * maxHeight), cx = x + barWidth / 2;
    ctx.fillStyle = index === peak ? theme.acc : theme.lo;
    box(ctx, x, floor - height, barWidth, height, theme.radius / 3);
    ctx.fill();
    ctx.fillRect(x, floor - Math.min(height, 8), barWidth, Math.min(height, 8));
    const lives = month.live ?? 0;
    if (lives > 0) {
      const dotColor = theme.dot ?? theme.ink;
      ctx.fillStyle = dotColor;
      if (lives <= 4) {
        for (let i = 0; i < lives; i += 1) {
          ctx.beginPath();
          ctx.arc(cx + (i - (lives - 1) / 2) * 16, floor - height - 18, 7, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.beginPath();
        ctx.arc(cx - 17, floor - height - 18, 7, 0, Math.PI * 2);
        ctx.fill();
        text(`×${lives}`, cx - 6, floor - height - 10, { size: 22, weight: 900, color: dotColor, family: theme.num, max: barWidth });
      }
    }
    text(month.label, cx, floor + 34, { size: 22, weight: 700, color: theme.muted, align: 'center', max: barWidth + gap });
  });

  // いちばん当選した人
  box(ctx, PAD, 1150, INNER, 92, theme.radius * 0.7);
  fill();
  text('いちばん当選した人', PAD + 36, 1208, { size: 28, weight: 900 });
  if (card.topMember) {
    const count = `${card.topMember.won.toLocaleString('ja-JP')}枚`;
    text(count, W - PAD - 36, 1208, { size: 28, weight: 800, color: theme.muted, align: 'right', family: theme.num });
    ctx.font = `800 28px ${theme.num}`;
    text(card.topMember.name, W - PAD - 36 - ctx.measureText(count).width - 14, 1208, { size: 44, weight: 900, align: 'right', max: 420 });
  } else {
    text('—', W - PAD - 36, 1208, { size: 44, weight: 900, align: 'right' });
  }

  rule(ctx, theme, 1290);
  text('46log.com/miguri', PAD, 1328, { size: 26, color: theme.brandColor, weight: 800 });
  text('話した時間は 1枚あたりの目安秒数から計算', W - PAD, 1328, { size: 22, color: theme.muted, weight: 500, align: 'right', max: 560 });

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))), 'image/png');
  });
}
