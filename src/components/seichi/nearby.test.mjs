import assert from 'node:assert/strict';
import test from 'node:test';
import { distanceBetween, findNearby, formatDistance, isValidCoordinates, locationErrorMessage } from './nearby.ts';

const feature = (id, coordinates) => ({ id, geometry: { coordinates } });

test('great-circle distance uses GeoJSON longitude/latitude order, including dateline and antipodes', () => {
  const tokyo = [139.7671, 35.6812];
  assert.equal(distanceBetween(tokyo, tokyo), 0);
  assert(Math.abs(distanceBetween([0, 0], [0, 1]) - 111.195) < 0.01);
  assert(Math.abs(distanceBetween(tokyo, [135.4959, 34.7025]) - 403.32) < 1);
  assert(Math.abs(distanceBetween([179.9, 0], [-179.9, 0]) - 22.239) < 0.01);
  assert(Math.abs(distanceBetween([0, 0], [180, 0]) - Math.PI * 6371) < 0.001);
  assert.equal(isValidCoordinates([NaN, 30]), false);
  assert.equal(isValidCoordinates([180, 91]), false);
  assert.equal(distanceBetween([0, 0], [200, 0]), Infinity);
});

test('nearby is distance sorted, inclusive at the radius, stable at ties and does not mutate the filtered input', () => {
  const origin = [0, 0];
  const edge = feature('edge', [0.01, 0]);
  const near = feature('near', [0.001, 0]);
  const same = feature('same', [0.001, 0]);
  const far = feature('far', [1, 1]);
  const invalid = feature('invalid', [Infinity, 0]);
  const input = [far, edge, near, same, invalid];
  assert.deepEqual(findNearby(input, origin, distanceBetween(origin, edge.geometry.coordinates)).map(item => item.feature.id), ['near', 'same', 'edge']);
  assert.deepEqual(input.map(item => item.id), ['far', 'edge', 'near', 'same', 'invalid']);
  assert.deepEqual(findNearby([far], origin, 1), []);
  assert.deepEqual(findNearby(input, origin, -1), []);
  assert.deepEqual(findNearby(input, [NaN, 0], 5), []);
});

test('distance labels and geolocation failures give actionable, distinct feedback', () => {
  assert.equal(formatDistance(0.125), '125 m');
  assert.equal(formatDistance(1.234), '1.2 km');
  assert.equal(formatDistance(20), '20 km');
  assert.equal(formatDistance(Infinity), '—');
  assert.match(locationErrorMessage(1), /許可/);
  assert.match(locationErrorMessage(2), /端末の位置情報設定/);
  assert.match(locationErrorMessage(3), /タイムアウト/);
  assert.match(locationErrorMessage(), /対応したブラウザ/);
});
