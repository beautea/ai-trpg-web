/**
 * API client for ai-trpg-web
 */

const BASE = '/api';

export async function newSession() {
  const res = await fetch(`${BASE}/session/new`, { method: 'POST' });
  return res.json();
}

export async function getSession(id) {
  const res = await fetch(`${BASE}/session/${id}`);
  return res.json();
}

export async function patchSession(id, data) {
  const res = await fetch(`${BASE}/session/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export async function deleteSession(id) {
  const res = await fetch(`${BASE}/session/${id}`, { method: 'DELETE' });
  return res.json();
}

/**
 * Setup complete — streams intro via SSE
 * Returns EventSource
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
  return res.json();
}

export async function rollDice(id, type, sides) {
  const res = await fetch(`${BASE}/game/${id}/dice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, sides }),
  });
  return res.json();
}

export async function listSaves(id) {
  const res = await fetch(`${BASE}/saves/${id}`);
  return res.json();
}

export async function saveGame(id, name) {
  const res = await fetch(`${BASE}/saves/${id}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.json();
}

export async function loadSave(id, name) {
  const res = await fetch(`${BASE}/saves/${id}/load`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return res.json();
}

export async function deleteSave(id, name) {
  const res = await fetch(`${BASE}/saves/${id}/${name}`, { method: 'DELETE' });
  return res.json();
}

/**
 * Consume a streaming fetch response (SSE format)
 * Calls onEvent(parsed) for each event, returns when done.
 */
export async function consumeStream(response, onEvent) {
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
        } catch { /* ignore parse errors */ }
      }
    }
  }
}
