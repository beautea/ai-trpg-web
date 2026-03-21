import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import {
  createSession,
  getSession,
  updateSession,
  deleteSession,
  restoreSession,
} from '../core/session_store.js';
import {
  generateIntroStream,
  processActionStream,
  rollback,
  generateWorldConcept,
} from '../core/gm_system.js';
import {
  saveSession,
  listSaves,
  loadSave,
  deleteSave,
} from '../core/save_manager.js';
import { loadAutoSave } from '../core/auto_save.js';
import { deleteSessionMemories } from '../core/memory_store.js';

const router = Router();

// ── Session ───────────────────────────────────────────────────────────────────

/** POST /api/session/new — Create new session */
router.post('/session/new', (req, res) => {
  const id = uuidv4();
  const session = createSession(id);
  res.json({ sessionId: id, session });
});

/** GET /api/session/:id — Get session state（メモリにない場合は自動セーブから復元） */
router.get('/session/:id', async (req, res) => {
  let session = getSession(req.params.id);

  // セッションがメモリにない場合、自動セーブから復元を試みる
  if (!session) {
    const data = await loadAutoSave(req.params.id);
    if (data?.setupComplete) {
      restoreSession(req.params.id, data);
      session = getSession(req.params.id);
    }
  }

  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

/** PATCH /api/session/:id — Update session (setup) */
router.patch('/session/:id', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  const updated = updateSession(req.params.id, req.body);
  res.json(updated);
});

/** DELETE /api/session/:id — End session */
router.delete('/session/:id', (req, res) => {
  const id = req.params.id;
  deleteSession(id);
  // メモリを非同期で削除（エラーは無視）
  deleteSessionMemories(id).catch(() => {});
  res.json({ ok: true });
});

// ── Game ──────────────────────────────────────────────────────────────────────

/**
 * POST /api/game/:id/setup-complete
 * Marks setup complete, optionally generates world concept, then streams intro.
 */
router.post('/game/:id/setup-complete', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  updateSession(req.params.id, { setupComplete: true });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    // Generate world concept if adventureTheme is set
    if (session.world.adventureTheme && !session.world.coreConceptGenerated) {
      send({ type: 'status', text: '世界を構築中…' });
      await generateWorldConcept(req.params.id);
    }

    send({ type: 'intro_start' });
    await generateIntroStream(req.params.id, (chunk) => {
      send({ type: 'text', chunk });
    });
    send({ type: 'done' });
  } catch (err) {
    send({ type: 'error', message: err.message });
  }

  res.end();
});

/**
 * POST /api/game/:id/action — Player action (SSE streaming)
 * Body: { action: string }
 */
router.post('/game/:id/action', async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { action } = req.body;
  if (!action || !action.trim()) {
    return res.status(400).json({ error: 'Action is required' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    await processActionStream(req.params.id, action.trim(), (chunk) => {
      send({ type: 'text', chunk });
    });

    // Send updated stats after action
    const updated = getSession(req.params.id);
    send({
      type: 'done',
      turn: updated.turn,
      player: updated.player,
    });
  } catch (err) {
    send({ type: 'error', message: err.message });
  }

  res.end();
});

/**
 * POST /api/game/:id/rollback — Undo last turn
 */
router.post('/game/:id/rollback', (req, res) => {
  const ok = rollback(req.params.id);
  const session = getSession(req.params.id);
  if (!ok) return res.status(400).json({ error: '巻き戻せる履歴がありません' });
  res.json({ ok: true, turn: session?.turn ?? 0 });
});

/**
 * POST /api/game/:id/dice — Roll dice
 * Body: { type: 'd20' | 'coc' | 'dnd5e' | 'd6' | 'custom', sides?: number }
 */
router.post('/game/:id/dice', (req, res) => {
  const { type, sides } = req.body;
  let result;
  let description;

  switch (type) {
    case 'd20':
      result = rollDie(20);
      description = `d20 → ${result}`;
      break;
    case 'coc': {
      result = rollDie(100);
      description = `d100 → ${result}`;
      break;
    }
    case 'dnd5e': {
      const d1 = rollDie(6);
      const d2 = rollDie(6);
      const d3 = rollDie(6);
      result = d1 + d2 + d3;
      description = `3d6 → ${d1}+${d2}+${d3} = ${result}`;
      break;
    }
    case 'custom': {
      const s = parseInt(sides) || 6;
      result = rollDie(s);
      description = `d${s} → ${result}`;
      break;
    }
    default:
      result = rollDie(6);
      description = `d6 → ${result}`;
  }

  res.json({ result, description });
});

// ── Save / Load ────────────────────────────────────────────────────────────────

/** GET /api/saves/:id — List saves */
router.get('/saves/:id', async (req, res) => {
  const saves = await listSaves(req.params.id);
  res.json(saves);
});

/** POST /api/saves/:id — Save current session */
router.post('/saves/:id', async (req, res) => {
  try {
    const { name } = req.body;
    const result = await saveSession(req.params.id, name);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/saves/:id/load — Load a save */
router.post('/saves/:id/load', async (req, res) => {
  try {
    const { name } = req.body;
    const data = await loadSave(req.params.id, name);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/saves/:id/:name — Delete a save */
router.delete('/saves/:id/:name', async (req, res) => {
  await deleteSave(req.params.id, req.params.name);
  res.json({ ok: true });
});

// ── helpers ───────────────────────────────────────────────────────────────────

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

export default router;
