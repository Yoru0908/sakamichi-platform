// /miguri copy (2026-10-26): every table has the same keys in zh / ja / en, Japanese uses Japanese forms, and English has
// no Chinese or Japanese left except proper nouns and official labels quoted on purpose (member names, groups, 円, …).
import test from 'node:test';
import assert from 'node:assert/strict';
import { miguriMessages } from '../../i18n/miguri.ts';
import { manageMessages } from '../../i18n/miguri-manage.ts';
import { calendarMessages } from '../../i18n/miguri-calendar.ts';
import { soldOutMessages } from '../../i18n/miguri-soldout.ts';
import { extra } from '../../i18n/extra.ts';

const pick = (table) => Object.fromEntries(Object.entries(table).filter(([key]) => key.startsWith('miguri.')));
const TABLES = {
  miguri: miguriMessages, manage: manageMessages, calendar: calendarMessages, soldOut: soldOutMessages,
  pages: { zh: pick(extra.zh), ja: pick(extra.ja), en: pick(extra.en) },
};
const SIMPLIFIED_ONLY = /[张签选应员类录图击额单这们为发设计总览时户载销组价划没给从启开关闭显检历轮团该择并转换导续剩态]/;
const ALLOWED_IN_EN = ['山川 宇衣', '【6/27 第2部】', '【6/14 第5部】', '櫻坂46', '乃木坂46', '日向坂46', '円', '個', 'お申込み内容', '販売価格'];
const CJK = /[぀-ヿ㐀-鿿＀-￯]/;

for (const [name, { zh, ja, en }] of Object.entries(TABLES)) {
  test(`${name}: zh, ja and en have the same keys`, () => {
    assert.deepEqual(Object.keys(ja).sort(), Object.keys(zh).sort());
    assert.deepEqual(Object.keys(en).sort(), Object.keys(zh).sort());
  });
  test(`${name}: ja has no simplified-only characters`, () => {
    for (const [key, value] of Object.entries(ja)) assert.doesNotMatch(value, SIMPLIFIED_ONLY, `${key}: ${value}`);
  });
  test(`${name}: en has no CJK beyond proper nouns`, () => {
    for (const [key, value] of Object.entries(en)) {
      const rest = ALLOWED_IN_EN.reduce((text, allowed) => text.replaceAll(allowed, ''), value);
      assert.doesNotMatch(rest, CJK, `${key}: ${value}`);
    }
  });
  test(`${name}: placeholders match across languages`, () => {
    const names = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    for (const key of Object.keys(zh)) {
      assert.equal(names(ja[key]), names(zh[key]), `ja ${key}`);
      assert.equal(names(en[key]), names(zh[key]), `en ${key}`);
    }
  });
}
