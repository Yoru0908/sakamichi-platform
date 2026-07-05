#!/usr/bin/env node
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  fetchFortuneMeetsAnalysis,
  loadFortuneMeetsAnalysisFromFile,
  GROUP_LABELS,
} from './fortunemeets-analysis.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const FONT_PATHS = [
  join(__dirname, 'NotoSansJP-Regular.ttf'),
  '/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc',
];

let fontData = null;
for (const fp of FONT_PATHS) {
  if (existsSync(fp)) {
    fontData = readFileSync(fp);
    break;
  }
}
if (!fontData) throw new Error('No Japanese font found');

const THEME = {
  sakurazaka: {
    accent: '#e91e63', accentLight: '#f48fb1', accentBg: '#fce4ec',
    headerBg: '#f8bbd0', cellSolid: '#f48fb1',
  },
  hinatazaka: {
    accent: '#0097a7', accentLight: '#4dd0e1', accentBg: '#e0f7fa',
    headerBg: '#b2ebf2', cellSolid: '#4dd0e1',
  },
  nogizaka: {
    accent: '#7b1fa2', accentLight: '#ba68c8', accentBg: '#f3e5f5',
    headerBg: '#ce93d8', cellSolid: '#ba68c8',
  },
};

const MODE_LABEL = {
  real: 'リアル',
  online: 'オンライン',
};

const NAME_W = 230;
const CELL_W = 44;
const STAT_W = 70;
const ROW_H = 30;
const HEADER_H = 30;
const PAD = 22;

function h(type, props, ...children) {
  return { type, props: { ...props, children: children.flat().filter(Boolean) } };
}

function formatDate(date) {
  const d = new Date(`${date}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return date;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function shortText(value, max) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function groupSlotsByDate(slots) {
  const map = new Map();
  for (const slot of slots) {
    const list = map.get(slot.date) || [];
    list.push(slot);
    map.set(slot.date, list);
  }
  return Array.from(map.entries()).sort(([left], [right]) => left.localeCompare(right));
}

function sortedMembers(award) {
  return [...award.memberSummaries].sort((left, right) => (
    right.closedCount - left.closedCount
    || right.totalCount - left.totalCount
    || left.name.localeCompare(right.name, 'ja')
  ));
}

function summaryHeader(analysis, award, theme) {
  return h('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      padding: '16px',
      border: `1px solid ${theme.accentBg}`,
      borderRadius: '12px',
      backgroundColor: '#fafafa',
      marginBottom: '14px',
    },
  },
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px' } },
        h('div', { style: { display: 'flex', fontSize: '13px', fontWeight: 700, color: theme.accent } }, `${analysis.groupName || GROUP_LABELS[analysis.group]} / 全国ミーグリ応募抽選`),
        h('div', {
          style: {
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '999px',
            padding: '3px 9px',
            backgroundColor: theme.accent,
            color: '#fff',
            fontSize: '11px',
            fontWeight: 800,
          },
        }, MODE_LABEL[award.mode]),
      ),
      h('div', { style: { display: 'flex', fontSize: '18px', fontWeight: 800, color: '#202432' } }, shortText(award.title || award.name, 64)),
    ),
    h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px' } },
      h('div', { style: { display: 'flex', fontSize: '34px', fontWeight: 900, color: theme.accent } }, String(award.closedCells)),
      h('div', { style: { display: 'flex', fontSize: '13px', color: '#6b7280' } }, `/ ${award.totalCells} 枠`),
      h('div', {
        style: {
          display: 'flex',
          borderRadius: '999px',
          padding: '3px 9px',
          backgroundColor: theme.accent,
          color: '#fff',
          fontSize: '12px',
          fontWeight: 800,
        },
      }, `${award.closedRate}%`),
      h('div', { style: { display: 'flex', marginLeft: 'auto', gap: '14px', fontSize: '12px', color: '#4b5563' } },
        h('div', { style: { display: 'flex' } }, `メンバー ${award.members.length}`),
        h('div', { style: { display: 'flex' } }, `日程 ${groupSlotsByDate(award.slots).length}`),
        h('div', { style: { display: 'flex' } }, `部 ${award.slots.length}`),
      ),
    ),
  );
}

function tableHeader(award, theme) {
  const slotGroups = groupSlotsByDate(award.slots);
  return [
    h('div', { style: { display: 'flex', height: `${HEADER_H}px` } },
      h('div', {
        style: {
          display: 'flex', alignItems: 'center', width: `${NAME_W}px`, flexShrink: 0,
          paddingLeft: '10px', backgroundColor: theme.headerBg, color: '#fff',
          fontSize: '12px', fontWeight: 800,
        },
      }, 'メンバー'),
      ...slotGroups.map(([date, dateSlots]) => h('div', {
        key: date,
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: `${dateSlots.length * CELL_W}px`, flexShrink: 0,
          backgroundColor: theme.headerBg, color: '#fff',
          borderLeft: '1px solid rgba(255,255,255,0.55)',
          fontSize: '12px', fontWeight: 800,
        },
      }, `${formatDate(date)}${dateSlots[0]?.venue ? ` ${dateSlots[0].venue}` : ''}`)),
      h('div', {
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'flex-end', width: `${STAT_W}px`,
          flexShrink: 0, paddingRight: '10px', backgroundColor: theme.headerBg,
          color: '#fff', fontSize: '12px', fontWeight: 800,
        },
      }, '計'),
    ),
    h('div', { style: { display: 'flex', height: '24px' } },
      h('div', { style: { display: 'flex', width: `${NAME_W}px`, flexShrink: 0, backgroundColor: theme.accentBg } }),
      ...award.slots.map((slot) => h('div', {
        key: slot.id,
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: `${CELL_W}px`, flexShrink: 0,
          backgroundColor: theme.accentBg, color: '#777',
          borderLeft: '1px solid rgba(0,0,0,0.06)',
          fontSize: '11px', fontWeight: 800,
        },
      }, String(slot.part))),
      h('div', { style: { display: 'flex', width: `${STAT_W}px`, flexShrink: 0, backgroundColor: theme.accentBg } }),
    ),
  ];
}

function memberRow(member, award, theme, idx) {
  return h('div', {
    style: {
      display: 'flex',
      height: `${ROW_H}px`,
      backgroundColor: idx % 2 === 0 ? '#fff' : '#fbfbfd',
    },
  },
    h('div', {
      style: {
        display: 'flex', alignItems: 'center', width: `${NAME_W}px`, flexShrink: 0,
        paddingLeft: '10px', borderBottom: '1px solid #f0f0f0',
        fontSize: '13px', fontWeight: member.closedCount === member.totalCount ? 800 : 600,
        color: member.closedCount === member.totalCount ? theme.accent : '#252936',
      },
    }, member.closedCount === member.totalCount && member.totalCount > 0
      ? `${member.name} 完売`
      : member.name),
    ...award.slots.map((slot) => {
      const available = slot.members.includes(member.name);
      const closed = slot.closedMembers.includes(member.name);
      return h('div', {
        key: `${member.name}-${slot.id}`,
        style: {
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: `${CELL_W}px`, height: `${ROW_H}px`, flexShrink: 0,
          borderLeft: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0',
          backgroundColor: closed ? theme.cellSolid : available ? '#fff' : '#f4f5f7',
          color: closed ? '#fff' : 'transparent',
          fontSize: '12px', fontWeight: 900,
        },
      }, closed ? '×' : '');
    }),
    h('div', {
      style: {
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        width: `${STAT_W}px`, flexShrink: 0, paddingRight: '10px',
        borderLeft: '1px solid #f0f0f0', borderBottom: '1px solid #f0f0f0',
        fontSize: '12px', color: '#4b5563',
      },
    },
      h('span', { style: { fontWeight: 900, color: '#252936' } }, String(member.closedCount)),
      h('span', { style: { color: '#9ca3af' } }, `/${member.totalCount}`),
    ),
  );
}

async function renderImage(tree, width, height) {
  const svg = await satori(tree, {
    width,
    height,
    fonts: [{ name: 'NotoSansJP', data: fontData, weight: 400, style: 'normal' }],
  });
  return new Resvg(svg, { fitTo: { mode: 'width', value: width * 2 } }).render().asPng();
}

export async function generateFortuneMeetsImage({ source, mode = 'real', analysis = null }) {
  const data = analysis || await fetchFortuneMeetsAnalysis(source);
  const award = data.awards.find((item) => item.mode === mode);
  if (!award) throw new Error(`Award mode not found: ${mode}`);

  const theme = THEME[award.group] || THEME.sakurazaka;
  const members = sortedMembers(award);
  const width = NAME_W + award.slots.length * CELL_W + STAT_W + PAD * 2;
  const summaryH = 104;
  const tableH = HEADER_H + 24 + members.length * ROW_H;
  const footerH = 28;
  const height = PAD + summaryH + 14 + tableH + footerH + PAD;

  const tree = h('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      width: `${width}px`,
      padding: `${PAD}px`,
      backgroundColor: '#fff',
      fontFamily: 'NotoSansJP',
    },
  },
    summaryHeader(data, award, theme),
    h('div', {
      style: {
        display: 'flex',
        flexDirection: 'column',
        border: `1px solid ${theme.accentBg}`,
        borderRadius: '8px',
        overflow: 'hidden',
      },
    },
      ...tableHeader(award, theme),
      ...members.map((member, idx) => memberRow(member, award, theme, idx)),
    ),
    h('div', {
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: '10px',
        fontSize: '10px',
        color: '#9ca3af',
      },
    },
      h('div', { style: { display: 'flex' } }, `${data.eventId} / award ${award.awardId}`),
      h('div', { style: { display: 'flex' } }, '46log.com / ticket.fortunemeets.app'),
    ),
  );

  return renderImage(tree, width, height);
}

export async function generateFortuneMeetsImages({ source, analysis = null }) {
  const data = analysis || await fetchFortuneMeetsAnalysis(source);
  const result = {};
  for (const award of data.awards) {
    result[award.mode] = await generateFortuneMeetsImage({ source, mode: award.mode, analysis: data });
  }
  return result;
}

if (process.argv[1] && process.argv[1].includes('fortunemeets-image-gen')) {
  const artist = process.argv[2] || 'sakurazaka46';
  const event = process.argv[3] || '15th';
  const mode = process.argv[4] || 'both';
  const configPath = process.argv[5] || '';
  const source = { artist, event };
  const analysis = configPath ? loadFortuneMeetsAnalysisFromFile(configPath, source) : await fetchFortuneMeetsAnalysis(source);

  if (mode === 'both') {
    const images = await generateFortuneMeetsImages({ source, analysis });
    for (const [key, buf] of Object.entries(images)) {
      const out = `/tmp/fortunemeets-${artist}-${event}-${key}.png`;
      writeFileSync(out, buf);
      console.log(`OK ${out} (${Math.round(buf.length / 1024)}KB)`);
    }
  } else {
    const buf = await generateFortuneMeetsImage({ source, mode, analysis });
    const out = `/tmp/fortunemeets-${artist}-${event}-${mode}.png`;
    writeFileSync(out, buf);
    console.log(`OK ${out} (${Math.round(buf.length / 1024)}KB)`);
  }
}
