import test from 'node:test';
import assert from 'node:assert/strict';
import { requestTeacherAssistance, validateProxyUrl } from '../src/geminiClient.js';

test('proxy URL requires HTTPS except on local development hosts', () => {
  assert.equal(validateProxyUrl('https://example.run.app'), true);
  assert.equal(validateProxyUrl('http://localhost:8080'), true);
  assert.equal(validateProxyUrl('http://example.com'), false);
  assert.equal(validateProxyUrl('javascript:alert(1)'), false);
});

test('client sends only the task contract with bearer auth and validates output', async () => {
  let captured;
  const response = await requestTeacherAssistance({
    proxyUrl: 'https://example.run.app/',
    gatewayToken: 'x'.repeat(24),
    task: 'class_weekly_summary',
    payload: { classSize: 30 },
    fetchImpl: async (url, options) => {
      captured = { url, options };
      return new Response(JSON.stringify({ model: 'gemini-3.5-flash', requestId: 'r1', result: { title: '週次', draft: '下書き', evidence_used: [], cautions: [], suggested_next_steps: [] } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
  });
  assert.equal(captured.url, 'https://example.run.app/v1/teacher-assist');
  assert.equal(captured.options.headers.Authorization, `Bearer ${'x'.repeat(24)}`);
  assert.deepEqual(JSON.parse(captured.options.body), { task: 'class_weekly_summary', payload: { classSize: 30 } });
  assert.equal(response.result.draft, '下書き');
});

test('client rejects malformed successful output', async () => {
  await assert.rejects(() => requestTeacherAssistance({
    proxyUrl: 'https://example.run.app',
    gatewayToken: 'x'.repeat(24),
    task: 'class_weekly_summary',
    payload: {},
    fetchImpl: async () => new Response(JSON.stringify({ result: { unexpected: true } }), { status: 200 }),
  }), /下書き/);
});
