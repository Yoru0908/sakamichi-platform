import type { MiguriGroupId } from '@/utils/auth-api';

// Release-price catalog mirrored from https://miguri-dashboard.sakamichi.fans/app.
const MIGURI_CD_PRICE_CATALOG: Array<{
  group: MiguriGroupId;
  title: string;
  priceYen: number;
}> = [
  {
    group: 'nogizaka',
    title: "11th YEAR BIRTHDAY LIVE DAY2 5th MEMBERS",
    priceYen: 8250,
  },
  {
    group: 'sakurazaka',
    title: "Lonesome rabbit / What's “KAZOKU”?",
    priceYen: 2000,
  },
  {
    group: 'sakurazaka',
    title: "What's “KAZOKU”? / Lonesome rabbit",
    priceYen: 2000,
  },
  {
    group: 'nogizaka',
    title: "僕だけの君 ～Under Super Best～",
    priceYen: 6112,
  },
  {
    group: 'sakurazaka',
    title: "I want tomorrow to come",
    priceYen: 2000,
  },
  {
    group: 'sakurazaka',
    title: "The growing up train",
    priceYen: 2000,
  },
  {
    group: 'nogizaka',
    title: "ごめんねFingers crossed",
    priceYen: 1900,
  },
  {
    group: 'sakurazaka',
    title: "UDAGAWA GENERATION",
    priceYen: 2000,
  },
  {
    group: 'sakurazaka',
    title: "Unhappy birthday構文",
    priceYen: 2000,
  },
  {
    group: 'nogizaka',
    title: "最後に階段を駆け上がったのはいつだ？",
    priceYen: 2000,
  },
  {
    group: 'hinatazaka',
    title: "こんなに好きになっちゃっていいの？",
    priceYen: 1900,
  },
  {
    group: 'sakurazaka',
    title: "そこ曲がったら、櫻坂？　山下瞳月編",
    priceYen: 6600,
  },
  {
    group: 'sakurazaka',
    title: "そこ曲がったら、櫻坂？　的野美青編",
    priceYen: 6600,
  },
  {
    group: 'hinatazaka',
    title: "Love yourself!",
    priceYen: 2000,
  },
  {
    group: 'sakurazaka',
    title: "Nobody's fault",
    priceYen: 1900,
  },
  {
    group: 'nogizaka',
    title: "夜明けまで強がらなくてもいい",
    priceYen: 1884,
  },
  {
    group: 'hinatazaka',
    title: "月と星が踊るMidnight",
    priceYen: 1900,
  },
  {
    group: 'sakurazaka',
    title: "Make or Break",
    priceYen: 2000,
  },
  {
    group: 'nogizaka',
    title: "いつかできるから今日できる",
    priceYen: 1681,
  },
  {
    group: 'nogizaka',
    title: "好きというのはロックだぜ！",
    priceYen: 1900,
  },
  {
    group: 'sakurazaka',
    title: "As you know?",
    priceYen: 6800,
  },
  {
    group: 'hinatazaka',
    title: "Kind of love",
    priceYen: 2000,
  },
  {
    group: 'nogizaka',
    title: "Same numbers",
    priceYen: 2000,
  },
  {
    group: 'sakurazaka',
    title: "何歳の頃に戻りたいのか？",
    priceYen: 2000,
  },
  {
    group: 'nogizaka',
    title: "帰り道は遠回りしたくなる",
    priceYen: 1884,
  },
  {
    group: 'nogizaka',
    title: "生まれてから初めて見た夢",
    priceYen: 5390,
  },
  {
    group: 'nogizaka',
    title: "Actually...",
    priceYen: 1900,
  },
  {
    group: 'hinatazaka',
    title: "Am I ready?",
    priceYen: 1900,
  },
  {
    group: 'sakurazaka',
    title: "Start over!",
    priceYen: 1900,
  },
  {
    group: 'nogizaka',
    title: "今、話したい誰かがいる",
    priceYen: 1681,
  },
  {
    group: 'hinatazaka',
    title: "卒業写真だけが知ってる",
    priceYen: 2000,
  },
  {
    group: 'nogizaka',
    title: "夏のFree&Easy",
    priceYen: 1681,
  },
  {
    group: 'nogizaka',
    title: "My respect",
    priceYen: 22000,
  },
  {
    group: 'hinatazaka',
    title: "One choice",
    priceYen: 1900,
  },
  {
    group: 'nogizaka',
    title: "Time flies",
    priceYen: 7000,
  },
  {
    group: 'nogizaka',
    title: "ジコチューで行こう！",
    priceYen: 1681,
  },
  {
    group: 'nogizaka',
    title: "今が思い出になるまで",
    priceYen: 6490,
  },
  {
    group: 'nogizaka',
    title: "走れ！Bicycle",
    priceYen: 1676,
  },
  {
    group: 'sakurazaka',
    title: "Addiction",
    priceYen: 9600,
  },
  {
    group: 'nogizaka',
    title: "Sing Out！",
    priceYen: 1884,
  },
  {
    group: 'nogizaka',
    title: "ハルジオンが咲く頃",
    priceYen: 1681,
  },
  {
    group: 'nogizaka',
    title: "乃木坂ヒット祈願中",
    priceYen: 6050,
  },
  {
    group: 'nogizaka',
    title: "乃木坂ライブ潜入中",
    priceYen: 6050,
  },
  {
    group: 'nogizaka',
    title: "僕は僕を好きになる",
    priceYen: 1900,
  },
  {
    group: 'nogizaka',
    title: "裸足でSummer",
    priceYen: 1681,
  },
  {
    group: 'nogizaka',
    title: "Monopoly",
    priceYen: 2000,
  },
  {
    group: 'nogizaka',
    title: "インフルエンサー",
    priceYen: 1681,
  },
  {
    group: 'nogizaka',
    title: "おいでシャンプー",
    priceYen: 1676,
  },
  {
    group: 'nogizaka',
    title: "おひとりさま天国",
    priceYen: 1900,
  },
  {
    group: 'nogizaka',
    title: "ぐるぐるカーテン",
    priceYen: 1676,
  },
  {
    group: 'nogizaka',
    title: "ここにはないもの",
    priceYen: 1900,
  },
  {
    group: 'nogizaka',
    title: "しあわせの保護色",
    priceYen: 1900,
  },
  {
    group: 'nogizaka',
    title: "シンクロニシティ",
    priceYen: 1681,
  },
  {
    group: 'hinatazaka',
    title: "ソンナコトナイヨ",
    priceYen: 1900,
  },
  {
    group: 'nogizaka',
    title: "ネーブルオレンジ",
    priceYen: 2000,
  },
  {
    group: 'nogizaka',
    title: "乃木坂基礎工事中",
    priceYen: 6050,
  },
  {
    group: 'nogizaka',
    title: "乃木坂後輩奮闘中",
    priceYen: 6050,
  },
  {
    group: 'nogizaka',
    title: "人は夢を二度見る",
    priceYen: 1900,
  },
  {
    group: 'nogizaka',
    title: "何度目の青空か？",
    priceYen: 1681,
  },
  {
    group: 'hinatazaka',
    title: "君はハニーデュー",
    priceYen: 2000,
  },
  {
    group: 'nogizaka',
    title: "気づいたら片想い",
    priceYen: 1681,
  },
  {
    group: 'hinatazaka',
    title: "お願いバッハ！",
    priceYen: 2000,
  },
  {
    group: 'nogizaka',
    title: "ガールズルール",
    priceYen: 1676,
  },
  {
    group: 'hinatazaka',
    title: "クリフハンガー",
    priceYen: 2000,
  },
  {
    group: 'nogizaka',
    title: "サヨナラの意味",
    priceYen: 1681,
  },
  {
    group: 'nogizaka',
    title: "それぞれの椅子",
    priceYen: 4730,
  },
  {
    group: 'nogizaka',
    title: "チャンスは平等",
    priceYen: 2000,
  },
  {
    group: 'hinatazaka',
    title: "ドレミソラシド",
    priceYen: 1884,
  },
  {
    group: 'nogizaka',
    title: "制服のマネキン",
    priceYen: 1676,
  },
  {
    group: 'hinatazaka',
    title: "君しか勝たん",
    priceYen: 1900,
  },
  {
    group: 'nogizaka',
    title: "君に叱られた",
    priceYen: 1900,
  },
  {
    group: 'nogizaka',
    title: "君の名は希望",
    priceYen: 1676,
  },
  {
    group: 'nogizaka',
    title: "是非に及ばず",
    priceYen: 2000,
  },
  {
    group: 'hinatazaka',
    title: "絶対的第六感",
    priceYen: 2000,
  },
  {
    group: 'hinatazaka',
    title: "走り出す瞬間",
    priceYen: 5398,
  },
  {
    group: 'nogizaka',
    title: "チートデイ",
    priceYen: 2000,
  },
  {
    group: 'hinatazaka',
    title: "ひなたざか",
    priceYen: 5990,
  },
  {
    group: 'nogizaka',
    title: "命は美しい",
    priceYen: 1681,
  },
  {
    group: 'nogizaka',
    title: "太陽ノック",
    priceYen: 1681,
  },
  {
    group: 'hinatazaka',
    title: "脈打つ感情",
    priceYen: 7800,
  },
  {
    group: 'nogizaka',
    title: "バレッタ",
    priceYen: 1676,
  },
  {
    group: 'nogizaka',
    title: "ビリヤニ",
    priceYen: 2000,
  },
  {
    group: 'sakurazaka',
    title: "五月雨よ",
    priceYen: 1900,
  },
  {
    group: 'hinatazaka',
    title: "僕なんか",
    priceYen: 1900,
  },
  {
    group: 'sakurazaka',
    title: "承認欲求",
    priceYen: 1900,
  },
  {
    group: 'sakurazaka',
    title: "自業自得",
    priceYen: 2000,
  },
  {
    group: 'nogizaka',
    title: "透明な色",
    priceYen: 6050,
  },
  {
    group: 'sakurazaka',
    title: "BAN",
    priceYen: 1900,
  },
  {
    group: 'hinatazaka',
    title: "キュン",
    priceYen: 1884,
  },
  {
    group: 'hinatazaka',
    title: "ってか",
    priceYen: 1900,
  },
  {
    group: 'nogizaka',
    title: "歩道橋",
    priceYen: 2000,
  },
  {
    group: 'sakurazaka',
    title: "流れ弾",
    priceYen: 1900,
  },
  {
    group: 'nogizaka',
    title: "逃げ水",
    priceYen: 1681,
  },
  {
    group: 'sakurazaka',
    title: "桜月",
    priceYen: 1900,
  },
];

function normalizeReleaseTitle(value: string) {
  return value
    .replace(/[‘’‛′＇]/g, "'")
    .replace(/[“”‟″＂]/g, '"')
    .replace(/[！-～]/g, (char) =>
      String.fromCharCode(char.charCodeAt(0) - 0xfee0),
    )
    .replace(/　/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveMiguriCdPriceYen(
  group: MiguriGroupId | null | undefined,
  eventTitle: string | null | undefined,
) {
  if (!group || !eventTitle) return 0;
  const normalizedTitle = normalizeReleaseTitle(eventTitle);
  return (
    MIGURI_CD_PRICE_CATALOG.find(
      (item) =>
        item.group === group &&
        normalizedTitle.includes(normalizeReleaseTitle(item.title)),
    )?.priceYen || 0
  );
}
