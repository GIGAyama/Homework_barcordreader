import test from 'node:test';
import assert from 'node:assert/strict';
import { buildStudentReportInsights } from '../src/reportInsights.js';

test('report insights aggregate preparation, attendance and task facts for one student', () => {
  const insights = buildStudentReportInsights({
    studentId: '1',
    startDate: '2026-07-01',
    endDate: '2026-07-31',
    taskStats: [
      { required: 10, submitted: 9 },
      { required: 5, submitted: 4 },
    ],
    dailyCheckIns: [
      { studentId: '1', date: '2026-07-02' },
      { studentId: '1', date: '2026-07-02' },
      { studentId: '2', date: '2026-07-03' },
    ],
    forgottenItems: [
      { studentId: '1', date: '2026-07-03', itemName: '筆箱', subject: '算数' },
      { studentId: '1', date: '2026-07-04', itemName: '筆箱', subject: '国語' },
      { studentId: '1', date: '2026-06-30', itemName: '水筒', subject: '生活' },
    ],
    absences: [
      { studentId: '1', date: '2026-07-05', status: '遅刻' },
      { studentId: '1', date: '2026-07-06', status: '欠席' },
    ],
  });

  assert.equal(insights.totalRequired, 15);
  assert.equal(insights.totalSubmitted, 13);
  assert.equal(insights.overallRate, 87);
  assert.equal(insights.checkInDays, 1);
  assert.equal(insights.forgotten.total, 2);
  assert.deepEqual(insights.forgotten.topItems[0], { label: '筆箱', count: 2 });
  assert.equal(insights.attendance.total, 2);
});

test('family support data excludes internal observations while internal data retains them', () => {
  const insights = buildStudentReportInsights({
    studentId: '1',
    startDate: '2026-07-01',
    endDate: '2026-07-31',
    supportActions: [{
      id: 's1', studentId: '1', date: '2026-06-20', category: '学習準備',
      observation: '教員の内部観察メモ', action: '持ち物カードを使う', goal: '自分で確認する',
      status: '実施中', followUpDate: '2026-07-20', outcome: '', outcomeRating: null,
    }],
  });

  assert.equal(insights.familySupports.length, 1);
  assert.equal(insights.familySupports[0].action, '持ち物カードを使う');
  assert.equal(Object.hasOwn(insights.familySupports[0], 'observation'), false);
  assert.equal(Object.hasOwn(insights.familySupports[0], 'followUpDate'), false);
  assert.equal(insights.internalSupports[0].observation, '教員の内部観察メモ');
  assert.equal(insights.internalSupports[0].followUpDate, '2026-07-20');
});

test('completed support outside the period is omitted but an active support remains visible', () => {
  const insights = buildStudentReportInsights({
    studentId: '1', startDate: '2026-07-01', endDate: '2026-07-31',
    supportActions: [
      { id: 'old', studentId: '1', date: '2026-06-01', status: '完了', action: '旧支援', goal: '' },
      { id: 'active', studentId: '1', date: '2026-06-15', status: '実施中', action: '継続支援', goal: '' },
    ],
  });

  assert.deepEqual(insights.familySupports.map(item => item.id), ['active']);
});
