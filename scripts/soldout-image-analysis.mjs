/**
 * 完売マトリクス画像 - 純粋分析ロジック
 * 与网页 src/components/meguri/soldout-analysis.ts 行为对齐
 *
 * - cell.round 取「最早一次完売」的 round（API 返回按 round asc 即可）
 * - 排序在并列时使用 50 音读み仮名
 * - totalCount 不 fallback 到 gridSize，缺失时为 0
 */

import { readFileSync, existsSync } from 'fs';

export const GENERATION_ORDER = {
  '1期生': 1, '一期生': 1,
  '2期生': 2, '二期生': 2,
  '3期生': 3, '三期生': 3,
  '4期生': 4, '四期生': 4,
  '5期生': 5, '五期生': 5,
  '6期生': 6, '六期生': 6,
};

const GROUP_SLUG_MAP = {
  '樱坂46': 'sakurazaka', '櫻坂46': 'sakurazaka',
  '日向坂46': 'hinatazaka',
  '乃木坂46': 'nogizaka',
};

// 読み仮名（与 src/components/meguri/soldout-analysis.ts 同步，并列时按 50 音）
const MEMBER_READINGS = {
  // 櫻坂46 二期生
  '井上梨名': 'いのうえりな', '遠藤光莉': 'えんどうひかり', '大園玲': 'おおぞのれい',
  '大沼晶保': 'おおぬまあきほ', '幸阪茉里乃': 'こうさかまりの', '武元唯衣': 'たけもとゆい',
  '田村保乃': 'たむらほの', '藤吉夏鈴': 'ふじよしかりん', '増本綺良': 'ますもときら',
  '松田里奈': 'まつだりな', '森田ひかる': 'もりたひかる', '守屋麗奈': 'もりやれな',
  '山﨑天': 'やまさきてん', '山崎天': 'やまさきてん', '関有美子': 'せきゆみこ',
  // 櫻坂46 三期生
  '石森璃花': 'いしもりりか', '遠藤理子': 'えんどうりこ', '小田倉麗奈': 'おだくられいな',
  '小島凪紗': 'こじまなぎさ', '谷口愛季': 'たにぐちあいり', '中嶋優月': 'なかしまゆづき',
  '的野美青': 'まとのみお', '向井純葉': 'むかいいとは', '村井優': 'むらいゆう',
  '村山美羽': 'むらやまみう', '山下瞳月': 'やましたしづき',
  // 櫻坂46 四期生
  '浅井恋乃未': 'あさいこのみ', '稲熊ひな': 'いなぐまひな', '勝又春': 'かつまたはる',
  '佐藤愛桜': 'さとうねお', '中川智尋': 'なかがわちひろ', '松本和子': 'まつもとわこ',
  '目黒陽色': 'めぐろひいろ', '山川宇衣': 'やまかわうい', '山田桃実': 'やまだももみ',
  // 日向坂46
  '金村美玖': 'かなむらみく', '河田陽菜': 'かわたひな', '小坂菜緒': 'こさかなお',
  '松田好花': 'まつだこのか',
  '上村ひなの': 'かみむらひなの', '髙橋未来虹': 'たかはしみくに', '森本茉莉': 'もりもとまりぃ',
  '山口陽世': 'やまぐちはるよ',
  '石塚瑶季': 'いしづかたまき', '小西夏菜実': 'こにしなつみ', '清水理央': 'しみずりお',
  '正源司陽子': 'しょうげんじようこ', '竹内希来里': 'たけうちきらり', '平尾帆夏': 'ひらおほのか',
  '平岡海月': 'ひらおかみづき', '藤嶌果歩': 'ふじしまかほ', '宮地すみれ': 'みやちすみれ',
  '山下葉留花': 'やましたはるか', '渡辺莉奈': 'わたなべりな',
};

export function getMemberReading(name) {
  return MEMBER_READINGS[name] || name;
}

/**
 * member-images.json から各 group の member→generation を構築
 * @param {string[]} candidatePaths
 */
export function loadGenerationMap(candidatePaths) {
  const map = { sakurazaka: {}, hinatazaka: {}, nogizaka: {} };
  let raw = null;
  for (const p of candidatePaths) {
    if (existsSync(p)) {
      raw = JSON.parse(readFileSync(p, 'utf-8'));
      break;
    }
  }
  if (!raw?.images) return map;
  for (const [name, info] of Object.entries(raw.images)) {
    const slug = GROUP_SLUG_MAP[info.group];
    if (!slug) continue;
    const clean = name.replace(/[\s\u3000]+/g, '');
    if (!map[slug][clean]) map[slug][clean] = info.generation;
  }
  return map;
}

/**
 * @typedef {{
 *   name: string;
 *   generation: string;
 *   soldOutCount: number;
 *   totalCount: number;
 *   fullSoldOutRound: number | null;
 *   cells: Map<string, number>;
 * }} MemberInfo
 */

/**
 * @param {{ dates: string[]; slotNumbers: number[]; members?: string[]; memberTotals?: Record<string, number>; cells: Array<{ member: string; date: string; slot: number; round: number }> }} data
 * @param {string} group
 * @param {Record<string, Record<string, string>>} generationMap
 */
export function computeAnalysis(data, group, generationMap) {
  const groupGens = generationMap[group] || {};
  const memberTotals = data.memberTotals || {};
  /** @type {Map<string, MemberInfo>} */
  const memberMap = new Map();

  for (const name of (data.members || [])) {
    memberMap.set(name, {
      name,
      generation: groupGens[name] || '不明',
      soldOutCount: 0,
      totalCount: memberTotals[name] || 0,
      fullSoldOutRound: null,
      cells: new Map(),
    });
  }

  // 安全起見：保证按 round asc 处理，cell 取首次完売 round
  const cellsAsc = [...data.cells].sort((a, b) => a.round - b.round);
  for (const cell of cellsAsc) {
    if (!memberMap.has(cell.member)) {
      memberMap.set(cell.member, {
        name: cell.member,
        generation: groupGens[cell.member] || '不明',
        soldOutCount: 0,
        totalCount: memberTotals[cell.member] || 0,
        fullSoldOutRound: null,
        cells: new Map(),
      });
    }
    const m = memberMap.get(cell.member);
    const key = `${cell.date}::${cell.slot}`;
    if (!m.cells.has(key)) m.cells.set(key, cell.round);
  }

  const gridSize = data.dates.length * data.slotNumbers.length;
  for (const member of memberMap.values()) {
    member.soldOutCount = member.cells.size;
    if (member.soldOutCount > 0 && member.soldOutCount >= gridSize) {
      member.fullSoldOutRound = Math.max(...member.cells.values());
    }
  }

  const members = [...memberMap.values()];
  const totalSoldOut = members.reduce((s, m) => s + m.soldOutCount, 0);
  const totalCells = members.reduce((s, m) => s + m.totalCount, 0);
  const maxRound = Math.max(1, ...cellsAsc.map((c) => c.round));

  return {
    members,
    dates: data.dates,
    slotNumbers: data.slotNumbers,
    gridSize,
    totalSoldOut,
    totalCells,
    maxRound,
  };
}

export function sortBySoldOut(members) {
  return [...members].sort((a, b) => {
    const rA = a.fullSoldOutRound ?? Infinity;
    const rB = b.fullSoldOutRound ?? Infinity;
    if (rA !== rB) return rA - rB;
    if (b.soldOutCount !== a.soldOutCount) return b.soldOutCount - a.soldOutCount;
    return getMemberReading(a.name).localeCompare(getMemberReading(b.name), 'ja');
  });
}

export function sortByGeneration(members) {
  return [...members].sort((a, b) => {
    const gA = GENERATION_ORDER[a.generation] || 99;
    const gB = GENERATION_ORDER[b.generation] || 99;
    if (gA !== gB) return gA - gB;
    const rA = a.fullSoldOutRound ?? Infinity;
    const rB = b.fullSoldOutRound ?? Infinity;
    if (rA !== rB) return rA - rB;
    return getMemberReading(a.name).localeCompare(getMemberReading(b.name), 'ja');
  });
}

export function buildGenGroups(sortedMembers) {
  const order = [];
  const groupedMap = new Map();
  for (const member of sortedMembers) {
    if (!groupedMap.has(member.generation)) {
      groupedMap.set(member.generation, []);
      order.push(member.generation);
    }
    groupedMap.get(member.generation).push(member);
  }
  return order
    .sort((a, b) => (GENERATION_ORDER[a] || 99) - (GENERATION_ORDER[b] || 99))
    .map((generation) => {
      const ms = groupedMap.get(generation);
      return {
        generation,
        members: ms,
        soldOutCount: ms.reduce((s, m) => s + m.soldOutCount, 0),
        totalCount: ms.reduce((s, m) => s + m.totalCount, 0),
      };
    });
}

/**
 * 与网页 SoldOutMatrix.tsx getCellColor 对齐：越早 round 越深
 * t = 1 - (round - 1) / max(1, maxRound - 1)
 * alpha = 0.4 + t * 0.6
 */
export function cellAlpha(round, maxRound) {
  if (round == null) return 0;
  if (maxRound <= 1) return 1;
  const t = 1 - (round - 1) / Math.max(1, maxRound - 1);
  return 0.4 + t * 0.6;
}

/** YYYY-MM-DD → M/D(曜) */
export function formatDateShort(dateStr) {
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  const w = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getMonth() + 1}/${d.getDate()}(${w[d.getDay()]})`;
}
