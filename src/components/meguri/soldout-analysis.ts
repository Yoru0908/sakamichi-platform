import type { MiguriSoldOutCell, MiguriSoldOutPayload, MiguriSoldOutRound } from '@/utils/auth-api';
import memberImagesData from '../../../public/data/member-images.json';

// ── Generation metadata (auto-built from member-images.json) ──

const GENERATION_ORDER: Record<string, number> = {
  '1期生': 1, '一期生': 1,
  '2期生': 2, '二期生': 2,
  '3期生': 3, '三期生': 3,
  '4期生': 4, '四期生': 4,
  '5期生': 5, '五期生': 5,
  '6期生': 6, '六期生': 6,
};

const GROUP_SLUG_MAP: Record<string, string> = {
  '樱坂46': 'sakurazaka', '櫻坂46': 'sakurazaka',
  '日向坂46': 'hinatazaka',
  '乃木坂46': 'nogizaka',
};

const GROUP_GENERATION_MAP: Record<string, Record<string, string>> = {
  sakurazaka: {}, hinatazaka: {}, nogizaka: {},
};

// Build from member-images.json at module init
const images = (memberImagesData as { images: Record<string, { group: string; generation: string }> }).images;
for (const [rawName, info] of Object.entries(images)) {
  const slug = GROUP_SLUG_MAP[info.group];
  if (!slug) continue;
  const clean = rawName.replace(/[\s\u3000]+/g, '');
  if (!GROUP_GENERATION_MAP[slug][clean]) {
    GROUP_GENERATION_MAP[slug][clean] = info.generation;
  }
}

export function getMemberGeneration(member: string, group: string): string {
  return GROUP_GENERATION_MAP[group]?.[member] || '不明';
}

// ── 50音ソート用読み仮名 ──

const MEMBER_READINGS: Record<string, string> = {
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
  // 日向坂46 二期生
  '金村美玖': 'かなむらみく', '河田陽菜': 'かわたひな', '小坂菜緒': 'こさかなお',
  '松田好花': 'まつだこのか',
  // 日向坂46 三期生
  '上村ひなの': 'かみむらひなの', '髙橋未来虹': 'たかはしみくに', '森本茉莉': 'もりもとまりぃ',
  '山口陽世': 'やまぐちはるよ',
  // 日向坂46 四期生
  '石塚瑶季': 'いしづかたまき', '小西夏菜実': 'こにしなつみ', '清水理央': 'しみずりお',
  '正源司陽子': 'しょうげんじようこ', '竹内希来里': 'たけうちきらり', '平尾帆夏': 'ひらおほのか',
  '平岡海月': 'ひらおかみづき', '藤嶌果歩': 'ふじしまかほ', '宮地すみれ': 'みやちすみれ',
  '山下葉留花': 'やましたはるか', '渡辺莉奈': 'わたなべりな',
  // 日向坂46 五期生
  '岸帆夏': 'きしほのか', '小田桃愛': 'おだももな', '月足つきの': 'つきあしつきの',
  '永井美裕': 'ながいみゆ', '馬渕このみ': 'まぶちこのみ', '宮澤成良': 'みやざわせいら',
  '大野愛実': 'おおのあみ', '鶴崎仁香': 'つるさきにか', '坂井新奈': 'さかいにいな',
  '佐藤優羽': 'さとうゆうわ', '下田衣珠季': 'しもだいずき', '片山紗希': 'かたやまさき',
  '大田美月': 'おおたみづき', '高井俐香': 'たかいりこ', '松尾桜': 'まつおさくら',
  '蔵盛妃那乃': 'くらもりひなの',
};

export function getMemberReading(name: string): string {
  return MEMBER_READINGS[name] || name;
}

// ── Core computation types ──

export type MemberSoldOutInfo = {
  name: string;
  generation: string;
  soldOutCount: number;
  totalCount: number;
  fullSoldOutRound: number | null;
  cells: Map<string, number>; // `date::slot` -> round number
};

export type GenerationSummary = {
  generation: string;
  soldOutCount: number;
  totalCount: number;
};

export type SoldOutAnalysis = {
  event: MiguriSoldOutPayload['event'];
  dates: string[];
  slotNumbers: number[];
  rounds: MiguriSoldOutRound[];
  members: MemberSoldOutInfo[];
  generations: GenerationSummary[];
  totalSoldOut: number;
  totalCells: number;
};

// ── Compute analysis from API payload ──

export function computeSoldOutAnalysis(
  data: MiguriSoldOutPayload,
  targetRound?: number,
): SoldOutAnalysis {
  const maxRound = targetRound ?? Math.max(0, ...data.rounds.map((r) => r.round));

  // Build per-member info
  const memberMap = new Map<string, MemberSoldOutInfo>();

  for (const memberName of data.members) {
    memberMap.set(memberName, {
      name: memberName,
      generation: getMemberGeneration(memberName, data.event.group),
      soldOutCount: 0,
      totalCount: data.memberTotals[memberName] || 0,
      fullSoldOutRound: null,
      cells: new Map(),
    });
  }

  // Fill in sold-out cells up to targetRound
  for (const cell of data.cells) {
    if (cell.round > maxRound) continue;
    const member = memberMap.get(cell.member);
    if (!member) continue;
    const key = `${cell.date}::${cell.slot}`;
    if (!member.cells.has(key)) {
      member.cells.set(key, cell.round);
    }
  }

  // Compute soldOutCount and fullSoldOutRound
  const gridSize = data.dates.length * data.slotNumbers.length;
  for (const member of memberMap.values()) {
    member.soldOutCount = member.cells.size;
    // Use grid size (dates × slots) as the threshold for "fully sold out"
    if (member.soldOutCount > 0 && member.soldOutCount >= gridSize) {
      member.fullSoldOutRound = Math.max(...member.cells.values());
    }
  }

  // Generation summaries
  const genMap = new Map<string, GenerationSummary>();
  for (const member of memberMap.values()) {
    const gen = member.generation;
    if (!genMap.has(gen)) {
      genMap.set(gen, { generation: gen, soldOutCount: 0, totalCount: 0 });
    }
    const summary = genMap.get(gen)!;
    summary.soldOutCount += member.soldOutCount;
    summary.totalCount += member.totalCount;
  }

  const generations = Array.from(genMap.values()).sort(
    (a, b) => (GENERATION_ORDER[a.generation] || 99) - (GENERATION_ORDER[b.generation] || 99),
  );

  const members = Array.from(memberMap.values());

  return {
    event: data.event,
    dates: data.dates,
    slotNumbers: data.slotNumbers,
    rounds: data.rounds,
    members,
    generations,
    totalSoldOut: members.reduce((sum, m) => sum + m.soldOutCount, 0),
    totalCells: members.reduce((sum, m) => sum + m.totalCount, 0),
  };
}

// ── Sorting ──

export function sortByGeneration(members: MemberSoldOutInfo[]): MemberSoldOutInfo[] {
  return [...members].sort((a, b) => {
    const genA = GENERATION_ORDER[a.generation] || 99;
    const genB = GENERATION_ORDER[b.generation] || 99;
    if (genA !== genB) return genA - genB;
    // Within same generation: sold-out members first, by round ascending (1次完売 > 2次 > 3次)
    const rA = a.fullSoldOutRound ?? Infinity;
    const rB = b.fullSoldOutRound ?? Infinity;
    if (rA !== rB) return rA - rB;
    return getMemberReading(a.name).localeCompare(getMemberReading(b.name), 'ja');
  });
}

export function sortBySoldOut(members: MemberSoldOutInfo[]): MemberSoldOutInfo[] {
  return [...members].sort((a, b) => {
    // Fully sold-out members first, by round ascending (1次 > 2次 > 3次)
    const rA = a.fullSoldOutRound ?? Infinity;
    const rB = b.fullSoldOutRound ?? Infinity;
    if (rA !== rB) return rA - rB;
    // Within same round (or both not sold out): higher count first
    if (b.soldOutCount !== a.soldOutCount) return b.soldOutCount - a.soldOutCount;
    // 50-on order for ties
    return getMemberReading(a.name).localeCompare(getMemberReading(b.name), 'ja');
  });
}

// ── Helpers ──

export function getCellRound(
  member: MemberSoldOutInfo,
  date: string,
  slot: number,
): number | null {
  return member.cells.get(`${date}::${slot}`) ?? null;
}

export function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr);
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]})`;
}
