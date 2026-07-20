import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildClassWeeklyPayload,
  buildFamilyMeetingPayload,
  buildHandoverPayload,
  buildSupportNotePayload,
  findDirectIdentifiers,
  redactSensitiveText,
  rehydrateAliases,
} from '../src/teacherAiPrivacy.js';

const db = {
  students: [{ id: '1', name: '山田 花子' }, { id: '2', name: '佐藤 太郎' }],
  tasks: [{ id: 't1', type: '毎日（平日）', value: '', name: '音読' }],
  logs: [{ id: 'l1', studentId: '1', studentName: '山田 花子', taskId: 't1', taskName: '音読', date: '2026-07-20' }],
  dailyCheckIns: [{ id: 'c1', studentId: '1', studentName: '山田 花子', date: '2026-07-20', feeling: 'げんき' }],
  absences: [],
  forgottenItems: [{ id: 'f1', studentId: '1', studentName: '山田 花子', date: '2026-07-20', itemName: '筆箱', subject: '算数', impact: '貸出で参加', note: '母の電話 090-1234-5678' }],
  supportActions: [{ id: 's1', studentId: '1', studentName: '山田 花子', date: '2026-07-20', category: '学習', observation: '内部だけの観察', action: '山田 花子さんと見本を確認', goal: '自分で1問始める', status: '実施中' }],
  familyContacts: [{ id: 'p1', studentId: '1', studentName: '山田 花子', date: '2026-07-20', topic: '学習', sharedFacts: '音読を確認', familyResponse: '家庭だけの事情', agreement: '一緒に確認', status: '完了' }],
  classActions: [],
};

test('sensitive text is pseudonymized and contact details are redacted', () => {
  const text = redactSensitiveText('山田 花子 090-1234-5678 hana@example.jp 123-4567', db.students, '1');
  assert.match(text, /対象児童/);
  assert.match(text, /\[電話番号\]/);
  assert.match(text, /\[メールアドレス\]/);
  assert.match(text, /\[郵便番号\]/);
  assert.doesNotMatch(text, /山田/);
});

test('class weekly payload contains aggregates and no direct student identifiers', () => {
  const { payload } = buildClassWeeklyPayload({ today: '2026-07-20', db });
  assert.equal(payload.classSize, 2);
  assert.equal(payload.forgottenItems.total, 1);
  assert.deepEqual(findDirectIdentifiers(payload, db.students), []);
  assert.doesNotMatch(JSON.stringify(payload), /studentId|studentName|山田|佐藤/);
});

test('family draft payload excludes private responses and raw observations', () => {
  const { payload, reverseAliases } = buildFamilyMeetingPayload({ studentId: '1', startDate: '2026-07-01', endDate: '2026-07-31', db });
  const serialized = JSON.stringify(payload);
  assert.doesNotMatch(serialized, /家庭だけの事情|内部だけの観察|山田 花子/);
  assert.match(serialized, /一緒に確認/);
  assert.equal(rehydrateAliases('対象児童について', reverseAliases), '山田 花子について');
  assert.deepEqual(findDirectIdentifiers(payload, db.students), []);
});

test('handover and support-note builders keep names outside the outbound payload', () => {
  const handover = buildHandoverPayload({ today: '2026-07-20', db });
  assert.deepEqual(findDirectIdentifiers(handover.payload, db.students), []);
  assert.match(JSON.stringify(handover.payload), /児童/);

  const support = buildSupportNotePayload({ note: '山田 花子さんの連絡先は090-1234-5678。算数で最初の問題に手が止まった。', students: db.students });
  assert.deepEqual(findDirectIdentifiers(support.payload, db.students), []);
  assert.match(support.payload.observationMemo, /児童A|\[電話番号\]/);
});
