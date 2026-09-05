import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSakumimiUrl, normalizeSakumimiEpisode, sakumimiCoverSources, buildSakumimiMembers, PAST_MEMBERS_GROUP } from './sakumimi-archive-data.ts';

const oldOrigin = 'https://alist.sakamichi-tools.cn';
const newOrigin = 'https://alist.46log.com';

test('migrates legacy cover and audio URLs, preserving their complete path and query', () => {
  const input = {
    ep: 570,
    cover_url: `${oldOrigin}/d/sakumimi/radio_cover/EP570.jpg`,
    audio_url: `${oldOrigin}/d/sakumimi/radio_audio/%E6%A8%B1%E8%80%B3.mp3?x=1#t=10`,
    image: 'https://sakurazaka46.com/images/570.jpg',
    members: ['大園 玲', '大園玲', '山下　瞳月'],
  };
  const output = normalizeSakumimiEpisode(input);
  assert.equal(output.cover_url, `${newOrigin}/d/sakumimi/radio_cover/EP570.jpg`);
  assert.equal(output.audio_url, `${newOrigin}/d/sakumimi/radio_audio/%E6%A8%B1%E8%80%B3.mp3?x=1#t=10`);
  assert.equal(output.image, input.image);
  assert.equal(output.ep, 570);
  assert.deepEqual(output.members, ['大園玲', '山下瞳月']);
  assert.equal(input.members.length, 3, 'do not mutate source index');
});

test('only rewrites the exact retired host; handles HTTP, empty and malformed inputs', () => {
  assert.equal(normalizeSakumimiUrl('http://alist.sakamichi-tools.cn/d/a.jpg'), `${newOrigin}/d/a.jpg`);
  for (const url of ['', 'invalid', `${newOrigin}/d/a.jpg`, 'https://sakurazaka46.com/a.jpg', 'https://alist.sakamichi-tools.cn.example.com/a.jpg']) {
    assert.equal(normalizeSakumimiUrl(url), url);
  }
});

test('covers fall back to original HTTPS image without duplicates', () => {
  assert.deepEqual(sakumimiCoverSources({ cover_url: `${oldOrigin}/d/a.jpg`, image: 'http://i2.hdslb.com/a.jpg' }), [`${newOrigin}/d/a.jpg`, 'https://i2.hdslb.com/a.jpg']);
  assert.deepEqual(sakumimiCoverSources({ cover_url: `${oldOrigin}/d/a.jpg`, image: `${newOrigin}/d/a.jpg` }), [`${newOrigin}/d/a.jpg`]);
  assert.deepEqual(sakumimiCoverSources({ cover_url: '', image: '' }), []);
});

const images = {
  '森田 ひかる': { group: '樱坂46', generation: '二期生', isActive: true, imageUrl: 'https://example.com/morita.jpg' },
  '森田ひかる': { group: '樱坂46', generation: '二期生', isActive: true },
  '井上梨名': { group: '樱坂46', generation: '二期生', isActive: false, status: 'graduated', imageUrl: '' },
  '山川宇衣': { group: '櫻坂46', generation: '四期生', isActive: true, imageUrl: '' },
  '他団体の現役': { group: '日向坂46', isActive: true, imageUrl: 'https://example.com/other.jpg' },
  '他団体の卒業生': { group: '乃木坂46', isActive: false, status: 'graduated' },
};
const episodes = [
  { members: ['森田ひかる', '森田 ひかる', '菅井友香'] },
  { members: ['井上 梨名', '菅井友香'] },
];

test('archive tags add Sakura alumni missing from the active roster or without an avatar', () => {
  const list = buildSakumimiMembers(images, episodes);
  assert.deepEqual(new Set(list.map(m => m.name)), new Set(['森田ひかる', '山川宇衣', '井上梨名', '菅井友香']));
  assert.equal(list.find(m => m.name === '井上梨名').generation, PAST_MEMBERS_GROUP);
  assert.equal(list.find(m => m.name === '菅井友香').episodeCount, 2);
  assert.equal(list.find(m => m.name === '井上梨名').imageUrl, '');
  assert.equal(list.find(m => m.name === '森田ひかる').episodeCount, 1);
  assert.deepEqual(list.slice(0, 2).map(m => m.generation), ['二期生', '四期生']);
});

test('normalizing whitespace makes historical tags match filter buttons', () => {
  const normalized = episodes.map(e => normalizeSakumimiEpisode({ ...e, cover_url: '', image: '', audio_url: '' }));
  const list = buildSakumimiMembers(images, normalized);
  for (const member of list.filter(m => m.episodeCount > 0)) {
    assert.equal(normalized.filter(e => e.members.includes(member.name)).length, member.episodeCount);
  }
});
