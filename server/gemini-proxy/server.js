import http from 'node:http';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { TASK_DEFINITIONS, validateModelResult, validateTeacherRequest } from './taskDefinitions.js';

const MAX_BODY_BYTES = 80 * 1024;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_RATE_LIMIT = 30;

const jsonHeaders = origin => ({
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
  Pragma: 'no-cache',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
});

const sendJson = (response, status, value, origin = '') => {
  response.writeHead(status, jsonHeaders(origin));
  response.end(JSON.stringify(value));
};

const safeEqual = (left, right) => {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

const readBody = request => new Promise((resolve, reject) => {
  let body = '';
  let bytes = 0;
  request.setEncoding('utf8');
  request.on('data', chunk => {
    bytes += Buffer.byteLength(chunk);
    if (bytes > MAX_BODY_BYTES) {
      const error = new Error('送信データが大きすぎます');
      error.code = 'PAYLOAD_TOO_LARGE';
      reject(error);
      request.destroy();
      return;
    }
    body += chunk;
  });
  request.on('end', () => {
    try { resolve(JSON.parse(body)); }
    catch { reject(Object.assign(new Error('JSONを読み取れません'), { code: 'INVALID_JSON' })); }
  });
  request.on('error', reject);
});

const extractText = interaction => {
  const candidates = [
    ...(interaction.steps || []).filter(step => step?.type === 'model_output'),
    ...(interaction.outputs || []),
    interaction.output,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (typeof candidate === 'string') return candidate;
    if (typeof candidate.text === 'string') return candidate.text;
    const content = Array.isArray(candidate.content) ? candidate.content : [candidate.content].filter(Boolean);
    for (const part of content) {
      if (typeof part === 'string') return part;
      if (typeof part?.text === 'string') return part.text;
    }
  }
  return '';
};

const createRateLimiter = (limit = DEFAULT_RATE_LIMIT) => {
  const buckets = new Map();
  return key => {
    const now = Date.now();
    const current = buckets.get(key);
    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
      return { allowed: true, remaining: limit - 1 };
    }
    current.count += 1;
    return { allowed: current.count <= limit, remaining: Math.max(0, limit - current.count), retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  };
};

export const createGeminiProxyServer = ({
  apiKey = process.env.GEMINI_API_KEY,
  gatewayToken = process.env.AI_GATEWAY_TOKEN,
  allowedOrigins = String(process.env.ALLOWED_ORIGIN || '').split(',').map(item => item.trim()).filter(Boolean),
  model = process.env.GEMINI_MODEL || 'gemini-3.5-flash',
  rateLimit = Number(process.env.AI_RATE_LIMIT || DEFAULT_RATE_LIMIT),
  fetchImpl = fetch,
} = {}) => {
  if (!apiKey) throw new Error('GEMINI_API_KEY is required');
  if (!gatewayToken || gatewayToken.length < 24) throw new Error('AI_GATEWAY_TOKEN must be at least 24 characters');
  if (allowedOrigins.length === 0) throw new Error('ALLOWED_ORIGIN is required');
  const checkRate = createRateLimiter(rateLimit);
  const tokenHash = createHash('sha256').update(gatewayToken).digest('hex');

  return http.createServer(async (request, response) => {
    const requestId = randomUUID();
    const origin = allowedOrigins.includes(request.headers.origin) ? request.headers.origin : '';
    if (request.headers.origin && !origin) return sendJson(response, 403, { code: 'ORIGIN_DENIED', error: '許可されていない接続元です', requestId });

    if (request.method === 'GET' && request.url === '/health') return sendJson(response, 200, { status: 'ok' }, origin);
    if (request.method === 'OPTIONS' && request.url === '/v1/teacher-assist') {
      response.writeHead(204, {
        ...jsonHeaders(origin),
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '600',
      });
      return response.end();
    }
    if (request.method !== 'POST' || request.url !== '/v1/teacher-assist') return sendJson(response, 404, { code: 'NOT_FOUND', error: '見つかりません', requestId }, origin);
    if (!String(request.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
      return sendJson(response, 415, { code: 'CONTENT_TYPE_REQUIRED', error: 'application/jsonで送信してください', requestId }, origin);
    }

    const suppliedToken = String(request.headers.authorization || '').replace(/^Bearer\s+/i, '');
    if (!safeEqual(suppliedToken, gatewayToken)) return sendJson(response, 401, { code: 'UNAUTHORIZED', error: '認証できません', requestId }, origin);
    const rate = checkRate(tokenHash);
    response.setHeader('X-RateLimit-Remaining', String(rate.remaining));
    if (!rate.allowed) {
      response.setHeader('Retry-After', String(rate.retryAfter));
      return sendJson(response, 429, { code: 'RATE_LIMITED', error: '利用回数の上限に達しました。時間をおいて再試行してください', requestId }, origin);
    }

    try {
      const body = await readBody(request);
      const validation = validateTeacherRequest(body);
      if (!validation.valid) return sendJson(response, 400, { code: validation.code, error: validation.error, requestId }, origin);
      const definition = TASK_DEFINITIONS[body.task];
      const upstream = await fetchImpl('https://generativelanguage.googleapis.com/v1beta/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          model,
          input: `${definition.prompt}\n\n入力データ(JSON):\n${JSON.stringify(body.payload)}`,
          response_format: { type: 'text', mime_type: 'application/json', schema: definition.schema },
          store: false,
        }),
        signal: AbortSignal.timeout(40_000),
      });
      if (!upstream.ok) {
        // Geminiの応答本文には利用者データが含まれる可能性があるため、ログにもクライアントにも転送しない。
        return sendJson(response, upstream.status === 429 ? 429 : 502, {
          code: upstream.status === 429 ? 'GEMINI_RATE_LIMITED' : 'GEMINI_UPSTREAM_ERROR',
          error: upstream.status === 429 ? 'Geminiの利用上限に達しました' : 'Geminiから応答を取得できませんでした',
          requestId,
        }, origin);
      }
      const interaction = await upstream.json();
      const text = extractText(interaction);
      let result;
      try { result = JSON.parse(text); }
      catch { return sendJson(response, 502, { code: 'INVALID_MODEL_OUTPUT', error: 'AI応答の形式を確認できませんでした', requestId }, origin); }
      if (!validateModelResult(body.task, result)) return sendJson(response, 502, { code: 'INVALID_MODEL_OUTPUT', error: 'AI応答の項目を確認できませんでした', requestId }, origin);
      return sendJson(response, 200, { result, model, requestId }, origin);
    } catch (error) {
      if (response.headersSent) return response.end();
      const clientError = ['PAYLOAD_TOO_LARGE', 'INVALID_JSON'].includes(error.code);
      return sendJson(response, clientError ? 400 : 500, {
        code: clientError ? error.code : 'INTERNAL_ERROR',
        error: clientError ? error.message : 'AI支援処理を完了できませんでした',
        requestId,
      }, origin);
    }
  });
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT || 8080);
  createGeminiProxyServer().listen(port, '0.0.0.0', () => console.log(`Gemini teacher-assist proxy listening on ${port}`));
}
