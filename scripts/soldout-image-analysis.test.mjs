import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computeAnalysis,
  sortBySoldOut,
  sortByGeneration,
  buildGenGroups,
  cellAlpha,
  formatDateShort,
} from './soldout-image-analysis.mjs';

const GEN_MAP = {
  sakurazaka: {
    '山川宇衣': '4期生',
    '森田ひかる': '2期生',
    '田村保乃': '2期生',
    '中嶋優月': '3期生',
  },
  hinatazaka: {},
  nogizaka: {},
};

function buildData() {
  return {
    dates: ['2026-06-14', '2026-06-21'],
    slotNumbers: [1, 2],
    members: ['山川宇衣', '森田ひかる', '田村保乃', '中嶋優月'],
    memberTotals: { '山川宇衣': 4, '森田ひかる': 4, '田村保乃': 4, '中嶋優月': 4 },
    cells: [
      // 山川宇衣 全枠完売，最早分别在 round 2/3
      { member: '山川宇衣', date: '2026-06-14', slot: 1, round: 2 },
      { member: '山川宇衣', date: '2026-06-14', slot: 2, round: 3 },
      { member: '山川宇衣', date: '2026-06-21', slot: 1, round: 3 },
      { member: '山川宇衣', date: '2026-06-21', slot: 2, round: 3 },
      // 森田ひかる 全枠完売 round 1（应排在最前面）
      { member: '森田ひかる', date: '2026-06-14', slot: 1, round: 1 },
      { member: '森田ひかる', date: '2026-06-14', slot: 2, round: 1 },
      { member: '森田ひかる', date: '2026-06-21', slot: 1, round: 1 },
      { member: '森田ひかる', date: '2026-06-21', slot: 2, round: 1 },
      // 田村保乃 部分完売
      { member: '田村保乃', date: '2026-06-14', slot: 1, round: 2 },
      { member: '田村保乃', date: '2026-06-21', slot: 1, round: 3 },
      // 同 (member, date, slot) 在 round 3 又出现一次（应被忽略，保留 round 2）
      { member: '田村保乃', date: '2026-06-14', slot: 1, round: 3 },
    ],
  };
}

test('computeAnalysis cell 取首次完売 round（与网页一致）', () => {
  const a = computeAnalysis(buildData(), 'sakurazaka', GEN_MAP);
  const tamura = a.members.find((m) => m.name === '田村保乃');
  assert.equal(tamura.cells.get('2026-06-14::1'), 2, '同 cell 重复出现时应保留首次');
  assert.equal(tamura.soldOutCount, 2);
  assert.equal(tamura.fullSoldOutRound, null);
});

test('computeAnalysis 全枠完売的 fullSoldOutRound 为该成员最后一格的 round', () => {
  const a = computeAnalysis(buildData(), 'sakurazaka', GEN_MAP);
  const yamakawa = a.members.find((m) => m.name === '山川宇衣');
  const morita = a.members.find((m) => m.name === '森田ひかる');
  assert.equal(yamakawa.fullSoldOutRound, 3);
  assert.equal(morita.fullSoldOutRound, 1);
});

test('computeAnalysis totalCells 用 memberTotals 累加，不 fallback 成 gridSize', () => {
  const data = buildData();
  data.memberTotals = { '山川宇衣': 4, '森田ひかる': 4, '田村保乃': 4 }; // 中嶋優月 缺失
  const a = computeAnalysis(data, 'sakurazaka', GEN_MAP);
  assert.equal(a.totalCells, 4 + 4 + 4 + 0);
});

test('sortBySoldOut: 1次完売 > 2次 > 部分 > 未', () => {
  const a = computeAnalysis(buildData(), 'sakurazaka', GEN_MAP);
  const sorted = sortBySoldOut(a.members).map((m) => m.name);
  assert.deepEqual(sorted, ['森田ひかる', '山川宇衣', '田村保乃', '中嶋優月']);
});

test('sortByGeneration: 期生升序，期内按完売 round 升序，再按読み仮名', () => {
  const a = computeAnalysis(buildData(), 'sakurazaka', GEN_MAP);
  const sorted = sortByGeneration(a.members).map((m) => m.name);
  // 2期生（森田 round1, 田村 部分）→ 3期生（中嶋 未）→ 4期生（山川 round3）
  assert.deepEqual(sorted, ['森田ひかる', '田村保乃', '中嶋優月', '山川宇衣']);
});

test('buildGenGroups 正确分组并保留排序后的成员顺序', () => {
  const a = computeAnalysis(buildData(), 'sakurazaka', GEN_MAP);
  const groups = buildGenGroups(sortByGeneration(a.members));
  assert.deepEqual(groups.map((g) => g.generation), ['2期生', '3期生', '4期生']);
  assert.deepEqual(groups[0].members.map((m) => m.name), ['森田ひかる', '田村保乃']);
  assert.equal(groups[0].soldOutCount, 4 + 2);
  assert.equal(groups[0].totalCount, 4 + 4);
});

test('cellAlpha: 越早 round 越深；最大 round = 0.4', () => {
  assert.equal(cellAlpha(null, 5), 0);
  assert.equal(cellAlpha(1, 1), 1);
  assert.equal(cellAlpha(1, 5), 1.0); // (1 - 0/4) = 1
  assert.equal(cellAlpha(5, 5), 0.4); // 最遅 round
  assert.ok(cellAlpha(3, 5) > 0.4 && cellAlpha(3, 5) < 1);
});

test('formatDateShort: YYYY-MM-DD → M/D(曜)', () => {
  assert.equal(formatDateShort('2026-06-14'), '6/14(日)');
  assert.equal(formatDateShort('2026-06-21'), '6/21(日)');
  assert.equal(formatDateShort('2026-05-31'), '5/31(日)');
});
