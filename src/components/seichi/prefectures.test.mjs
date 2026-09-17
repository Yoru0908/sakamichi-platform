import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createPrefectureResolver, getFeaturePrefecture, PREFECTURES, UNCLASSIFIED } from './prefectures.ts';
const publicRoot = new URL('../../../public/seichi/', import.meta.url);
const boundaries = JSON.parse(readFileSync(new URL('boundaries/japan-prefectures.geojson', publicRoot), 'utf8'));
const resolve = createPrefectureResolver(boundaries);
const feature = (coordinates, properties = {}) => ({ geometry: { coordinates }, properties });

test('47 prefectures and known reference coordinates', () => {
 assert.equal(boundaries.features.length, 47);
 assert.equal(new Set(boundaries.features.map(f => f.properties.shapeISO)).size, 47);
 for (const [point, name] of [
   [[139.7671,35.6812],'東京都'], [[135.759,35.0116],'京都府'], [[135.5023,34.6937],'大阪府'],
   [[141.3545,43.0618],'北海道'], [[127.6811,26.2124],'沖縄県'], [[140.8719,38.2682],'宮城県'],
 ]) assert.equal(resolve(point), name);
 assert.equal(resolve([2.35,48.86]), undefined);
 assert.equal(resolve([126.978,37.5665]), undefined);
 assert.equal(getFeaturePrefecture(feature([126.978,37.5665]), resolve), UNCLASSIFIED);
});
test('address fallback does not confuse Tokyo Fuchu with Kyoto or infer a county from venue names', () => {
 assert.equal(getFeaturePrefecture(feature([0,0], { address:'東京都府中市宮町' })), '東京都');
 assert.equal(getFeaturePrefecture(feature([0,0], { sceneNote:'説明: 撮影 住所: 〒226-0016 神奈川県横浜市緑区' })), '神奈川県');
 assert.equal(getFeaturePrefecture(feature([0,0], { address:'', sceneNote:'東京と京都へ旅行' })), UNCLASSIFIED);
 assert.equal(getFeaturePrefecture(feature([0,0], { prefecture:'not-a-prefecture' })), UNCLASSIFIED);
});
test('polygon holes and islands are handled, not just rectangular prefecture boxes', () => {
 const custom = createPrefectureResolver({ type:'FeatureCollection',features:[{properties:{shapeISO:'JP-13'},geometry:{type:'MultiPolygon',coordinates:[[[[0,0],[10,0],[10,10],[0,10],[0,0]],[[4,4],[6,4],[6,6],[4,6],[4,4]]],[[[20,20],[21,20],[21,21],[20,21],[20,20]]]]}}]});
 assert.equal(custom([2,2]),'東京都'); assert.equal(custom([5,5]),undefined); assert.equal(custom([20.5,20.5]),'東京都');
});
test('20 supplemental public venues have distinct IDs, valid county, normal categories and no public source links', () => {
 const { features } = JSON.parse(readFileSync(new URL('sakumap-supplement.geojson', publicRoot), 'utf8'));
 assert.equal(features.length,20);
 assert.equal(new Set(features.map(f => f.properties.id)).size,20);
 for (const f of features) {
   assert(PREFECTURES.includes(f.properties.prefecture));
   assert.equal(resolve(f.geometry.coordinates), f.properties.prefecture, f.properties.name);
   assert(['Vlog・企画', '番組・イベント', 'Blog・MSG'].includes(f.properties.category));
   assert.equal(f.properties.sourceUrl, '');
   assert.equal(f.properties.sourceLabel, '');
   assert.equal(f.properties.referenceUrl, '');
   assert.equal(f.properties.source, undefined);
   assert.deepEqual(f.properties.images, []);
 }
});
