/**
 * API client for ai-trpg-web
 */

const BASE = '/api';

/**
 * レスポンスの HTTP ステータスを確認し、エラー時は Error をスロー（res.ok チェック漏れ防止）
 * サーバーが返す { error: '...' } メッセージをエラーメッセージとして使用する
 */
async function checkResponse(res) {
  if (!res.ok) {
    let msg;
    try { msg = (await res.json()).error; } catch { msg = null; }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res;
}

export async function newSession() {
  const res = await fetch(`${BASE}/session/new`, { method: 'POST' });
  return (await checkResponse(res)).json();
}

export async function getSession(id) {
  const res = await fetch(`${BASE}/session/${id}`);
  return (await checkResponse(res)).json();
}

export async function patchSession(id, data) {
  const res = await fetch(`${BASE}/session/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return (await checkResponse(res)).json();
}

export async function deleteSession(id) {
  const res = await fetch(`${BASE}/session/${id}`, { method: 'DELETE' });
  return (await checkResponse(res)).json();
}

/**
 * Setup complete — streams intro via SSE
 * Returns fetch Response（consumeStream で消費する）
 */
export function setupCompleteStream(id) {
  return fetch(`${BASE}/game/${id}/setup-complete`, { method: 'POST' });
}

/**
 * Send action — streams GM response via SSE
 */
export function sendAction(id, action) {
  return fetch(`${BASE}/game/${id}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
}

export async function rollback(id) {
  const res = await fetch(`${BASE}/game/${id}/rollback`, { method: 'POST' });
  // 400（巻き戻す履歴なし）のエラーメッセージも throw 経由で呼び出し元に伝える
  return (await checkResponse(res)).json();
}

export async function rollDice(id, type, sides) {
  const res = await fetch(`${BASE}/game/${id}/dice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, sides }),
  });
  return (await checkResponse(res)).json();
}

export async function listSaves(id) {
  const res = await fetch(`${BASE}/saves/${id}`);
  return (await checkResponse(res)).json();
}

export async function saveGame(id, name) {
  const res = await fetch(`${BASE}/saves/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return (await checkResponse(res)).json();
}

export async function loadSave(id, name) {
  const res = await fetch(`${BASE}/saves/${id}/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return (await checkResponse(res)).json();
}

export async function deleteSave(id, name) {
  const res = await fetch(`${BASE}/saves/${id}/${name}`, { method: 'DELETE' });
  return (await checkResponse(res)).json();
}

/**
 * Consume a streaming fetch response (SSE format)
 * Calls onEvent(parsed) for each event, returns when done.
 */
export async function consumeStream(response, onEvent) {
  // ストリーミング非対応レスポンス（401リダイレクト等）への防御
  if (!response.body) throw new Error('Response body is not readable');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop(); // Last incomplete line

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          onEvent(data);
        } catch {
          // SSEパースエラーは無視（部分チャンクによる誤検出を防ぐ）
        }
      }
    }
  }
}
