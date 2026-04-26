import test from 'node:test';
import assert from 'node:assert/strict';

import { parseEventDetailHtml } from './fortune-music.ts';

test('parseEventDetailHtml extracts dates slots and members from Fortune Music detail page', () => {
  const html = `
    <section>
      <h2>イベント概要</h2>
      <p>【日程】2026年5月31日（日）、2026年6月7日（日）、2026年7月5日（日）</p>
      <p>【時間】
        第1部 受付 10:45 / 開始 11:00 / 受付締切 11:45 / 終了予定 12:00<br>
        第2部 受付 12:15 / 開始 12:30 / 受付締切 13:15 / 終了予定 13:30<br>
        第3部 受付 13:45 / 開始 14:00 / 受付締切 14:45 / 終了予定 15:00
      </p>
      <p>【参加メンバー】小坂菜緒、正源司陽子、藤嶌果歩</p>
    </section>
    <section>
      <h2>受付スケジュール</h2>
      <p>第1次受付 2026年4月8日（水）14:00 ～ 2026年4月9日（木）14:00</p>
    </section>
  `;

  const detail = parseEventDetailHtml(html);

  assert.deepEqual(detail.dates, ['2026-05-31', '2026-06-07', '2026-07-05']);
  assert.equal(detail.slots.length, 3);
  assert.deepEqual(detail.slots[0], {
    slotNumber: 1,
    receptionStart: '10:45',
    startTime: '11:00',
    receptionEnd: '11:45',
    endTime: '12:00',
  });
  assert.deepEqual(detail.members, ['小坂菜緒', '正源司陽子', '藤嶌果歩']);
});
