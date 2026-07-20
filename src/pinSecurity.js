export const PIN_HASH_ITERATIONS = 120000;

const toHex = bytes => [...bytes].map(value => value.toString(16).padStart(2, '0')).join('');
const fromHex = value => new Uint8Array((value.match(/.{1,2}/g) || []).map(byte => Number.parseInt(byte, 16)));

const randomSalt = () => {
  const salt = new Uint8Array(16);
  globalThis.crypto.getRandomValues(salt);
  return toHex(salt);
};

const derivePinHash = async (pin, saltHex, iterations) => {
  if (!globalThis.crypto?.subtle) throw new Error('このブラウザでは安全なPIN保存を利用できません');
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await globalThis.crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt: fromHex(saltHex),
    iterations,
  }, key, 256);
  return toHex(new Uint8Array(bits));
};

const constantTimeEqual = (left, right) => {
  if (typeof left !== 'string' || typeof right !== 'string' || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
};

export const createPinCredential = async (pin, {
  salt = randomSalt(),
  iterations = PIN_HASH_ITERATIONS,
  updatedAt = Date.now(),
} = {}) => ({
  pinHash: await derivePinHash(pin, salt, iterations),
  pinSalt: salt,
  pinIterations: iterations,
  pinUpdatedAt: updatedAt,
});

export const verifyPin = async (pin, config = {}) => {
  if (!config.pinHash) return pin === config.pin;
  if (!config.pinSalt || !config.pinIterations) return false;
  const candidate = await derivePinHash(pin, config.pinSalt, config.pinIterations);
  return constantTimeEqual(candidate, config.pinHash);
};

export const upgradePlaintextPin = async (config = {}) => {
  if (config.pinHash || typeof config.pin !== 'string') return config;
  const credential = await createPinCredential(config.pin);
  const { pin: _plaintextPin, ...safeConfig } = config;
  return { ...safeConfig, ...credential };
};

