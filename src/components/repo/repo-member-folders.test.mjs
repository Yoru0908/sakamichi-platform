import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRepoMemberFolders } from './repo-member-folders.ts';

const members = ['山川宇衣', '山下瞳月', '森田ひかる'].map(name => ({ id: name, name, group: 'sakurazaka', groupName: '櫻坂46', imageUrl: `https://example.com/${name}.jpg` }));
const build = (options = {}) => buildRepoMemberFolders({ repos: [], members, oshiMember: null, favorites: [], ...options });
const draft = name => ({ id: 'draft', memberId: name, memberName: name, groupId: 'sakurazaka', memberImageUrl: '', data: { messages: [{ text: 'kept' }] } });

test('preferences create folders without saving any draft, oshi takes precedence', () => {
 const folders = build({ oshiMember: '山川 宇衣', favorites: [{ name: '山川宇衣' }, { name: '山下　瞳月' }, { name: '山下瞳月' }] });
 assert.deepEqual(folders.map(f => [f.memberId, f.category, f.repos.length, f.canCreate]), [['山川宇衣', 'oshi', 0, true], ['山下瞳月', 'favorite', 0, true]]);
});
test('drafts merge into seeded folders; unrelated drafts survive unchanged', () => {
 const saved = [draft('山川宇衣'), draft('森田ひかる')];
 const snapshot = JSON.stringify(saved);
 const folders = build({ repos: saved, oshiMember: '山川宇衣', favorites: [{ name: '山下瞳月' }] });
 assert.equal(folders.length, 3);
 assert.equal(folders[0].repos[0], saved[0]);
 assert.equal(folders[2].category, 'custom');
 assert.equal(folders[2].repos[0], saved[1]);
 assert.equal(JSON.stringify(saved), snapshot);
});
test('changing preference categories reclassifies folders without losing drafts', () => {
 const saved = [draft('山川宇衣')];
 const folders = build({ repos: saved, oshiMember: '山下瞳月', favorites: [{ name: '山川宇衣' }] });
 assert.equal(folders[0].category, 'oshi');
 assert.equal(folders[1].category, 'favorite');
 assert.equal(folders[1].repos[0], saved[0]);
 assert.deepEqual(build().map(f => f.memberId), []);
});
test('unavailable preferences remain visible without allowing an invalid new repo', () => {
 const folders = build({ oshiMember: '卒業メンバー', favorites: [{ name: ' ' }] });
 assert.equal(folders.length, 1);
 assert.equal(folders[0].memberName, '卒業メンバー');
 assert.equal(folders[0].canCreate, false);
});
