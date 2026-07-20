import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudentTimeline, buildSupportSignals, summarizeStudent } from '../src/studentInsights.js';

const students = [{ id: '1', name: '山田 花子' }, { id: '2', name: '鈴木 太郎' }];

test('support signals surface factual patterns and due follow-ups without ranking students', () => {
  const signals = buildSupportSignals({
    students,
    today: '2026-07-20',
    forgottenItems: [
      { id: 'f1', studentId: '1', date: '2026-07-10' },
      { id: 'f2', studentId: '1', date: '2026-07-15' },
      { id: 'f3', studentId: '1', date: '2026-07-18' },
    ],
    dailyCheckIns: [
      { id: 'c1', studentId: '2', date: '2026-07-15', feeling: 'かなしい', timestamp: 1 },
      { id: 'c2', studentId: '2', date: '2026-07-16', feeling: 'イライラ', timestamp: 2 },
      { id: 'c3', studentId: '2', date: '2026-07-17', feeling: 'かなしい', timestamp: 3 },
    ],
    supportActions: [{ id: 's1', studentId: '1', category: '学習準備', status: '実施中', followUpDate: '2026-07-19' }],
  });

  assert.equal(signals.length, 3);
  assert.equal(signals[0].type, '振り返り');
  assert.ok(signals.some(signal => signal.studentId === '1' && signal.type === '準備'));
  assert.ok(signals.some(signal => signal.studentId === '2' && signal.type === 'きもち'));
  assert.ok(signals.every(signal => !Object.hasOwn(signal, 'score')));
});

test('student summary counts independent event collections', () => {
  const summary = summarizeStudent({
    studentId: '1', startDate: '2026-07-01', endDate: '2026-07-31',
    logs: [{ studentId: '1', date: '2026-07-02' }, { studentId: '1', date: '2026-06-30' }],
    dailyCheckIns: [{ studentId: '1', date: '2026-07-02', feeling: 'げんき' }],
    forgottenItems: [{ studentId: '1', date: '2026-07-03' }],
    absences: [{ studentId: '1', date: '2026-07-04', status: '遅刻' }],
    supportActions: [{ studentId: '1', status: '実施中' }, { studentId: '1', status: '完了' }],
  });

  assert.equal(summary.submissions, 1);
  assert.equal(summary.checkIns, 1);
  assert.equal(summary.forgottenItems, 1);
  assert.equal(summary.absenceOrLate, 1);
  assert.equal(summary.activeSupports, 1);
  assert.equal(summary.completedSupports, 1);
});

test('timeline groups same-day submissions and sorts all event types newest first', () => {
  const timeline = buildStudentTimeline({
    studentId: '1',
    tasks: [{ id: 't1', name: '音読' }, { id: 't2', name: '計算' }],
    logs: [
      { id: 'l1', studentId: '1', taskId: 't1', date: '2026-07-19', timestamp: 1 },
      { id: 'l2', studentId: '1', taskId: 't2', date: '2026-07-19', timestamp: 2 },
    ],
    forgottenItems: [{ id: 'f1', studentId: '1', itemName: '筆箱', subject: '算数', response: '貸し出し', impact: '影響なし', date: '2026-07-20', timestamp: 3 }],
  });

  assert.equal(timeline.length, 2);
  assert.equal(timeline[0].kind, 'forgotten-item');
  assert.equal(timeline[1].title, '提出 2件');
  assert.match(timeline[1].detail, /音読/);
  assert.match(timeline[1].detail, /計算/);
});
