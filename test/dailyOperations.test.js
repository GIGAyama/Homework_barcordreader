import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDailyOperations, buildHandoverBrief } from '../src/dailyOperations.js';

const students = [{ id: '1', name: '山田 花子' }, { id: '2', name: '鈴木 太郎' }, { id: '3', name: '佐藤 次郎' }];

test('daily operations combine morning, submission and follow-up work without treating absence as unknown', () => {
  const operations = buildDailyOperations({
    today: '2026-07-20',
    students,
    tasks: [
      { id: 'daily', name: '音読', type: '毎日（平日）', excludeDates: [] },
      { id: 'weekly', name: '自主学習', type: '週回数', value: '2', excludeDates: [] },
    ],
    logs: [
      { studentId: '1', taskId: 'daily', date: '2026-07-20' },
      { studentId: '1', taskId: 'weekly', date: '2026-07-20' },
      { studentId: '1', taskId: 'weekly', date: '2026-07-19' },
    ],
    dailyCheckIns: [{ studentId: '1', studentName: '山田 花子', date: '2026-07-20', feeling: 'かなしい', timestamp: 1 }],
    absences: [{ studentId: '2', studentName: '鈴木 太郎', date: '2026-07-20', status: '欠席' }],
    forgottenItems: [{ studentId: '1', studentName: '山田 花子', date: '2026-07-20' }],
    supportActions: [{ studentId: '1', studentName: '山田 花子', status: '実施中', followUpDate: '2026-07-20' }],
    familyContacts: [{ studentId: '3', studentName: '佐藤 次郎', status: '要フォロー', followUpDate: '2026-07-19', familyResponse: 'ブリーフへ出してはいけない情報' }],
  });

  assert.deepEqual(operations.unknownStudents.map(item => item.id), ['3']);
  assert.equal(operations.summary.morningConfirmed, 2);
  assert.equal(operations.summary.challenging, 1);
  assert.ok(operations.actions.some(item => item.id === 'support-followups'));
  assert.ok(operations.actions.some(item => item.id === 'family-followups'));
  assert.equal(operations.taskGaps.find(item => item.taskId === 'weekly').remaining, 3);

  const brief = buildHandoverBrief({ today: '2026-07-20', operations });
  assert.match(brief, /佐藤 次郎/);
  assert.equal(brief.includes('ブリーフへ出してはいけない情報'), false);
});

test('daily operations use the latest check-in and return a positive state when no action is due', () => {
  const operations = buildDailyOperations({
    today: '2026-07-20',
    students: [{ id: '1', name: '山田 花子' }],
    dailyCheckIns: [
      { studentId: '1', date: '2026-07-20', feeling: 'かなしい', timestamp: 1 },
      { studentId: '1', date: '2026-07-20', feeling: 'げんき', timestamp: 2 },
    ],
  });

  assert.equal(operations.challengingStudents.length, 0);
  assert.deepEqual(operations.actions.map(item => item.id), ['all-clear']);
});
