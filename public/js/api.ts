/**
 * API client for ai-trpg-web
 */
import type { Session, SSEEvent, SaveMeta } from '../../src/types.js';

const BASE = '/api';

/**
 * レスポンスの HTTP ステータスを確認し、エラー時は Error をスロー（res.ok チェック漏れ防止）
 * サーバーが返す { error: '...' } メッセージをエラーメッセージとして使用する
 */
async function checkResponse(res: Response): Promise<Response> {
  if (!res.ok) {
    let msg: string | null;
    try { msg = (await res.json() as { error?: string }).error ?? null; } catch { msg = null; }
    throw new Error(msg || `HTTP ${res.status}`);
  }
  return res;
}

export async function newSession(): Promise<{ sessionId: string; session: Session }> {
  const res = await fetch(`${BASE}/session/new`, { method: 'POST' });
  return (await checkResponse(res)).json() as Promise<{ sessionId: string; session: Session }>;
}

export async function getSession(id: string): Promise<Session> {
  const res = await fetch(`${BASE}/session/${id}`);
  return (await checkResponse(res)).json() as Promise<Session>;
}

export async function patchSession(id: string, data: Partial<Omit<Session, 'world'> & { world?: Partial<Session['world']> }>): Promise<Session> {
  const res = await fetch(`${BASE}/session/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return (await checkResponse(res)).json() as Promise<Session>;
}

export async function deleteSession(id: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/session/${id}`, { method: 'DELETE' });
  return (await checkResponse(res)).json() as Promise<{ ok: boolean }>;
}

/**
 * Setup complete — streams intro via SSE
 * Returns fetch Response（consumeStream で消費する）
 */
export function setupCompleteStream(id: string): Promise<Response> {
  return fetch(`${BASE}/game/${id}/setup-complete`, { method: 'POST' });
}

/**
 * Send action — streams GM response via SSE
 */
export function sendAction(id: string, action: string): Promise<Response> {
  return fetch(`${BASE}/game/${id}/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  });
}

export async function rollback(id: string): Promise<{ ok: boolean; turn: number }> {
  const res = await fetch(`${BASE}/game/${id}/rollback`, { method: 'POST' });
  // 400（巻き戻す履歴なし）のエラーメッセージも throw 経由で呼び出し元に伝える
  return (await checkResponse(res)).json() as Promise<{ ok: boolean; turn: number }>;
}

export async function rollDice(
  id: string,
  type: string,
  sides?: number,
): Promise<{ result: number; description: string }> {
  const res = await fetch(`${BASE}/game/${id}/dice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, sides }),
  });
  return (await checkResponse(res)).json() as Promise<{ result: number; description: string }>;
}

export async function listSaves(id: string): Promise<SaveMeta[]> {
  const res = await fetch(`${BASE}/saves/${id}`);
  return (await checkResponse(res)).json() as Promise<SaveMeta[]>;
}

export async function saveGame(id: string, name?: string): Promise<{ name: string; summary: string }> {
  const res = await fetch(`${BASE}/saves/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return (await checkResponse(res)).json() as Promise<{ name: string; summary: string }>;
}

export async function loadSave(id: string, name: string): Promise<Session> {
  const res = await fetch(`${BASE}/saves/${id}/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return (await checkResponse(res)).json() as Promise<Session>;
}

export async function deleteSave(id: string, name: string): Promise<{ ok: boolean }> {
  const res = await fetch(`${BASE}/saves/${id}/${name}`, { method: 'DELETE' });
  return (await checkResponse(res)).json() as Promise<{ ok: boolean }>;
}

/**
 * Consume a streaming fetch response (SSE format)
 * Calls onEvent(parsed) for each event, returns when done.
 */
export async function consumeStream(
  response: Response,
  onEvent: (event: SSEEvent) => void,
): Promise<void> {
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
    buffer = lines.pop() ?? ''; // Last incomplete line

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6)) as SSEEvent;
          onEvent(data);
        } catch {
          // SSEパースエラーは無視（部分チャンクによる誤検出を防ぐ）
        }
      }
    }
  }
}
