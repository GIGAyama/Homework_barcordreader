export const MAX_AI_PAYLOAD_BYTES = 64 * 1024;
export const AI_REQUEST_TIMEOUT_MS = 45_000;

export const validateProxyUrl = value => {
  try {
    const url = new URL(String(value || '').trim());
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) return false;
    return !url.username && !url.password;
  } catch {
    return false;
  }
};

const validateResult = result => {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error('AI応答の形式を確認できませんでした');
  const textFields = ['draft', 'observation', 'action', 'goal'];
  if (!textFields.some(key => typeof result[key] === 'string' && result[key].trim())) {
    throw new Error('AI応答に利用できる下書きがありません');
  }
  return result;
};

export const requestTeacherAssistance = async ({ proxyUrl, gatewayToken, task, payload, signal, fetchImpl = fetch }) => {
  if (!validateProxyUrl(proxyUrl)) throw new Error('AIプロキシURLはHTTPSで設定してください');
  if (!String(gatewayToken || '').trim()) throw new Error('AIゲートウェイトークンを設定してください');
  const body = JSON.stringify({ task, payload });
  if (new TextEncoder().encode(body).length > MAX_AI_PAYLOAD_BYTES) throw new Error('送信データが大きすぎます。期間を短くしてください');

  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), AI_REQUEST_TIMEOUT_MS);
  const abort = () => timeoutController.abort();
  signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await fetchImpl(String(proxyUrl).replace(/\/$/, '') + '/v1/teacher-assist', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${String(gatewayToken).trim()}`,
      },
      body,
      signal: timeoutController.signal,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `AIプロキシがエラーを返しました（${response.status}）`);
      error.code = data.code || `HTTP_${response.status}`;
      throw error;
    }
    return { result: validateResult(data.result), model: String(data.model || ''), requestId: String(data.requestId || '') };
  } catch (error) {
    if (timeoutController.signal.aborted) throw new Error('AIへの接続がタイムアウトしました。しばらくして再試行してください', { cause: error });
    throw error;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
  }
};
