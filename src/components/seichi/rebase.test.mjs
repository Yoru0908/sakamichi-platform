import test from 'node:test';
import assert from 'node:assert/strict';
import { rebaseKeys } from './route-share.ts';

test('my add and their add both survive', () => {
  assert.deepEqual(rebaseKeys(['a', 'b'], ['a', 'b', 'x'], ['a', 'b', 'y'], 12), ['a', 'b', 'y', 'x']);
});
test('my removal applies on top of their add', () => {
  assert.deepEqual(rebaseKeys(['a', 'b', 'c'], ['a', 'c'], ['a', 'b', 'c', 'y'], 12), ['a', 'c', 'y']);
});
test('reorder-only keeps my order and appends their new points', () => {
  assert.deepEqual(rebaseKeys(['a', 'b', 'c'], ['c', 'a', 'b'], ['a', 'b', 'c', 'y'], 12), ['c', 'a', 'b', 'y']);
});
test('a point both sides added is not duplicated; cap is respected', () => {
  assert.deepEqual(rebaseKeys(['a'], ['a', 'x'], ['a', 'x'], 12), ['a', 'x']);
  assert.equal(rebaseKeys([], ['a', 'b', 'c'], ['d', 'e'], 4).length, 4);
});
