import type { Member, PublishedRepo, GroupId } from '@/types/repo';
import memberImagesJson from '../../public/data/member-images.json';

/* ── Group name → GroupId/groupName mapping ── */
const GROUP_MAP: Record<string, { group: 'nogizaka' | 'sakurazaka' | 'hinatazaka'; groupName: string }> = {
  '乃木坂46': { group: 'nogizaka', groupName: '乃木坂46' },
  '樱坂46':   { group: 'sakurazaka', groupName: '櫻坂46' },
  '日向坂46': { group: 'hinatazaka', groupName: '日向坂46' },
};

/* ── Build member list from member-images.json (official website photos) ── */
function buildMemberList(): Member[] {
  const images = (memberImagesJson as any).images as Record<string, { group: string; imageUrl?: string }>;
  const seen = new Set<string>();
  const members: Member[] = [];
  for (const [rawName, entry] of Object.entries(images)) {
    if (!rawName.includes(' ')) continue; // skip de-spaced duplicates; use spaced version
    const name = rawName.replace(/\s/g, '');
    if (seen.has(name)) continue;
    seen.add(name);
    const g = GROUP_MAP[entry.group];
    if (!g) continue;
    members.push({ id: name, name, group: g.group, groupName: g.groupName, imageUrl: entry.imageUrl || '' });
  }
  members.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  return members;
}

export const MOCK_MEMBERS: Member[] = buildMemberList();

export function getMembersByGroup(group?: GroupId): Member[] {
  if (!group) return MOCK_MEMBERS;
  return MOCK_MEMBERS.filter(m => m.group === group);
}

export function getMemberById(id: string): Member | undefined {
  return MOCK_MEMBERS.find(m => m.id === id);
}

/* ── Mock published repos for community ── */

export const MOCK_REPOS: PublishedRepo[] = [
  {
    id: 1,
    memberId: '高井俐香',
    memberName: '高井俐香',
    groupId: 'hinatazaka',
    groupName: '日向坂46',
    memberImageUrl: getMemberById('高井俐香')?.imageUrl || '',
    eventDate: '2026/3/8',
    eventType: 'ミーグリ',
    slotNumber: 1,
    ticketCount: 4,
    nickname: '我爱你様',
    messages: [
      { id: '1', speaker: 'me', text: 'やっほー！' },
      { id: '2', speaker: 'member', text: 'やっほー！' },
      { id: '3', speaker: 'me', text: '今日はセナさんです！' },
      { id: '4', speaker: 'member', text: 'わかるよwwwwカッコいい' },
      { id: '5', speaker: 'me', text: 'もし佐藤優羽からセナさんを奪うなら、リカたんはどうする？告白の一言ください' },
      { id: '6', speaker: 'member', text: 'リカたんのこともっともっと好きになれ' },
      { id: '7', speaker: 'me', text: '萌え萌えキュン (¨̮⑅)ﾋ(⑅¨̮三¨̮⑅)ﾋ(💪¨̮💪)ｷﾞｭﾝ' },
      { id: '8', speaker: 'member', text: 'wwwwwwもう好きになった' },
    ],
    tags: ['fishing', 'funny'],
    reactions: { lemon: 234, sweet: 156, funny: 89, pray: 12 },
    createdAt: '2026-03-08T18:30:00Z',
    isPublic: true,
    template: 'meguri',
    userId: 'user_001',
    userName: 'リカたん推し',
  },
  {
    id: 2,
    memberId: '山下瞳月',
    memberName: '山下瞳月',
    groupId: 'sakurazaka',
    groupName: '櫻坂46',
    memberImageUrl: getMemberById('山下瞳月')?.imageUrl || '',
    eventDate: '2026/3/15',
    eventType: 'ミーグリ',
    slotNumber: 2,
    ticketCount: 5,
    nickname: 'しーちゃん大好き',
    messages: [
      { id: '1', speaker: 'me', text: 'しーちゃん今日もかわいい！' },
      { id: '2', speaker: 'member', text: 'ありがとう〜！今日何回目？' },
      { id: '3', speaker: 'me', text: '3回目！全部しーちゃん' },
      { id: '4', speaker: 'member', text: 'えー！嬉しい！(ジーっと見つめる)' },
      { id: '5', speaker: 'me', text: '(心臓止まる)' },
      { id: '6', speaker: 'member', text: 'ふふ、また来てね♡' },
    ],
    tags: ['fishing', 'godly'],
    reactions: { lemon: 512, sweet: 388, funny: 23, pray: 45 },
    createdAt: '2026-03-15T19:00:00Z',
    isPublic: true,
    template: 'meguri',
    userId: 'user_002',
    userName: '瞳月ガチ恋勢',
  },
  {
    id: 3,
    memberId: '森田ひかる',
    memberName: '森田ひかる',
    groupId: 'sakurazaka',
    groupName: '櫻坂46',
    memberImageUrl: getMemberById('森田ひかる')?.imageUrl || '',
    eventDate: '2026/3/9',
    eventType: 'ミーグリ',
    slotNumber: 3,
    ticketCount: 2,
    nickname: 'ひーちゃんファン',
    messages: [
      { id: '1', speaker: 'me', text: 'ひかるちゃん、最近のブログ面白すぎ' },
      { id: '2', speaker: 'member', text: 'どれ？？猫のやつ？' },
      { id: '3', speaker: 'me', text: '猫のやつ！あと料理の失敗の話' },
      { id: '4', speaker: 'member', text: 'あれ本当にやばかったww台所が大変なことに' },
      { id: '5', speaker: 'me', text: '写真見たかったww' },
      { id: '6', speaker: 'member', text: '載せれないレベルだったから…(笑)' },
    ],
    tags: ['funny'],
    reactions: { lemon: 12, sweet: 45, funny: 678, pray: 5 },
    createdAt: '2026-03-09T17:20:00Z',
    isPublic: true,
    template: 'line',
    userId: 'user_003',
    userName: '森田家の隣人',
  },
  {
    id: 4,
    memberId: '井上和',
    memberName: '井上和',
    groupId: 'nogizaka',
    groupName: '乃木坂46',
    memberImageUrl: getMemberById('井上和')?.imageUrl || '',
    eventDate: '2026/3/22',
    eventType: 'ミーグリ',
    slotNumber: 1,
    ticketCount: 3,
    nickname: 'なぎちゃん命',
    messages: [
      { id: '1', speaker: 'me', text: 'なぎさーん！卒業しないで！' },
      { id: '2', speaker: 'member', text: '急にどうしたの？(笑)' },
      { id: '3', speaker: 'me', text: 'いつかいなくなるかと思うと…' },
      { id: '4', speaker: 'member', text: '大丈夫だよ、今ここにいるから。ね？' },
      { id: '5', speaker: 'me', text: '(泣く)' },
      { id: '6', speaker: 'member', text: '泣かないで〜(手を振りながら笑顔)' },
    ],
    tags: ['touching'],
    reactions: { lemon: 34, sweet: 89, funny: 5, pray: 567 },
    createdAt: '2026-03-22T16:45:00Z',
    isPublic: true,
    template: 'oshi-color',
    userId: 'user_004',
    userName: '和推し',
  },
  {
    id: 5,
    memberId: '小坂菜緒',
    memberName: '小坂菜緒',
    groupId: 'hinatazaka',
    groupName: '日向坂46',
    memberImageUrl: getMemberById('小坂菜緒')?.imageUrl || '',
    eventDate: '2026/3/1',
    eventType: 'ミーグリ',
    slotNumber: 2,
    ticketCount: 1,
    nickname: 'なおぼう',
    messages: [
      { id: '1', speaker: 'me', text: 'なおちゃん…緊張してます' },
      { id: '2', speaker: 'member', text: '…' },
      { id: '3', speaker: 'me', text: 'あの、好きです' },
      { id: '4', speaker: 'member', text: '…ありがとう(小声)' },
    ],
    tags: ['salty'],
    reactions: { lemon: 8, sweet: 12, funny: 345, pray: 23 },
    createdAt: '2026-03-01T15:00:00Z',
    isPublic: true,
    template: 'meguri',
    userId: 'user_005',
    userName: '塩対応コレクター',
  },
  {
    id: 6,
    memberId: '山﨑天',
    memberName: '山﨑天',
    groupId: 'sakurazaka',
    groupName: '櫻坂46',
    memberImageUrl: getMemberById('山﨑天')?.imageUrl || '',
    eventDate: '2026/3/16',
    eventType: 'ミーグリ',
    slotNumber: 1,
    ticketCount: 5,
    nickname: 'てんちゃん推し10年目',
    messages: [
      { id: '1', speaker: 'me', text: '天ちゃん、新曲のダンス最高だった！' },
      { id: '2', speaker: 'member', text: '見てくれたの？嬉しい！' },
      { id: '3', speaker: 'me', text: 'サビの振り付け真似してみたけど全然できない' },
      { id: '4', speaker: 'member', text: '練習すればできるよ！こうやって…(手の動きを見せる)' },
      { id: '5', speaker: 'me', text: 'レッスンありがとうございます先生！' },
      { id: '6', speaker: 'member', text: '先生じゃないよ〜(照)' },
    ],
    tags: ['godly', 'fishing'],
    reactions: { lemon: 189, sweet: 267, funny: 56, pray: 78 },
    createdAt: '2026-03-16T18:00:00Z',
    isPublic: true,
    template: 'meguri',
    userId: 'user_006',
    userName: '天ちゃん先生',
  },
];
