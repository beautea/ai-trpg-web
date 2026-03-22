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

// ── バリデーションヘルパー ─────────────────────────────────────────────────────

/** セッションIDのUUID v4形式検証（パストラバーサル防止） */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidSessionId(id) {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

/**
 * セーブ名のサニタイズ（パストラバーサル防止）
 * 英数字・アンダースコア・ハイフン・日本語文字のみ許可。最大40文字。
 */
function sanitizeSaveName(name) {
  if (typeof name !== 'string' || name.length === 0) return null;
  const cleaned = name.replace(/[^\w\u3041-\u9FFF-]/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 40) : null;
}

/** 許可済み enum セット（不正値のPATCH注入防止） */
const ALLOWED = {
  diceSystem:     new Set(['none', 'd20', 'coc', 'dnd5e']),
  statsMode:      new Set(['none', 'hp', 'hpmp']),
  narrativeStyle: new Set(['novel', 'trpg', 'balanced']),
  responseLength: new Set(['short', 'standard', 'long']),
};

// ── Session ───────────────────────────────────────────────────────────────────

/** POST /api/session/new — Create new session */
router.post('/session/new', (req, res) => {
  const id = uuidv4();
  const session = createSession(id);
  res.json({ sessionId: id, session });
});

/** GET /api/session/:id — Get session state（メモリにない場合は自動セーブから復元） */
router.get('/session/:id', async (req, res) => {
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' });

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

/**
 * PATCH /api/session/:id — Update session (setup)
 * 許可フィールド（rules / world / player）のみ受け付け、
 * 既存セッションデータと深くマージする（id・active・setupComplete等の上書き防止）。
 */
router.patch('/session/:id', (req, res) => {
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' });
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { rules, world, player } = req.body;
  const updates = {};

  if (rules && typeof rules === 'object') {
    const r = {};
    if (typeof rules.genre === 'string')         r.genre         = rules.genre.slice(0, 100);
    if (typeof rules.customSetting === 'string') r.customSetting = rules.customSetting.slice(0, 1000);
    if (ALLOWED.diceSystem.has(rules.diceSystem))         r.diceSystem     = rules.diceSystem;
    if (ALLOWED.statsMode.has(rules.statsMode))           r.statsMode      = rules.statsMode;
    if (ALLOWED.narrativeStyle.has(rules.narrativeStyle)) r.narrativeStyle = rules.narrativeStyle;
    if (ALLOWED.responseLength.has(rules.responseLength)) r.responseLength = rules.responseLength;
    if (typeof rules.actionSuggestions === 'boolean')     r.actionSuggestions = rules.actionSuggestions;
    updates.rules = { ...session.rules, ...r };
  }

  if (world && typeof world === 'object') {
    const w = {};
    if (typeof world.adventureTheme === 'string') w.adventureTheme = world.adventureTheme.slice(0, 500);
    updates.world = { ...session.world, ...w };
  }

  if (player && typeof player === 'object') {
    const p = {};
    if (typeof player.name === 'string')                   p.name                   = player.name.slice(0, 50);
    if (typeof player.characterDescription === 'string')   p.characterDescription   = player.characterDescription.slice(0, 2000);
    if (player.hp    === null || (typeof player.hp    === 'number' && player.hp    >= 0)) p.hp    = player.hp;
    if (player.hpMax === null || (typeof player.hpMax === 'number' && player.hpMax >  0)) p.hpMax = player.hpMax;
    if (player.mp    === null || (typeof player.mp    === 'number' && player.mp    >= 0)) p.mp    = player.mp;
    if (player.mpMax === null || (typeof player.mpMax === 'number' && player.mpMax >  0)) p.mpMax = player.mpMax;
    updates.player = { ...session.player, ...p };
  }

  const updated = updateSession(req.params.id, updates);
  res.json(updated);
});

/** DELETE /api/session/:id — End session */
router.delete('/session/:id', (req, res) => {
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' });
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
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' });
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
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' });
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });

  const { action } = req.body;
  if (!action || !action.trim()) {
    return res.status(400).json({ error: 'Action is required' });
  }
  // 入力長の上限（コスト爆発・メモリ圧迫防止）
  if (action.trim().length > 1000) {
    return res.status(400).json({ error: 'Action is too long (max 1000 characters)' });
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
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' });
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
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' });
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
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' });
  const saves = await listSaves(req.params.id);
  res.json(saves);
});

/** POST /api/saves/:id — Save current session */
router.post('/saves/:id', async (req, res) => {
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' });
  try {
    const rawName = req.body.name;
    const name = rawName ? sanitizeSaveName(rawName) : undefined;
    if (rawName && !name) return res.status(400).json({ error: 'Invalid save name' });
    const result = await saveSession(req.params.id, name);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** POST /api/saves/:id/load — Load a save */
router.post('/saves/:id/load', async (req, res) => {
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' });
  try {
    const name = sanitizeSaveName(req.body.name);
    if (!name) return res.status(400).json({ error: 'Invalid save name' });
    const data = await loadSave(req.params.id, name);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** DELETE /api/saves/:id/:name — Delete a save */
router.delete('/saves/:id/:name', async (req, res) => {
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' });
  const name = sanitizeSaveName(req.params.name);
  if (!name) return res.status(400).json({ error: 'Invalid save name' });
  try {
    await deleteSave(req.params.id, name);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── helpers ───────────────────────────────────────────────────────────────────

function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

export default router;
