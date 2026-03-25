/**
 * In-memory session store (single player, no Discord)
 */
import type { Session, HistoryEntry } from '../types.js';

const sessions = new Map<string, Session>();

export function createSession(id: string, clientId?: string): Session {
  const session: Session = {
    id,
    clientId,
    createdAt: Date.now(),
    active: true,

    // Setup
    setupComplete: false,
    rules: {
      genre: '',
      customSetting: '',
      diceSystem: 'none',
      statsMode: 'none',
      narrativeStyle: 'novel',
      actionSuggestions: false,
      responseLength: 'standard',
    },
    world: {
      adventureTheme: '',
      coreConceptGenerated: '',
    },
    player: {
      name: '',
      characterDescription: '',
      hp: null,
      hpMax: null,
      mp: null,
      mpMax: null,
      items: [],
    },

    // Game state
    scene: '',
    turn: 0,

    // Conversation history
    history: [],
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id: string): Session | null {
  return sessions.get(id) || null;
}

export function updateSession(id: string, updates: Partial<Session>): Session {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session ${id} not found`);
  Object.assign(session, updates);
  return session;
}

export function deleteSession(id: string): void {
  sessions.delete(id);
}

export function addHistory(id: string, role: 'user' | 'assistant', content: string): void {
  const session = sessions.get(id);
  if (!session) return;
  session.history.push({ role, content });
  // Keep last N turns (user+assistant pairs)
  const maxEntries = 60; // 30 turns × 2
  if (session.history.length > maxEntries) {
    session.history = session.history.slice(session.history.length - maxEntries);
  }
}

export function rollbackHistory(id: string): boolean {
  const session = sessions.get(id);
  if (!session || session.history.length < 2) return false;
  // Remove last user + assistant pair
  session.history.splice(-2);
  if (session.turn > 0) session.turn--;
  return true;
}

export function restoreSession(id: string, savedData: unknown): Session {
  const data = savedData as Session;
  // 旧データ互換: items フィールドがない場合は空配列で補完
  if (!data.player.items) data.player.items = [];
  sessions.set(id, { ...data, id, active: true });
  return sessions.get(id) as Session;
}
