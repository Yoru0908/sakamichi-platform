import test from 'node:test';
import assert from 'node:assert/strict';

import { parseEventDetailHtml } from './fortune-music.ts';

test('parseEventDetailHtml extracts slots from the current Fortune Music time row format', () => {
  const html = `
    <section>
      <h2>イベント概要</h2>
      <p>【日程】2026年5月31日（日）、2026年6月7日（日）、2026年7月5日（日）、2026年8月8日（土）、2026年8月9日（日）</p>
      <p>【時間】<br>
        ＜第1部＞受付開始 10:45 / イベント開始 11:00 / 受付終了 11:45 （12時00分 終了予定）<br>
        ＜第2部＞受付開始 12:15 / イベント開始 12:30 / 受付終了 13:15 （13時30分 終了予定）<br>
        ＜第3部＞受付開始 13:45 / イベント開始 14:00 / 受付終了 14:45 （15時00分 終了予定）
      </p>
      <p>【参加メンバー】小坂 菜緒、正源司 陽子、藤嶌 果歩</p>
    </section>
  `;

  const detail = parseEventDetailHtml(html);

  assert.deepEqual(detail.dates, ['2026-05-31', '2026-06-07', '2026-07-05', '2026-08-08', '2026-08-09']);
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

test('parseEventDetailHtml extracts slots from schedule sections and keeps line-broken members separated', () => {
  const html = `
    <section>
      <h2>イベント概要</h2>
      <p>【日程】2026年3月20日（金・祝）、2026年3月22日（日）、2026年4月5日（日）</p>
      <p>【時間】開始時間/10：00　　終了時間/20：00</p>
      <p>【オンラインミート＆グリート（個別トーク会）スケジュール】<br>
        ＜第１部＞ 受付開始 9:45 / イベント開始 10：00 / 受付終了 11:15 （11時30分 終了予定）<br>
        ＜第２部＞ 受付開始 11:45 / イベント開始 12：00 / 受付終了 13:15 （13時30分 終了予定）<br>
        ＜第３部＞ 受付開始 14:15 / イベント開始 14：30 / 受付終了 15:45 （16時00分 終了予定）<br>
        ＜第４部＞ 受付開始 16:15 / イベント開始 16：30 / 受付終了 17:45 （18時00分 終了予定）<br>
        ＜第５部＞ 受付開始 18:15 / イベント開始 18：30 / 受付終了 19:45 （20時00分 終了予定）
      </p>
      <p>【参加メンバー】<br>
        伊藤理々杏<br>
        愛宕 心響<br>
        大越ひなの<br>
        ※奥田いろはですが、スケジュールの都合により3月22日(日)・4月5日(日)を不参加とさせていただきます。<br>
        参加メンバーは都合により変更となる場合がございますので予めご了承ください。
      </p>
    </section>
  `;

  const detail = parseEventDetailHtml(html);

  assert.deepEqual(detail.dates, ['2026-03-20', '2026-03-22', '2026-04-05']);
  assert.equal(detail.slots.length, 5);
  assert.deepEqual(detail.slots[0], {
    slotNumber: 1,
    receptionStart: '09:45',
    startTime: '10:00',
    receptionEnd: '11:15',
    endTime: '11:30',
  });
  assert.deepEqual(detail.members, ['伊藤理々杏', '愛宕心響', '大越ひなの']);
});

test('parseEventDetailHtml supports colon end times and slash-delimited member lines', () => {
  const html = `
    <section>
      <h2>イベント概要</h2>
      <p>【日程】2026年3月15日（日）、2026年3月29日（日）、2026年4月5日（日）</p>
      <p>【オンラインミート＆グリート（個別トーク会）スケジュール】<br>
        ＜第１部＞ 受付開始 10:45 / イベント開始 11:00 / 受付終了 11:45 （12:00 終了予定）<br>
        ＜第２部＞ 受付開始 12:15 / イベント開始 12:30 / 受付終了 13:15 （13:30 終了予定）<br>
        ＜第３部＞ 受付開始 14:15 / イベント開始 14:30 / 受付終了 15:15 （15:30 終了予定）
      </p>
      <p>【参加メンバー】<br>
        遠藤 光莉/<br>
        大園 玲/<br>
        山田 桃実
      </p>
    </section>
  `;

  const detail = parseEventDetailHtml(html);

  assert.deepEqual(detail.dates, ['2026-03-15', '2026-03-29', '2026-04-05']);
  assert.equal(detail.slots.length, 3);
  assert.deepEqual(detail.slots[0], {
    slotNumber: 1,
    receptionStart: '10:45',
    startTime: '11:00',
    receptionEnd: '11:45',
    endTime: '12:00',
  });
  assert.deepEqual(detail.members, ['遠藤光莉', '大園玲', '山田桃実']);
});

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
