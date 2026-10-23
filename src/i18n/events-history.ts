import type { Language } from '@/stores/language';
export const eventsHistoryMessages = {
  zh: {
    history: '我的活动履历', ranking: '参与排名', events: '活动一览', description: '记录计划、参与经历与属于自己的感想。',
    login: '登录后查看自己的活动记录。', signIn: '登录', loading: '读取中…', retry: '重试', loadError: '暂时无法读取，请重试。',
    empty: '还没有活动记录。可从活动一览添加计划或参与记录。', planned: '计划参加', attended: '已参与',
    attendedDays: '参与日期', plannedDays: '计划日期', recordedCosts: '已记录费用', costCoverage: '{n} 条记录填写了费用；空白费用不按 0 计算。',
    dayDefinition: '日期按日本时间计算，同一天跨团、跨活动只计一天；未来计划不计入已参与。',
    snapshot: '活动标题和日期为保存时的快照。来源更新或暂时不可用，不会删除你的履历。', more: '加载更多记录', detail: '查看活动',
    memo: '感想与费用', note: '感想 / 私人备注', noteHint: '最多 4000 字，仅自己可见。', costHint: '日元整数；留空表示未记录，填写 0 表示已确认没有费用。',
    ticket: '门票', travel: '交通', stay: '住宿', goods: '周边', other: '其他', save: '保存', saving: '保存中…', saved: '已保存并确认',
    saveError: '保存失败，输入内容已保留。请重试。', verifyError: '尚未确认保存结果，输入内容已保留。请重试或稍后重新读取。', invalid: '请检查备注长度和费用：每项为 0–9,999,999 日元整数。',
    conflict: '已保存的记录版本发生变化，本次没有覆盖它。你的输入已保留；请先复制草稿，再重新加载页面，对照最新内容后合并保存。',
    markFirst: '先记录该日参与或计划，即可编辑感想和费用。', retention: '取消参与记录会保留私有感想和费用；重新添加同一天时恢复。',
    remove: '取消记录', removeConfirm: '取消这一天的记录？私有感想和费用会保留，重新添加时恢复。',
    publicName: '公开显示名', publicLabel: '加入公开排名', publicHint: '默认不公开。开启后仅公开你填写的显示名、已参与日期数和活动记录数；感想、费用和账号信息始终不公开。',
    profileSave: '保存公开设置', private: '尚未加入公开排名', public: '已加入公开排名', rankingEmpty: '暂时没有选择公开且拥有已参与记录的用户。',
    rank: '名次', name: '显示名', days: '日期数', count: '活动记录数', rankingRule: '按日本时间截至今日的去重参与日期排名，未来计划不计。同日期数并列。仅包括主动选择公开的 46log 用户。',
    nameInvalid: '公开时请填写 1–40 字显示名。', noCosts: '未记录费用',
  },
  ja: {
    history: '自分の参加履歴', ranking: '参加ランキング', events: 'イベント一覧', description: '参加予定、思い出、自分だけの感想を残せます。',
    login: 'ログインして自分の記録を確認できます。', signIn: 'ログイン', loading: '読み込み中…', retry: '再試行', loadError: '読み込めませんでした。再試行してください。',
    empty: '参加記録はまだありません。イベント一覧から予定や参加した日を追加できます。', planned: '行く予定', attended: '参加した',
    attendedDays: '参加日数', plannedDays: '予定日数', recordedCosts: '記録済み費用', costCoverage: '{n} 件に費用を記録しています。空欄は 0 円として扱いません。',
    dayDefinition: '日本時間の日付で集計。同じ日はグループ・イベントをまたいでも1日。未来の予定は参加済みに含みません。',
    snapshot: 'タイトルと日付は記録時の情報です。公式情報の更新や一時的な取得失敗でも履歴は残ります。', more: 'さらに読み込む', detail: 'イベントを開く',
    memo: '感想と費用', note: '感想・自分用メモ', noteHint: '4000文字まで。自分にだけ表示されます。', costHint: '日本円の整数。空欄は未記録、0 は費用なしの記録です。',
    ticket: 'チケット', travel: '交通', stay: '宿泊', goods: 'グッズ', other: 'その他', save: '保存', saving: '保存中…', saved: '保存を確認しました',
    saveError: '保存できませんでした。入力は残っています。再試行してください。', verifyError: '保存結果を確認できませんでした。入力を残しています。再試行するか、後ほど読み直してください。', invalid: 'メモの長さと費用を確認してください。各項目は 0〜9,999,999 円の整数です。',
    conflict: '保存済みの記録が更新されています。今回の入力では上書きしていません。入力は残っています。下書きをコピーしてからページを読み直し、最新の内容を確認して変更をまとめてください。',
    markFirst: 'この日の予定・参加を記録すると感想と費用を編集できます。', retention: '参加記録を取り消しても自分用メモと費用は残ります。同じ日を追加すると復元します。',
    remove: '記録を取り消す', removeConfirm: 'この日の記録を取り消しますか？感想と費用は残り、再追加時に復元します。',
    publicName: '公開する表示名', publicLabel: '公開ランキングに参加する', publicHint: '初期設定は非公開です。公開するのは入力した表示名・参加日数・記録件数のみ。感想・費用・アカウント情報は公開しません。',
    profileSave: '公開設定を保存', private: 'ランキング非公開', public: 'ランキング公開中', rankingEmpty: '公開を選んだ参加記録のあるユーザーはまだいません。',
    rank: '順位', name: '表示名', days: '参加日数', count: '記録件数', rankingRule: '日本時間の今日までの参加日を重複なしで集計。未来の予定は含まず、同じ日数は同順位です。公開を選択した46logユーザーのみ掲載します。',
    nameInvalid: '公開する場合は1〜40文字の表示名を入力してください。', noCosts: '費用未記録',
  },
  en: {
    history: 'My event history', ranking: 'Attendance ranking', events: 'Events', description: 'Keep your plans, memories and private notes together.',
    login: 'Sign in to view your own event records.', signIn: 'Sign in', loading: 'Loading…', retry: 'Retry', loadError: 'Could not load this data. Please retry.',
    empty: 'No event records yet. Add plans or attendance from the event list.', planned: 'Planned', attended: 'Attended',
    attendedDays: 'Days attended', plannedDays: 'Planned days', recordedCosts: 'Recorded costs', costCoverage: 'Costs recorded for {n} records. Blank amounts are unknown, not zero.',
    dayDefinition: 'Dates use Japan time. A date counts once across all groups and events. Future plans are excluded from attendance.',
    snapshot: 'Titles and dates reflect the saved record. Source updates or temporary outages do not erase your history.', more: 'Load more records', detail: 'Open event',
    memo: 'Notes and costs', note: 'Private notes', noteHint: 'Up to 4,000 characters. Only you can see this.', costHint: 'Whole Japanese yen. Leave blank if unknown; enter 0 to record no cost.',
    ticket: 'Tickets', travel: 'Travel', stay: 'Accommodation', goods: 'Merchandise', other: 'Other', save: 'Save', saving: 'Saving…', saved: 'Saved and verified',
    saveError: 'Could not save. Your input is preserved; please retry.', verifyError: 'Could not verify the save. Your input is preserved. Retry or reload later.', invalid: 'Check the note length and costs. Each amount must be a whole number from 0 to 9,999,999 yen.',
    conflict: 'The saved record has changed. This attempt did not overwrite it. Your input is preserved. Copy your draft, reload the page, then review and merge it with the latest saved content.',
    markFirst: 'Mark this day as planned or attended to edit notes and costs.', retention: 'Removing attendance keeps private notes and costs. Adding the same day restores them.',
    remove: 'Remove record', removeConfirm: 'Remove this record? Private notes and costs will be retained and restored if you add it again.',
    publicName: 'Public display name', publicLabel: 'Join the public ranking', publicHint: 'Private by default. Only your chosen display name, attended days and record count are public. Notes, costs and account details stay private.',
    profileSave: 'Save visibility', private: 'Not in the public ranking', public: 'Visible in the public ranking', rankingEmpty: 'No users with attendance records have opted in yet.',
    rank: 'Rank', name: 'Display name', days: 'Days', count: 'Records', rankingRule: 'Distinct attended dates up to today in Japan time. Future plans are excluded; equal day counts tie. Only 46log users who opt in appear.',
    nameInvalid: 'Enter a public display name of 1–40 characters.', noCosts: 'No costs recorded',
  },
} as const;
export type EventHistoryText = keyof typeof eventsHistoryMessages.zh;
export function historyTranslator(lang: Language) {
  return (key: EventHistoryText, params: Record<string, string | number> = {}): string => {
    let value: string = eventsHistoryMessages[lang][key];
    for (const [name, replacement] of Object.entries(params)) value = value.replaceAll(`{${name}}`, String(replacement));
    return value;
  };
}
