import test from 'node:test';
import assert from 'node:assert/strict';
import { createPinCredential, upgradePlaintextPin, verifyPin } from '../src/pinSecurity.js';

test('PIN credentials are salted and never retain plaintext', async () => {
  const first = await createPinCredential('school123', { salt: '00112233445566778899aabbccddeeff', iterations: 1000, updatedAt: 1 });
  const second = await createPinCredential('school123', { salt: 'ffeeddccbbaa99887766554433221100', iterations: 1000, updatedAt: 1 });
  assert.notEqual(first.pinHash, 'school123');
  assert.notEqual(first.pinHash, second.pinHash);
  assert.equal(await verifyPin('school123', first), true);
  assert.equal(await verifyPin('wrong-pin', first), false);
});

test('legacy plaintext PIN is upgraded without changing other settings', async () => {
  const upgraded = await upgradePlaintextPin({ pin: 'admin', theme: 'red' });
  assert.equal(Object.hasOwn(upgraded, 'pin'), false);
  assert.equal(upgraded.theme, 'red');
  assert.equal(await verifyPin('admin', upgraded), true);
});
