import source from '../../../public/data/member-images.json' with { type: 'json' };

import type { Group } from './contract.ts';
export type { Group } from './contract.ts';
export { GROUP_NAMES } from './contract.ts';
export type Member = { name: string; group: Group; generation: string; aliases: string[] };
export const normalizeName = (value: string) => value.normalize('NFKC').replace(/\s/g, '').replaceAll('﨑', '崎').replaceAll('髙', '高');

// These three 新四期生 entries are incorrectly labelled 五期生 in the avatar index.
// Override analysis metadata only; do not rewrite the shared avatar source.
const GENERATION_OVERRIDES: Record<string, string> = { '林瑠奈': '四期生', '松尾美佑': '四期生', '佐藤璃果': '四期生' };

const byName = new Map<string, Member>();
for (const [displayName, info] of Object.entries(source.images)) {
  const name = displayName.replace(/\s/g, '');
  const key = normalizeName(name);
  const group: Group = info.group.includes('乃木坂') ? 'nogizaka' : info.group.includes('日向坂') ? 'hinatazaka' : 'sakurazaka';
  const member = byName.get(key) || { name, group, generation: GENERATION_OVERRIDES[name] || info.generation || '期别未知', aliases: [] };
  // Only explicit whitespace-separated names supply surname/given-name aliases.
  // Never guess the split of an unsegmented Japanese name.
  for (const part of displayName.trim().split(/\s+/)) {
    if (normalizeName(part) !== key && [...part].length >= 2 && !member.aliases.includes(part)) member.aliases.push(part);
  }
  byName.set(key, member);
}

// Single-key archive entries have no spaced duplicate in the avatar index.
for (const displayName of ['井上 梨名', '河田 陽菜', '松田 好花', '小津 玲奈']) {
  const member = byName.get(normalizeName(displayName));
  if (member) member.aliases = [...new Set([...member.aliases, ...displayName.split(' ')])];
}

// Historical members remain valid referents. They must also block ambiguous
// aliases (e.g. 美月, さくら, 松田) even when they no longer publish blogs.
const historical: [Group, string, string][] = [
  ['nogizaka', '三期生', '山下 美月'], ['nogizaka', '三期生', '与田 祐希'],
  ['nogizaka', '一期生', '齋藤 飛鳥'], ['nogizaka', '一期生', '白石 麻衣'], ['nogizaka', '一期生', '西野 七瀬'],
  ['hinatazaka', '一期生', '加藤 史帆'], ['hinatazaka', '一期生', '齊藤 京子'], ['hinatazaka', '一期生', '佐々木 美玲'],
  ['hinatazaka', '一期生', '佐々木 久美'], ['hinatazaka', '一期生', '高本 彩花'], ['hinatazaka', '一期生', '東村 芽依'],
  ['hinatazaka', '一期生', '高瀬 愛奈'], ['hinatazaka', '一期生', '潮 紗理菜'], ['hinatazaka', '一期生', '影山 優佳'],
  ['hinatazaka', '二期生', '丹生 明里'], ['hinatazaka', '二期生', '渡邉 美穂'], ['hinatazaka', '二期生', '宮田 愛萌'], ['hinatazaka', '二期生', '濱岸 ひより'],
  ['sakurazaka', '一期生', '菅井 友香'], ['sakurazaka', '一期生', '渡邉 理佐'], ['sakurazaka', '一期生', '渡辺 梨加'],
  ['sakurazaka', '一期生', '土生 瑞穂'], ['sakurazaka', '一期生', '小林 由依'], ['sakurazaka', '一期生', '齋藤 冬優花'],
  ['sakurazaka', '一期生', '上村 莉菜'], ['sakurazaka', '一期生', '原田 葵'], ['sakurazaka', '二期生', '関 有美子'],
];
for (const [group, generation, displayName] of historical) {
  const name = displayName.replace(/\s/g, '');
  if (!byName.has(normalizeName(name))) byName.set(normalizeName(name), { name, group, generation, aliases: displayName.split(' ').filter((part) => part.length >= 2) });
}
export const MEMBERS = [...byName.values()];
