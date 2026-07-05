#!/usr/bin/env node
/**
 * 完売マトリクス画像生成（期別顺 + 完売顺の 2 枚）
 * 与网页 src/components/meguri/SoldOutMatrix.tsx の見た目に揃える
 *
 * API → satori (SVG) → @resvg/resvg-js (PNG)
 */

import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, existsSync } from 'fs';
import { basename, join, dirname } from 'path';
import { fileURLToPath } from 'url';

import {
  computeAnalysis,
  sortBySoldOut,
  sortByGeneration,
  buildGenGroups,
  cellAlpha,
  formatDateShort,
  loadGenerationMap,
} from './soldout-image-analysis.mjs';

const API_BASE = process.env.SOLDOUT_API_BASE || 'https://api.46log.com';
const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Font ────────────────────────────────────────────────────────
const FONT_PATHS = [
  join(__dirname, 'NotoSansJP-Regular.ttf'),
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
];
let fontData = null;
for (const fp of FONT_PATHS) {
  if (existsSync(fp)) { fontData = readFileSync(fp); break; }
}
if (!fontData) throw new Error('No Japanese font found');

// ── Theme（与 SoldOutMatrix.tsx 同步） ─────────────────────────
const THEME = {
  sakurazaka: {
    accent: '#e91e63', accentLight: '#f48fb1', accentBg: '#fce4ec',
    headerBg: '#f8bbd0', cellSolid: '#f48fb1',
    genHeaderFrom: '#f8bbd0', genHeaderTo: '#fce4ec',
  },
  hinatazaka: {
    accent: '#0097a7', accentLight: '#4dd0e1', accentBg: '#e0f7fa',
    headerBg: '#b2ebf2', cellSolid: '#4dd0e1',
    genHeaderFrom: '#b2ebf2', genHeaderTo: '#e0f7fa',
  },
  nogizaka: {
    accent: '#7b1fa2', accentLight: '#ba68c8', accentBg: '#f3e5f5',
    headerBg: '#ce93d8', cellSolid: '#ba68c8',
    genHeaderFrom: '#ce93d8', genHeaderTo: '#f3e5f5',
  },
};

// ── Layout constants ───────────────────────────────────────────
const CELL_W = 26;
const CELL_H = 26;
const NAME_W = 220;
const STAT_W = 86;
const ROW_H = 28;
const PAD = 18;

// ── helpers ────────────────────────────────────────────────────
function decodeHtml(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'");
}

function hexAlpha(hex, alpha) {
  const a = Math.max(0, Math.min(1, alpha));
  return hex + Math.round(a * 255).toString(16).padStart(2, '0');
}

export function formatEventTitleForImage(title) {
  const normalized = decodeHtml(String(title || ''))
    .replace(/【.*?】/g, '')
    .replace(/発売記念オンラインミート＆グリート（個別トーク会）/g, '発売記念オンラインミーグリ')
    .replace(/発売記念オンラインミート&グリート（個別トーク会）/g, '発売記念オンラインミーグリ')
    .replace(/発売記念オンラインミート＆グリート/g, '発売記念オンラインミーグリ')
    .replace(/発売記念オンラインミート&グリート/g, '発売記念オンラインミーグリ')
    .replace(/発売記念リアルミート＆グリート（個別トーク会）/g, '発売記念リアルミーグリ')
    .replace(/発売記念リアルミート&グリート（個別トーク会）/g, '発売記念リアルミーグリ')
    .replace(/発売記念リアルミート＆グリート/g, '発売記念リアルミーグリ')
    .replace(/発売記念リアルミート&グリート/g, '発売記念リアルミーグリ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized.length > 66 ? `${normalized.slice(0, 65)}…` : normalized;
}

async function fetchSoldOutData(eventSlug) {
  const res = await fetch(`${API_BASE}/api/miguri/soldout?event=${eventSlug}`);
  if (!res.ok) throw new Error(`API failed: ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(`API error: ${json.error}`);
  return json.data;
}

// ── satori virtual DOM helper ─────────────────────────────────
function h(type, props, ...children) {
  return { type, props: { ...props, children: children.flat().filter(Boolean) } };
}

// ── pieces ────────────────────────────────────────────────────

function summaryHeader({ title, modeLabel, totalSoldOut, totalCells, pct, theme, memberCount, dateCount, slotCount }) {
  return h('div', {
    style: {
      display: 'flex', flexDirection: 'column', gap: '8px',
      padding: '14px 16px', borderRadius: '12px',
      backgroundColor: '#fafafa',
      border: `1px solid ${theme.accentBg}`,
      marginBottom: '14px',
    },
  },
    // 标题行：标题 + 模式标签
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' } },
      h('div', { style: { display: 'flex', fontSize: '16px', fontWeight: 700, color: '#222' } }, title),
      h('div', {
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '4px 10px', borderRadius: '999px',
          backgroundColor: theme.accent, color: '#fff',
          fontSize: '11px', fontWeight: 700,
        },
      }, modeLabel),
    ),
    // 数字行
    h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px' } },
      h('div', { style: { display: 'flex', fontSize: '28px', fontWeight: 800, color: theme.accent } }, String(totalSoldOut)),
      h('div', { style: { display: 'flex', fontSize: '12px', color: '#999' } }, `/ ${totalCells} 枠`),
      h('div', {
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginLeft: '4px', padding: '2px 8px', borderRadius: '999px',
          backgroundColor: theme.accent, color: '#fff',
          fontSize: '11px', fontWeight: 700,
        },
      }, `${pct}%`),
      h('div', { style: { display: 'flex', marginLeft: 'auto', gap: '12px', fontSize: '11px', color: '#666' } },
        h('div', { style: { display: 'flex' } }, `メンバー ${memberCount}`),
        h('div', { style: { display: 'flex' } }, `日程 ${dateCount}`),
        h('div', { style: { display: 'flex' } }, `部 ${slotCount}`),
      ),
    ),
    // 进度条
    h('div', {
      style: {
        display: 'flex', height: '6px', borderRadius: '999px',
        backgroundColor: theme.accentBg, overflow: 'hidden',
      },
    },
      h('div', {
        style: {
          display: 'flex', width: `${pct}%`, height: '6px',
          backgroundColor: theme.accent, borderRadius: '999px',
        },
      }),
    ),
  );
}

function dateHeaderRow({ dates, slotNumbers, theme, showLeftLabel }) {
  return h('div', {
    style: { display: 'flex', alignItems: 'stretch', height: `${ROW_H}px` },
  },
    h('div', {
      style: {
        display: 'flex', alignItems: 'center', paddingLeft: '10px',
        width: `${NAME_W}px`, flexShrink: 0,
        backgroundColor: theme.headerBg, color: '#fff',
        fontSize: '11px', fontWeight: 700,
        borderTopLeftRadius: '8px',
      },
    }, showLeftLabel ? 'メンバー' : ''),
    ...dates.map((date, idx) =>
      h('div', {
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: `${slotNumbers.length * CELL_W}px`, flexShrink: 0,
          backgroundColor: theme.headerBg, color: '#fff',
          fontSize: '11px', fontWeight: 700,
          borderLeft: idx === 0 ? 'none' : '1px solid rgba(255,255,255,0.4)',
        },
      }, formatDateShort(date)),
    ),
    h('div', {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        paddingRight: '10px', width: `${STAT_W}px`, flexShrink: 0,
        backgroundColor: theme.headerBg, color: '#fff',
        fontSize: '11px', fontWeight: 700,
        borderTopRightRadius: '8px',
      },
    }, '完売／枠'),
  );
}

function slotHeaderRow({ dates, slotNumbers, theme }) {
  const slotCells = [];
  for (const date of dates) {
    for (const slot of slotNumbers) {
      slotCells.push(h('div', {
        key: `${date}-${slot}`,
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: `${CELL_W}px`, height: '20px', flexShrink: 0,
          fontSize: '10px', color: '#777',
          backgroundColor: theme.accentBg,
        },
      }, String(slot)));
    }
  }
  return h('div', {
    style: { display: 'flex', alignItems: 'stretch', height: '20px' },
  },
    h('div', {
      style: { display: 'flex', width: `${NAME_W}px`, flexShrink: 0, backgroundColor: theme.accentBg },
    }),
    ...slotCells,
    h('div', {
      style: { display: 'flex', width: `${STAT_W}px`, flexShrink: 0, backgroundColor: theme.accentBg },
    }),
  );
}

function memberCells({ member, dates, slotNumbers, theme, maxRound }) {
  const cells = [];
  for (const date of dates) {
    for (const slot of slotNumbers) {
      const round = member.cells.get(`${date}::${slot}`);
      const bg = round ? hexAlpha(theme.cellSolid, cellAlpha(round, maxRound)) : '#fff';
      cells.push(h('div', {
        key: `${date}-${slot}`,
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: `${CELL_W}px`, height: `${CELL_H}px`, flexShrink: 0,
          backgroundColor: bg,
          borderRight: '1px solid #f0f0f0',
          borderBottom: '1px solid #f0f0f0',
          fontSize: '10px', fontWeight: 700,
          color: round ? '#fff' : 'transparent',
        },
      }, round ? String(round) : ''));
    }
  }
  return cells;
}

function memberRow({ member, idx, dates, slotNumbers, theme, maxRound, showRank, rank }) {
  const fullyOut = member.fullSoldOutRound != null;
  return h('div', {
    style: {
      display: 'flex', alignItems: 'stretch', height: `${CELL_H}px`,
      backgroundColor: idx % 2 === 0 ? '#fff' : '#fafafa',
    },
  },
    // 名字栏
    h('div', {
      style: {
        display: 'flex', alignItems: 'center', gap: '6px',
        width: `${NAME_W}px`, flexShrink: 0, paddingLeft: '10px',
        borderBottom: '1px solid #f0f0f0',
      },
    },
      // 排名 badge（仅完売顺）
      showRank ? h('div', {
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: '18px', height: '18px', borderRadius: '999px',
          backgroundColor: rank <= 3 ? theme.accent : '#bbb',
          color: '#fff', fontSize: '10px', fontWeight: 700,
        },
      }, String(rank)) : null,
      // 完売 tag
      fullyOut ? h('div', {
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '2px 6px', borderRadius: '4px',
          backgroundColor: theme.accent, color: '#fff',
          fontSize: '9px', fontWeight: 700,
        },
      }, `${member.fullSoldOutRound}次完売`) : null,
      h('div', {
        style: {
          display: 'flex',
          fontSize: '12px',
          color: fullyOut ? theme.accent : '#333',
          fontWeight: fullyOut ? 700 : 500,
        },
      }, member.name),
    ),
    // 单元格
    ...memberCells({ member, dates, slotNumbers, theme, maxRound }),
    // 统计
    h('div', {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        width: `${STAT_W}px`, flexShrink: 0, paddingRight: '10px',
        borderBottom: '1px solid #f0f0f0',
        fontSize: '11px', color: '#555',
      },
    },
      h('div', { style: { display: 'flex', fontWeight: 700, color: '#222' } }, String(member.soldOutCount)),
      h('div', { style: { display: 'flex', color: '#999' } }, `/${member.totalCount}`),
    ),
  );
}

function generationRow({ genGroup, totalCols, theme }) {
  const pct = genGroup.totalCount > 0 ? Math.round((genGroup.soldOutCount / genGroup.totalCount) * 100) : 0;
  return h('div', {
    style: {
      display: 'flex', alignItems: 'center', height: '28px',
      backgroundImage: `linear-gradient(90deg, ${theme.genHeaderFrom} 0%, ${theme.genHeaderTo} 100%)`,
      paddingLeft: '12px', paddingRight: '12px',
      borderTop: `1px solid ${theme.accentLight}`,
      borderBottom: `1px solid ${theme.accentLight}`,
    },
  },
    h('div', { style: { display: 'flex', fontSize: '12px', fontWeight: 800, color: theme.accent } }, genGroup.generation),
    h('div', { style: { display: 'flex', marginLeft: 'auto', alignItems: 'center', gap: '6px' } },
      h('div', { style: { display: 'flex', fontSize: '11px', fontWeight: 700, color: '#444' } },
        `${genGroup.soldOutCount}/${genGroup.totalCount}`),
      h('div', {
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '1px 6px', borderRadius: '999px',
          backgroundColor: theme.accent, color: '#fff',
          fontSize: '10px', fontWeight: 700,
        },
      }, `${pct}%`),
    ),
  );
}

// ── render ─────────────────────────────────────────────────────

async function renderImage(tree, width, height) {
  const svg = await satori(tree, {
    width, height,
    fonts: [
      { name: 'NotoSansJP', data: fontData, weight: 400, style: 'normal' },
    ],
  });
  return new Resvg(svg, { fitTo: { mode: 'width', value: width * 2 } }).render().asPng();
}

/**
 * @param {string} eventSlug
 * @param {'sakurazaka'|'hinatazaka'|'nogizaka'} group
 * @param {'soldout'|'generation'} sortMode
 */
export async function generateSoldOutImage(eventSlug, group = 'sakurazaka', sortMode = 'soldout') {
  const data = await fetchSoldOutData(eventSlug);
  const genMap = loadGenerationMap([
    join(__dirname, '..', 'public', 'data', 'member-images.json'),
    join(__dirname, 'member-images.json'),
  ]);

  const analysis = computeAnalysis(data, group, genMap);
  const theme = THEME[group] || THEME.sakurazaka;
  const { members, dates, slotNumbers, totalSoldOut, totalCells, maxRound } = analysis;
  const totalCols = dates.length * slotNumbers.length;
  const pct = totalCells > 0 ? Math.round((totalSoldOut / totalCells) * 100) : 0;
  const rawTitle = formatEventTitleForImage(data.event.title);
  const modeLabel = sortMode === 'generation' ? '期別順' : '完売順';

  // 行ベース構築
  const bodyRows = [];
  let rowCount = 0;
  let separatorCount = 0;

  if (sortMode === 'generation') {
    const sorted = sortByGeneration(members);
    const groups = buildGenGroups(sorted);
    for (const genGroup of groups) {
      bodyRows.push(generationRow({ genGroup, totalCols, theme }));
      separatorCount++;
      for (let i = 0; i < genGroup.members.length; i++) {
        bodyRows.push(memberRow({
          member: genGroup.members[i],
          idx: rowCount,
          dates, slotNumbers, theme, maxRound,
          showRank: false,
        }));
        rowCount++;
      }
    }
  } else {
    const sorted = sortBySoldOut(members);
    for (let i = 0; i < sorted.length; i++) {
      bodyRows.push(memberRow({
        member: sorted[i],
        idx: i,
        dates, slotNumbers, theme, maxRound,
        showRank: true,
        rank: i + 1,
      }));
      rowCount++;
    }
  }

  const WIDTH = NAME_W + totalCols * CELL_W + STAT_W + PAD * 2;
  // summary card: padding(14*2) + title(20) + gap(8) + numbers(34) + gap(8) + bar(6) = 90
  const SUMMARY_H = 90 + 14; // include marginBottom
  const DATE_H = ROW_H;
  const SLOT_H = 20;
  const BODY_H = rowCount * CELL_H + separatorCount * 28;
  const FOOTER_H = 30;
  const HEIGHT = PAD + SUMMARY_H + DATE_H + SLOT_H + BODY_H + FOOTER_H + PAD;

  const tree = h('div', {
    style: {
      display: 'flex', flexDirection: 'column',
      width: `${WIDTH}px`, padding: `${PAD}px`,
      backgroundColor: '#fff', fontFamily: 'NotoSansJP',
    },
  },
    summaryHeader({
      title: rawTitle, modeLabel,
      totalSoldOut, totalCells, pct, theme,
      memberCount: members.length,
      dateCount: dates.length,
      slotCount: slotNumbers.length,
    }),
    // 表格容器
    h('div', {
      style: {
        display: 'flex', flexDirection: 'column',
        borderRadius: '8px', overflow: 'hidden',
        border: `1px solid ${theme.accentBg}`,
      },
    },
      dateHeaderRow({ dates, slotNumbers, theme, showLeftLabel: sortMode === 'soldout' }),
      slotHeaderRow({ dates, slotNumbers, theme }),
      ...bodyRows,
    ),
    // Footer
    h('div', {
      style: {
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginTop: '10px', fontSize: '10px', color: '#999',
      },
    },
      h('div', { style: { display: 'flex' } }, `${eventSlug}  ·  最大 ${maxRound} 次受付`),
      h('div', { style: { display: 'flex' } }, '46log.com / Fortune Music'),
    ),
  );

  return renderImage(tree, WIDTH, HEIGHT);
}

/** 生成两张：完売顺 + 期別顺 */
export async function generateBothImages(eventSlug, group = 'sakurazaka') {
  const [soldout, generation] = await Promise.all([
    generateSoldOutImage(eventSlug, group, 'soldout'),
    generateSoldOutImage(eventSlug, group, 'generation'),
  ]);
  return { soldout, generation };
}

// ── CLI ────────────────────────────────────────────────────────
if (process.argv[1] && basename(process.argv[1]) === 'soldout-image-gen.mjs') {
  const eventSlug = process.argv[2] || 'sakurazaka_202606';
  const group = process.argv[3] || eventSlug.split('_')[0];
  const mode = process.argv[4] || 'both';
  const { writeFileSync } = await import('fs');

  if (mode === 'both') {
    console.log(`Generating both images for ${eventSlug} (${group})...`);
    const imgs = await generateBothImages(eventSlug, group);
    writeFileSync(`/tmp/soldout-${eventSlug}-soldout.png`, imgs.soldout);
    writeFileSync(`/tmp/soldout-${eventSlug}-generation.png`, imgs.generation);
    console.log(`OK soldout=${Math.round(imgs.soldout.length / 1024)}KB generation=${Math.round(imgs.generation.length / 1024)}KB`);
  } else {
    const out = `/tmp/soldout-${eventSlug}-${mode}.png`;
    console.log(`Generating ${mode} image for ${eventSlug} (${group})...`);
    const buf = await generateSoldOutImage(eventSlug, group, mode);
    writeFileSync(out, buf);
    console.log(`OK ${out} (${Math.round(buf.length / 1024)}KB)`);
  }
}
