import { Router, Request, Response } from 'express';
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
  listAllSessions,
  deleteSessionDirectory,
} from '../core/save_manager.js';
import { loadAutoSave } from '../core/auto_save.js';
import { deleteSessionMemories } from '../core/memory_store.js';
import type { DiceSystem, StatsMode, NarrativeStyle, ResponseLength } from '../types.js';

const router = Router();

// ── バリデーションヘルパー ─────────────────────────────────────────────────────

/** セッションIDのUUID v4形式検証（パストラバーサル防止） */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isValidSessionId(id: unknown): id is string {
  return typeof id === 'string' && UUID_REGEX.test(id);
}

/** X-Client-ID ヘッダーの検証（英数字・ハイフン・アンダースコア、最大100文字） */
const CLIENT_ID_REGEX = /^[a-zA-Z0-9_-]{1,100}$/;
function extractClientId(req: Request): string | undefined {
  const id = req.headers['x-client-id'];
  const raw = Array.isArray(id) ? id[0] : id;
  return raw && CLIENT_ID_REGEX.test(raw) ? raw : undefined;
}

/**
 * セーブ名のサニタイズ（パストラバーサル防止）
 * 英数字・アンダースコア・ハイフン・日本語文字のみ許可。最大40文字。
 */
function sanitizeSaveName(name: unknown): string | null {
  if (typeof name !== 'string' || name.length === 0) return null;
  const cleaned = name.replace(/[^\w\u3041-\u9FFF-]/g, '');
  return cleaned.length > 0 ? cleaned.slice(0, 40) : null;
}

/** 許可済み enum セット（不正値のPATCH注入防止） */
const ALLOWED = {
  diceSystem:     new Set<DiceSystem>(['none', 'd20', 'coc', 'dnd5e']),
  statsMode:      new Set<StatsMode>(['none', 'hp', 'hpmp']),
  narrativeStyle: new Set<NarrativeStyle>(['novel', 'trpg', 'balanced']),
  responseLength: new Set<ResponseLength>(['short', 'standard', 'long']),
};

// ── Sessions (dashboard) ──────────────────────────────────────────────────────

/** GET /api/sessions — セッション一覧（X-Client-ID で所有者フィルタ） */
router.get('/sessions', async (req: Request, res: Response) => {
  const clientId = extractClientId(req);
  const sessions = await listAllSessions(clientId);
  res.json(sessions);
});

/** DELETE /api/sessions/:id — セッションを完全削除（ファイル・メモリ・ChromaDB） */
router.delete('/sessions/:id', async (req: Request, res: Response) => {
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' }) as unknown as void;
  const id = req.params.id;
  deleteSession(id);
  deleteSessionMemories(id).catch(() => {});
  await deleteSessionDirectory(id).catch(() => {});
  res.json({ ok: true });
});

// ── Session ───────────────────────────────────────────────────────────────────

/** POST /api/session/new — Create new session */
router.post('/session/new', (req: Request, res: Response) => {
  const id = uuidv4();
  const clientId = extractClientId(req);
  const session = createSession(id, clientId);
  res.json({ sessionId: id, session });
});

/** GET /api/session/:id — Get session state（メモリにない場合は自動セーブから復元） */
router.get('/session/:id', async (req: Request, res: Response) => {
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' }) as unknown as void;

  let session = getSession(req.params.id);

  // セッションがメモリにない場合、自動セーブから復元を試みる
  if (!session) {
    const data = await loadAutoSave(req.params.id);
    if (data?.setupComplete) {
      restoreSession(req.params.id, data);
      session = getSession(req.params.id);
    }
  }

  if (!session) return res.status(404).json({ error: 'Session not found' }) as unknown as void;
  res.json(session);
});

/**
 * PATCH /api/session/:id — Update session (setup)
 * 許可フィールド（rules / world / player）のみ受け付け、
 * 既存セッションデータと深くマージする（id・active・setupComplete等の上書き防止）。
 */
router.patch('/session/:id', (req: Request, res: Response) => {
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' }) as unknown as void;
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' }) as unknown as void;

  const { rules, world, player } = req.body as {
    rules?: Record<string, unknown>;
    world?: Record<string, unknown>;
    player?: Record<string, unknown>;
  };
  const updates: Record<string, unknown> = {};

  if (rules && typeof rules === 'object') {
    const r: Record<string, unknown> = {};
    if (typeof rules.genre === 'string')         r.genre         = (rules.genre as string).slice(0, 100);
    if (typeof rules.customSetting === 'string') r.customSetting = (rules.customSetting as string).slice(0, 1000);
    if (ALLOWED.diceSystem.has(rules.diceSystem as DiceSystem))         r.diceSystem     = rules.diceSystem;
    if (ALLOWED.statsMode.has(rules.statsMode as StatsMode))           r.statsMode      = rules.statsMode;
    if (ALLOWED.narrativeStyle.has(rules.narrativeStyle as NarrativeStyle)) r.narrativeStyle = rules.narrativeStyle;
    if (ALLOWED.responseLength.has(rules.responseLength as ResponseLength)) r.responseLength = rules.responseLength;
    if (typeof rules.actionSuggestions === 'boolean')     r.actionSuggestions = rules.actionSuggestions;
    updates.rules = { ...session.rules, ...r };
  }

  if (world && typeof world === 'object') {
    const w: Record<string, unknown> = {};
    if (typeof world.adventureTheme === 'string') w.adventureTheme = (world.adventureTheme as string).slice(0, 500);
    updates.world = { ...session.world, ...w };
  }

  if (player && typeof player === 'object') {
    const p: Record<string, unknown> = {};
    if (typeof player.name === 'string')                   p.name                   = (player.name as string).slice(0, 50);
    if (typeof player.characterDescription === 'string')   p.characterDescription   = (player.characterDescription as string).slice(0, 2000);
    if (player.hp    === null || (typeof player.hp    === 'number' && (player.hp    as number) >= 0)) p.hp    = player.hp;
    if (player.hpMax === null || (typeof player.hpMax === 'number' && (player.hpMax as number) >  0)) p.hpMax = player.hpMax;
    if (player.mp    === null || (typeof player.mp    === 'number' && (player.mp    as number) >= 0)) p.mp    = player.mp;
    if (player.mpMax === null || (typeof player.mpMax === 'number' && (player.mpMax as number) >  0)) p.mpMax = player.mpMax;
    updates.player = { ...session.player, ...p };
  }

  const updated = updateSession(req.params.id, updates as Partial<import('../types.js').Session>);
  res.json(updated);
});

/** DELETE /api/session/:id — End session */
router.delete('/session/:id', (req: Request, res: Response) => {
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' }) as unknown as void;
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
router.post('/game/:id/setup-complete', async (req: Request, res: Response) => {
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' }) as unknown as void;
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' }) as unknown as void;

  updateSession(req.params.id, { setupComplete: true });

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

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
    send({ type: 'error', message: (err as Error).message });
  }

  res.end();
});

/**
 * POST /api/game/:id/action — Player action (SSE streaming)
 * Body: { action: string }
 */
router.post('/game/:id/action', async (req: Request, res: Response) => {
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' }) as unknown as void;
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' }) as unknown as void;

  const { action } = req.body as { action?: string };
  if (!action || !action.trim()) {
    return res.status(400).json({ error: 'Action is required' }) as unknown as void;
  }
  // 入力長の上限（コスト爆発・メモリ圧迫防止）
  if (action.trim().length > 1000) {
    return res.status(400).json({ error: 'Action is too long (max 1000 characters)' }) as unknown as void;
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    await processActionStream(req.params.id, action.trim(), (chunk) => {
      send({ type: 'text', chunk });
    });

    // Send updated stats after action
    const updated = getSession(req.params.id);
    send({
      type: 'done',
      turn: updated?.turn,
      player: updated?.player,
    });
  } catch (err) {
    send({ type: 'error', message: (err as Error).message });
  }

  res.end();
});

/**
 * POST /api/game/:id/rollback — Undo last turn
 */
router.post('/game/:id/rollback', (req: Request, res: Response) => {
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' }) as unknown as void;
  const ok = rollback(req.params.id);
  const session = getSession(req.params.id);
  if (!ok) return res.status(400).json({ error: '巻き戻せる履歴がありません' }) as unknown as void;
  res.json({ ok: true, turn: session?.turn ?? 0 });
});

/**
 * POST /api/game/:id/dice — Roll dice
 * Body: { type: 'd20' | 'coc' | 'dnd5e' | 'd6' | 'custom', sides?: number }
 */
router.post('/game/:id/dice', (req: Request, res: Response) => {
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' }) as unknown as void;
  const { type, sides } = req.body as { type?: string; sides?: number };
  let result: number;
  let description: string;

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
      const s = Number(sides) || 6;
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
router.get('/saves/:id', async (req: Request, res: Response) => {
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' }) as unknown as void;
  const saves = await listSaves(req.params.id);
  res.json(saves);
});

/** POST /api/saves/:id — Save current session */
router.post('/saves/:id', async (req: Request, res: Response) => {
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' }) as unknown as void;
  try {
    const rawName = (req.body as { name?: string }).name;
    const name = rawName ? sanitizeSaveName(rawName) : undefined;
    if (rawName && !name) return res.status(400).json({ error: 'Invalid save name' }) as unknown as void;
    const result = await saveSession(req.params.id, name ?? undefined);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** POST /api/saves/:id/load — Load a save */
router.post('/saves/:id/load', async (req: Request, res: Response) => {
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' }) as unknown as void;
  try {
    const name = sanitizeSaveName((req.body as { name?: string }).name);
    if (!name) return res.status(400).json({ error: 'Invalid save name' }) as unknown as void;
    const data = await loadSave(req.params.id, name);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

/** DELETE /api/saves/:id/:name — Delete a save */
router.delete('/saves/:id/:name', async (req: Request, res: Response) => {
  if (!isValidSessionId(req.params.id)) return res.status(400).json({ error: 'Invalid session ID' }) as unknown as void;
  const name = sanitizeSaveName(req.params.name);
  if (!name) return res.status(400).json({ error: 'Invalid save name' }) as unknown as void;
  try {
    await deleteSave(req.params.id, name);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── helpers ───────────────────────────────────────────────────────────────────

function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

export default router;
