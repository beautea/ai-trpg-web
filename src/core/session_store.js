/**
 * In-memory session store (single player, no Discord)
 */
const sessions = new Map();

export function createSession(id) {
  const session = {
    id,
    createdAt: Date.now(),
    active: true,

    // Setup
    setupComplete: false,
    rules: {
      genre: '',
      customSetting: '',
      diceSystem: 'none',   // none | d20 | coc | dnd5e
      statsMode: 'none',    // none | hp | hpmp
      narrativeStyle: 'novel', // novel | trpg | balanced
      actionSuggestions: false,
      responseLength: 'standard', // short | standard | long
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
    },

    // Game state
    scene: '',
    turn: 0,

    // Conversation history [{role: 'user'|'assistant', content: string}]
    history: [],
  };
  sessions.set(id, session);
  return session;
}

export function getSession(id) {
  return sessions.get(id) || null;
}

export function updateSession(id, updates) {
  const session = sessions.get(id);
  if (!session) throw new Error(`Session ${id} not found`);
  Object.assign(session, updates);
  return session;
}

export function deleteSession(id) {
  sessions.delete(id);
}

export function addHistory(id, role, content) {
  const session = sessions.get(id);
  if (!session) return;
  session.history.push({ role, content });
  // Keep last N turns (user+assistant pairs)
  const maxEntries = 60; // 30 turns × 2
  if (session.history.length > maxEntries) {
    session.history = session.history.slice(session.history.length - maxEntries);
  }
}

export function rollbackHistory(id) {
  const session = sessions.get(id);
  if (!session || session.history.length < 2) return false;
  // Remove last user + assistant pair
  session.history.splice(-2);
  if (session.turn > 0) session.turn--;
  return true;
}

export function restoreSession(id, savedData) {
  sessions.set(id, { ...savedData, id, active: true });
  return sessions.get(id);
}
