import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DATA_SCHEMA_VERSION,
  buildBackupData,
  createClassImprovementAction,
  createFamilyContact,
  createSupportAction,
  migrateData,
  recordClassImprovementOutcome,
  recordFamilyContactFollowUp,
  recordSupportOutcome,
  submissionMatchesTask,
  upsertDailyCheckIn,
} from '../src/dataModel.js';

test('legacy feelings are deduplicated into one daily check-in', () => {
  const migrated = migrateData({
    students: [{ id: '1', name: '山田 花子' }],
    tasks: [{ id: 'task-1', name: '音読' }, { id: 'task-2', name: '計算' }],
    logs: [
      { id: 'a', date: '2026-07-20', studentId: '1', studentName: '山田 花子', taskName: '音読', feeling: 'げんき', timestamp: 10 },
      { id: 'b', date: '2026-07-20', studentId: '1', studentName: '山田 花子', taskName: '計算', feeling: 'げんき', timestamp: 11 },
    ],
    config: { pin: 'admin' },
  });

  assert.equal(migrated.schemaVersion, DATA_SCHEMA_VERSION);
  assert.equal(migrated.dailyCheckIns.length, 1);
  assert.equal(migrated.dailyCheckIns[0].feeling, 'げんき');
  assert.equal(migrated.logs.length, 2);
  assert.ok(migrated.logs.every(log => !Object.hasOwn(log, 'feeling')));
  assert.equal(migrated.logs[0].taskId, 'task-1');
  assert.deepEqual(migrated.classActions, []);
  assert.deepEqual(migrated.familyContacts, []);
  assert.deepEqual(migrated.aiActivity, []);
});

test('existing daily check-in takes precedence over legacy log data', () => {
  const migrated = migrateData({
    students: [],
    tasks: [],
    logs: [{ date: '2026-07-20', studentId: '1', feeling: 'かなしい', timestamp: 10 }],
    dailyCheckIns: [{ id: 'current', date: '2026-07-20', studentId: '1', feeling: 'げんき', timestamp: 20 }],
    config: { pin: 'admin' },
  });

  assert.equal(migrated.dailyCheckIns.length, 1);
  assert.equal(migrated.dailyCheckIns[0].id, 'current');
  assert.equal(migrated.dailyCheckIns[0].feeling, 'げんき');
});

test('daily check-in upsert keeps one record per student and date', () => {
  const first = [{ id: 'keep-me', studentId: '1', date: '2026-07-20', feeling: 'ねむい' }];
  const result = upsertDailyCheckIn(first, { id: 'new-id', studentId: '1', date: '2026-07-20', feeling: 'げんき' });

  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'keep-me');
  assert.equal(result[0].feeling, 'げんき');
});

test('submission matching prefers stable task ids while supporting legacy names', () => {
  const task = { id: 'task-1', name: '音読' };
  assert.equal(submissionMatchesTask({ taskId: 'task-1', taskName: '旧名称' }, task), true);
  assert.equal(submissionMatchesTask({ taskName: '音読' }, task), true);
  assert.equal(submissionMatchesTask({ taskId: 'task-2', taskName: '音読' }, task), false);
});

test('backup includes every versioned event collection', () => {
  const backup = buildBackupData({
    students: [], tasks: [], logs: [], config: { pin: 'x' }, absences: [],
    dailyCheckIns: [{ id: 'c' }], forgottenItems: [{ id: 'f' }], supportActions: [{ id: 's' }], classActions: [{ id: 'a' }], familyContacts: [{ id: 'p' }], aiActivity: [{ id: 'ai', contentStored: false }],
  }, 123);

  assert.equal(backup.schemaVersion, DATA_SCHEMA_VERSION);
  assert.equal(backup.dailyCheckIns.length, 1);
  assert.equal(backup.forgottenItems.length, 1);
  assert.equal(backup.supportActions.length, 1);
  assert.equal(backup.classActions.length, 1);
  assert.equal(backup.familyContacts.length, 1);
  assert.equal(backup.aiActivity.length, 1);
  assert.equal(backup.syncMeta.updatedAt, 123);
});

test('AI audit backup keeps metadata but strips prompts, generated text and connection secrets', () => {
  const backup = buildBackupData({
    students: [], tasks: [], logs: [], config: { pin: 'x' },
    aiActivity: [{ id: 'ai', task: 'class_weekly_summary', status: 'generated', model: 'gemini', sourceRecordCount: 4, createdAt: 100, prompt: 'private input', draft: 'private output' }],
    aiProxyUrl: 'https://secret.example',
    aiGatewayToken: 'secret-token',
  });
  const serialized = JSON.stringify(backup);
  assert.equal(backup.aiActivity[0].contentStored, false);
  assert.doesNotMatch(serialized, /private input|private output|secret-token|secret\.example/);
});

test('family contact separates shared facts, private response, agreement and follow-up', () => {
  const contact = createFamilyContact({
    student: { id: '1', name: '山田 花子' },
    date: '2026-07-20',
    channel: '電話',
    topic: '学習準備',
    sharedFacts: '直近2週間で忘れ物が3件あった',
    familyResponse: '家庭でも前日に確認している',
    agreement: '学校と家庭で同じチェック表を使う',
    followUpDate: '2026-08-03',
    staffName: '担任',
    timestamp: 100,
  });

  assert.equal(contact.status, '要フォロー');
  assert.equal(contact.privacyLevel, '校内限定');
  assert.equal(contact.sharedFacts, '直近2週間で忘れ物が3件あった');
  assert.equal(contact.familyResponse, '家庭でも前日に確認している');

  const reviewed = recordFamilyContactFollowUp([contact], contact.id, {
    followUpNote: '忘れ物が1件に減ったことを確認した',
    status: '完了',
    followUpDate: '2026-08-17',
  });
  assert.equal(reviewed[0].status, '完了');
  assert.equal(reviewed[0].followUpDate, '2026-08-03');
  assert.match(reviewed[0].followUpNote, /1件/);
});

test('class improvement action keeps evidence, measure and outcome as separate fields', () => {
  const action = createClassImprovementAction({
    sourceInsightId: 'forgotten-preparation',
    area: '学習準備',
    title: '持ち物案内を見直す',
    evidence: '直近14日で筆箱の忘れ物が5件',
    action: '前日の帰りの会で持ち物カードを確認する',
    measure: '次の14日間の筆箱の忘れ物件数',
    startDate: '2026-07-20',
    reviewDate: '2026-08-03',
    timestamp: 100,
  });

  assert.equal(action.status, '実施中');
  assert.equal(action.measure, '次の14日間の筆箱の忘れ物件数');
  const reviewed = recordClassImprovementOutcome([action], action.id, {
    result: '5件から2件になった',
    outcomeRating: '改善',
    status: '完了',
  });
  assert.equal(reviewed[0].status, '完了');
  assert.equal(reviewed[0].outcomeRating, '改善');
  assert.match(reviewed[0].result, /2件/);
});

test('support action records observation, action, goal and reviewed outcome separately', () => {
  const support = createSupportAction({
    student: { id: '1', name: '山田 花子' },
    date: '2026-07-20',
    category: '学習準備',
    observation: '算数の用具を3回忘れた',
    action: '帰りの会でチェックカードを使う',
    goal: '自分で翌日の用具を確認する',
    followUpDate: '2026-07-27',
    timestamp: 100,
  });

  assert.equal(support.status, '実施中');
  assert.equal(support.observation, '算数の用具を3回忘れた');
  const reviewed = recordSupportOutcome([support], support.id, {
    outcome: '1週間、忘れ物がなかった',
    outcomeRating: '改善',
    status: '完了',
  });
  assert.equal(reviewed[0].status, '完了');
  assert.equal(reviewed[0].outcomeRating, '改善');
  assert.match(reviewed[0].outcome, /忘れ物/);
});
