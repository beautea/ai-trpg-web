/**
 * AI TRPG Web — Main App
 */
import * as api from './api.js';

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  sessionId: null,
  session: null,
  streaming: false,
  setupStep: 0,
  totalSteps: 5,
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const screens = {
  landing: document.getElementById('landing-screen'),
  setup:   document.getElementById('setup-screen'),
  loading: document.getElementById('loading-screen'),
  game:    document.getElementById('game-screen'),
};

const $ = (id) => document.getElementById(id);

// ── Screen transitions ────────────────────────────────────────────────────────
function showScreen(name) {
  Object.entries(screens).forEach(([k, el]) => {
    if (k === name) {
      el.style.display = 'flex';
      requestAnimationFrame(() => el.classList.add('active'));
    } else {
      el.classList.remove('active');
      setTimeout(() => { if (!el.classList.contains('active')) el.style.display = 'none'; }, 300);
    }
  });
}

// ── Particles (landing) ───────────────────────────────────────────────────────
function initParticles() {
  const canvas = $('particle-canvas');
  const ctx = canvas.getContext('2d');
  let W, H, particles;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }

  function createParticles(n = 80) {
    particles = Array.from({ length: n }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.5 + 0.3,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      alpha: Math.random() * 0.6 + 0.1,
      hue: Math.random() < 0.5 ? 270 : 45, // purple or gold
    }));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Deep radial gradient bg
    const grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) / 1.5);
    grad.addColorStop(0, 'rgba(20,15,40,1)');
    grad.addColorStop(1, 'rgba(5,5,8,1)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 70%, 65%, ${p.alpha})`;
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }

  resize();
  createParticles();
  draw();
  window.addEventListener('resize', () => { resize(); createParticles(); });
}

// ── Setup wizard ──────────────────────────────────────────────────────────────
const setupData = {
  genre: '',
  customSetting: '',
  narrativeStyle: 'novel',
  diceSystem: 'none',
  statsMode: 'none',
  responseLength: 'standard',
  actionSuggestions: false,
  charName: '',
  charDesc: '',
  adventureTheme: '',
};

function updateProgress() {
  const pct = (state.setupStep / (state.totalSteps - 1)) * 100;
  $('progress-fill').style.width = `${pct}%`;

  document.querySelectorAll('.step-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i === state.setupStep);
    dot.classList.toggle('completed', i < state.setupStep);
  });
}

function goToStep(n) {
  const steps = document.querySelectorAll('.setup-step');
  steps.forEach((s) => s.classList.remove('active'));
  steps[n].classList.add('active');
  state.setupStep = n;
  updateProgress();
}

// Genre selection
document.querySelectorAll('.genre-card').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.genre-card').forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
    setupData.genre = card.dataset.value;
    $('custom-setting-wrap').classList.toggle('hidden', setupData.genre !== 'カスタム');
  });
});

// Style selection
document.querySelectorAll('.style-card').forEach((card) => {
  card.addEventListener('click', () => {
    document.querySelectorAll('.style-card').forEach((c) => c.classList.remove('selected'));
    card.classList.add('selected');
    const radio = card.querySelector('input[type="radio"]');
    if (radio) {
      radio.checked = true;
      setupData.narrativeStyle = radio.value;
    }
  });
});

// Chip radio groups
document.querySelectorAll('.rule-chip input[type="radio"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    const group = radio.name;
    document.querySelectorAll(`input[name="${group}"]`).forEach((r) => {
      r.closest('.rule-chip').classList.toggle('selected', r === radio);
    });
    if (group === 'diceSystem') setupData.diceSystem = radio.value;
    if (group === 'statsMode') setupData.statsMode = radio.value;
    if (group === 'responseLength') setupData.responseLength = radio.value;
  });
});

$('actionSuggestions').addEventListener('change', (e) => {
  setupData.actionSuggestions = e.target.checked;
});

// Theme presets
document.querySelectorAll('.theme-preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    $('adventure-theme').value = btn.dataset.theme;
    setupData.adventureTheme = btn.dataset.theme;
  });
});

$('adventure-theme').addEventListener('input', (e) => {
  setupData.adventureTheme = e.target.value;
});

// Next / Prev buttons
$('genre-next').addEventListener('click', () => {
  if (!setupData.genre) { showToast('ジャンルを選択してください'); return; }
  if (setupData.genre === 'カスタム') {
    setupData.customSetting = $('custom-setting').value.trim();
  }
  goToStep(1);
});

document.querySelectorAll('.btn-next:not(#genre-next):not(#btn-begin)').forEach((btn) => {
  btn.addEventListener('click', () => goToStep(state.setupStep + 1));
});

document.querySelectorAll('.btn-prev').forEach((btn) => {
  btn.addEventListener('click', () => goToStep(state.setupStep - 1));
});

$('btn-begin').addEventListener('click', async () => {
  setupData.charName = $('char-name').value.trim();
  setupData.charDesc = $('char-desc').value.trim();
  setupData.adventureTheme = $('adventure-theme').value.trim();

  if (!setupData.charName) { showToast('キャラクター名を入力してください'); goToStep(3); return; }

  await beginSession();
});

// ── Start session ─────────────────────────────────────────────────────────────
async function beginSession() {
  showScreen('loading');
  $('loading-text').textContent = 'セッションを初期化中…';

  try {
    // Create session
    const { sessionId } = await api.newSession();
    state.sessionId = sessionId;

    // Patch session with setup data
    await api.patchSession(sessionId, {
      rules: {
        genre: setupData.genre,
        customSetting: setupData.customSetting,
        narrativeStyle: setupData.narrativeStyle,
        diceSystem: setupData.diceSystem,
        statsMode: setupData.statsMode,
        responseLength: setupData.responseLength,
        actionSuggestions: setupData.actionSuggestions,
      },
      world: { adventureTheme: setupData.adventureTheme },
      player: {
        name: setupData.charName,
        characterDescription: setupData.charDesc,
        hp: setupData.statsMode !== 'none' ? 20 : null,
        hpMax: setupData.statsMode !== 'none' ? 20 : null,
        mp: setupData.statsMode === 'hpmp' ? 10 : null,
        mpMax: setupData.statsMode === 'hpmp' ? 10 : null,
      },
    });

    // Transition to game screen and start streaming intro
    showScreen('game');
    initGameScreen();

    $('loading-text').textContent = '世界を構築中…';

    // Fetch session state
    state.session = await api.getSession(sessionId);

    // Show dice button if dice system is active
    if (setupData.diceSystem !== 'none') {
      $('dice-btn-wrap').style.display = 'block';
      $('dice-label').textContent = setupData.diceSystem === 'coc' ? 'd100' : setupData.diceSystem;
    }

    // Stream intro
    const response = await api.setupCompleteStream(sessionId);
    await streamToStory(response, 'gm');

    enableInput();

  } catch (err) {
    showToast(`エラー: ${err.message}`);
    showScreen('setup');
  }
}

// ── Game screen init ──────────────────────────────────────────────────────────
function initGameScreen() {
  $('story-inner').innerHTML = '';
  $('session-info').textContent = `— ${setupData.charName}の物語`;
}

// ── Story rendering ───────────────────────────────────────────────────────────
let currentStreamEntry = null;
let currentCursor = null;

function addStoryEntry(type) {
  // Add divider between entries
  if ($('story-inner').children.length > 0) {
    const div = document.createElement('div');
    div.className = 'story-divider';
    $('story-inner').prepend(div);
  }

  const entry = document.createElement('div');
  entry.className = `story-entry ${type === 'gm' ? 'gm-entry' : 'player-entry'}`;
  $('story-inner').prepend(entry);

  // Scroll to show newest (leftmost) entry
  requestAnimationFrame(() => {
    const scroll = $('story-scroll');
    scroll.scrollLeft = 0;
  });

  return entry;
}

function addPlayerEntry(text) {
  const entry = addStoryEntry('player');
  entry.textContent = text;
  return entry;
}

/**
 * Stream SSE response into a new story entry
 */
async function streamToStory(response, type) {
  const entry = addStoryEntry(type);
  const cursor = document.createElement('span');
  cursor.className = 'streaming-cursor';
  entry.appendChild(cursor);

  currentStreamEntry = entry;
  currentCursor = cursor;

  let fullText = '';

  await api.consumeStream(response, (event) => {
    if (event.type === 'text') {
      fullText += event.chunk;
      // Insert text before cursor
      const textNode = document.createTextNode(event.chunk);
      entry.insertBefore(textNode, cursor);
      // Scroll to keep newest visible
      $('story-scroll').scrollLeft = 0;
    } else if (event.type === 'status') {
      $('loading-text').textContent = event.text;
    } else if (event.type === 'done') {
      cursor.remove();
      currentStreamEntry = null;
      currentCursor = null;
      // Update session stats if provided
      if (event.player && state.session) {
        state.session.player = event.player;
        state.session.turn = event.turn;
      }
    } else if (event.type === 'error') {
      cursor.remove();
      entry.textContent = `⚠️ ${event.message}`;
    }
  });

  return fullText;
}

// ── Input handling ────────────────────────────────────────────────────────────
function enableInput() {
  const input = $('action-input');
  const sendBtn = $('btn-send');
  state.streaming = false;
  input.disabled = false;
  input.focus();
  sendBtn.disabled = input.value.trim().length === 0;
}

function disableInput() {
  const input = $('action-input');
  const sendBtn = $('btn-send');
  state.streaming = true;
  input.disabled = true;
  sendBtn.disabled = true;
}

$('action-input').addEventListener('input', () => {
  $('btn-send').disabled = $('action-input').value.trim().length === 0 || state.streaming;
  // Auto-resize textarea
  const ta = $('action-input');
  ta.style.height = 'auto';
  ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
});

$('action-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    $('btn-send').click();
  }
});

$('btn-send').addEventListener('click', async () => {
  const input = $('action-input');
  const action = input.value.trim();
  if (!action || state.streaming) return;

  input.value = '';
  input.style.height = 'auto';
  $('btn-send').disabled = true;
  disableInput();

  // Show player action
  addPlayerEntry(action);

  try {
    const response = await api.sendAction(state.sessionId, action);
    await streamToStory(response, 'gm');
  } catch (err) {
    showToast(`エラー: ${err.message}`);
  }

  enableInput();
});

// ── Dice ──────────────────────────────────────────────────────────────────────
$('btn-dice').addEventListener('click', async () => {
  try {
    const result = await api.rollDice(state.sessionId, setupData.diceSystem);
    showDicePopup(result);

    // Append dice result to input
    const input = $('action-input');
    const diceNote = `【ダイス: ${result.description}】`;
    if (input.value.trim()) {
      input.value += ` ${diceNote}`;
    } else {
      input.value = diceNote;
    }
    $('btn-send').disabled = false;
    input.focus();
  } catch (err) {
    showToast('ダイスエラー');
  }
});

function showDicePopup(result) {
  // Remove existing popup
  document.querySelector('.dice-popup')?.remove();

  const popup = document.createElement('div');
  popup.className = 'dice-popup';
  popup.innerHTML = `
    <div class="dice-popup-result">${result.result}</div>
    <div class="dice-popup-desc">${result.description}</div>
  `;
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 3000);
}

// ── Rollback ──────────────────────────────────────────────────────────────────
$('btn-rollback').addEventListener('click', async () => {
  if (state.streaming) { showToast('ストリーミング中は使用できません'); return; }
  if (!confirm('最後のターンを巻き戻しますか？')) return;

  try {
    const res = await api.rollback(state.sessionId);
    if (res.ok) {
      // Remove last two entries (player + gm) and their dividers
      const inner = $('story-inner');
      // Entries are prepended, so first children are newest
      let removed = 0;
      while (removed < 2 && inner.firstChild) {
        const child = inner.firstChild;
        inner.removeChild(child);
        if (child.classList && (child.classList.contains('story-entry') || child.classList.contains('story-divider'))) {
          if (child.classList.contains('story-entry')) removed++;
        }
      }
      // Also remove divider if it's first now
      if (inner.firstChild?.classList?.contains('story-divider')) {
        inner.removeChild(inner.firstChild);
      }
      showToast('ターンを巻き戻しました');
    } else {
      showToast(res.error || '巻き戻せません');
    }
  } catch (err) {
    showToast('巻き戻しに失敗しました');
  }
});

// ── Status modal ──────────────────────────────────────────────────────────────
$('btn-status').addEventListener('click', () => openModal('modal-status'));

function renderStatus() {
  const session = state.session;
  if (!session) return;

  const { player, rules, turn } = session;
  let html = `<div class="status-grid">
    <div class="status-item">
      <span class="status-item-label">キャラクター</span>
      <span class="status-item-value">${player?.name || '—'}</span>
    </div>
    <div class="status-item">
      <span class="status-item-label">ターン</span>
      <span class="status-item-value">${turn || 0}</span>
    </div>`;

  if (rules?.statsMode === 'hp' || rules?.statsMode === 'hpmp') {
    const hp = player?.hp ?? 20;
    const hpMax = player?.hpMax ?? 20;
    const hpPct = Math.max(0, Math.min(100, (hp / hpMax) * 100));
    html += `<div class="status-item" style="grid-column: span 2;">
      <span class="status-item-label">HP</span>
      <span class="status-item-value">${hp} / ${hpMax}</span>
      <div class="hp-bar"><div class="hp-fill" style="width:${hpPct}%"></div></div>
    </div>`;
  }

  if (rules?.statsMode === 'hpmp') {
    const mp = player?.mp ?? 10;
    const mpMax = player?.mpMax ?? 10;
    const mpPct = Math.max(0, Math.min(100, (mp / mpMax) * 100));
    html += `<div class="status-item" style="grid-column: span 2;">
      <span class="status-item-label">MP</span>
      <span class="status-item-value">${mp} / ${mpMax}</span>
      <div class="mp-bar"><div class="mp-fill" style="width:${mpPct}%"></div></div>
    </div>`;
  }

  html += `<div class="status-item">
    <span class="status-item-label">ジャンル</span>
    <span class="status-item-value" style="font-size:0.9rem">${rules?.genre || '—'}</span>
  </div>
  <div class="status-item">
    <span class="status-item-label">スタイル</span>
    <span class="status-item-value" style="font-size:0.9rem">${
      rules?.narrativeStyle === 'novel' ? '小説' :
      rules?.narrativeStyle === 'trpg' ? 'TRPG' : 'バランス'
    }</span>
  </div>
  </div>`;

  $('status-content').innerHTML = html;
}

// ── Save modal ────────────────────────────────────────────────────────────────
$('btn-save').addEventListener('click', async () => {
  await refreshSavesList();
  openModal('modal-save');
});

$('btn-do-save').addEventListener('click', async () => {
  const name = $('save-name-input').value.trim();
  try {
    showToast('保存中…');
    await api.saveGame(state.sessionId, name || undefined);
    showToast('セーブしました');
    await refreshSavesList();
    $('save-name-input').value = '';
  } catch (err) {
    showToast('セーブに失敗しました');
  }
});

async function refreshSavesList() {
  const saves = await api.listSaves(state.sessionId);
  const list = $('saves-list');

  if (!saves.length) {
    list.innerHTML = '<p class="saves-empty">セーブデータがありません</p>';
    return;
  }

  list.innerHTML = saves.map((s) => {
    const date = new Date(s.savedAt).toLocaleString('ja-JP', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    return `<div class="save-item">
      <div class="save-item-info">
        <span class="save-item-name">${s.name}</span>
        <span class="save-item-meta">${date} · ターン ${s.turn}</span>
      </div>
      <div class="save-item-actions">
        <button class="btn-load" data-name="${s.name}">ロード</button>
        <button class="btn-delete" data-name="${s.name}">削除</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.btn-load').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(`「${btn.dataset.name}」をロードしますか？`)) return;
      try {
        await api.loadSave(state.sessionId, btn.dataset.name);
        state.session = await api.getSession(state.sessionId);
        showToast('ロードしました');
        closeModal('modal-save');
        // Reload story from history
        rehydrateStoryFromHistory();
      } catch (err) {
        showToast('ロードに失敗しました');
      }
    });
  });

  list.querySelectorAll('.btn-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm(`「${btn.dataset.name}」を削除しますか？`)) return;
      await api.deleteSave(state.sessionId, btn.dataset.name);
      await refreshSavesList();
    });
  });
}

function rehydrateStoryFromHistory() {
  const inner = $('story-inner');
  inner.innerHTML = '';

  if (!state.session?.history) return;

  // History is stored in chronological order; we prepend in reverse so newest is first
  [...state.session.history].reverse().forEach((entry, i, arr) => {
    const type = entry.role === 'assistant' ? 'gm' : 'player';
    const el = document.createElement('div');
    el.className = `story-entry ${type === 'gm' ? 'gm-entry' : 'player-entry'}`;
    el.style.animationDelay = `${i * 30}ms`;
    el.textContent = entry.content;
    inner.appendChild(el);

    if (i < arr.length - 1) {
      const div = document.createElement('div');
      div.className = 'story-divider';
      inner.appendChild(div);
    }
  });

  $('story-scroll').scrollLeft = 0;
  showToast('履歴を復元しました');
}

// ── End session ───────────────────────────────────────────────────────────────
$('btn-end').addEventListener('click', async () => {
  if (!confirm('セッションを終了しますか？')) return;
  await api.deleteSession(state.sessionId);
  state.sessionId = null;
  state.session = null;
  showScreen('landing');
});

// ── Modal helpers ─────────────────────────────────────────────────────────────
function openModal(id) {
  if (id === 'modal-status') renderStatus();
  document.getElementById(id).classList.add('open');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
}

document.querySelectorAll('.modal-close').forEach((btn) => {
  btn.addEventListener('click', () => closeModal(btn.dataset.close));
});

document.querySelectorAll('.modal-overlay').forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeModal(overlay.id);
  });
});

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;

function showToast(msg) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── Init ──────────────────────────────────────────────────────────────────────
function init() {
  showScreen('landing');
  initParticles();

  $('btn-start-journey').addEventListener('click', () => showScreen('setup'));

  // Default style card selection
  document.querySelector('.style-card[data-value="novel"]')?.classList.add('selected');

  // Keyboard shortcut: Escape closes modals
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach((m) => m.classList.remove('open'));
    }
  });
}

init();
