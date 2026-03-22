/**
 * AI TRPG Web — Main App
 */
import * as api from './api.js';

/** HTML特殊文字をエスケープ（XSS防止） */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  sessionId: null,
  session: null,
  streaming: false,
  setupStep: 0,
  totalSteps: 5,
};

// ── Reader settings ───────────────────────────────────────────────────────────
const FONT_SCALES = [0.78, 0.88, 1.0, 1.14, 1.3];
const FONT_LABELS = ['極小', '小', '中', '大', '極大'];

// localStorageから復元。不正値はデフォルトにフォールバック
const readerSettings = (() => {
  const rawIdx = parseInt(localStorage.getItem('reader_fontSizeIdx'), 10);
  const idx = Number.isFinite(rawIdx) && rawIdx >= 0 && rawIdx < FONT_SCALES.length ? rawIdx : 2;
  const mode = localStorage.getItem('reader_writingMode') === 'horizontal' ? 'horizontal' : 'vertical';
  const family = localStorage.getItem('reader_fontFamily') === 'sans' ? 'sans' : 'serif';
  const liteMode = localStorage.getItem('reader_liteMode') === 'true';
  return { fontSizeIdx: idx, writingMode: mode, fontFamily: family, liteMode };
})();

function saveReaderSettings() {
  localStorage.setItem('reader_fontSizeIdx', readerSettings.fontSizeIdx);
  localStorage.setItem('reader_writingMode',  readerSettings.writingMode);
  localStorage.setItem('reader_fontFamily',   readerSettings.fontFamily);
  localStorage.setItem('reader_liteMode',     readerSettings.liteMode);
}

function applyReaderSettings() {
  // CSSカスタムプロパティで文字スケールを反映
  document.documentElement.style.setProperty('--story-font-scale', FONT_SCALES[readerSettings.fontSizeIdx]);
  // game-screenにクラスで書字方向・フォントを反映
  const gameScreen = $('game-screen');
  gameScreen.classList.toggle('horizontal-mode', readerSettings.writingMode === 'horizontal');
  gameScreen.classList.toggle('font-sans',       readerSettings.fontFamily  === 'sans');
  // 軽量モードをhtmlタグに反映（全体のエフェクト制御）
  document.documentElement.classList.toggle('lite-mode', readerSettings.liteMode);
  // 軽量モードではランディング画面のパーティクルも停止、通常モードでは再開
  if (readerSettings.liteMode) {
    particlesCtrl?.stop();
  } else if (screens.landing?.classList.contains('active')) {
    particlesCtrl?.restart();
  }
  // UIの表示状態を同期
  syncReaderUI();
}

function syncReaderUI() {
  $('font-size-label').textContent = FONT_LABELS[readerSettings.fontSizeIdx];
  $('btn-font-smaller').disabled   = readerSettings.fontSizeIdx === 0;
  $('btn-font-larger').disabled    = readerSettings.fontSizeIdx === FONT_SCALES.length - 1;
  $('btn-writing-vertical').classList.toggle('active',   readerSettings.writingMode === 'vertical');
  $('btn-writing-horizontal').classList.toggle('active', readerSettings.writingMode === 'horizontal');
  $('btn-font-serif').classList.toggle('active', readerSettings.fontFamily === 'serif');
  $('btn-font-sans').classList.toggle('active',  readerSettings.fontFamily === 'sans');
  $('btn-effect-full').classList.toggle('active', !readerSettings.liteMode);
  $('btn-effect-lite').classList.toggle('active',  readerSettings.liteMode);
}

// パネルの開閉（btn-readerにも開閉状態を反映）
// ※ $() は line 156 以降に定義されるため、init() 内から呼ぶこと
function toggleReaderPanel(forceClose = false) {
  const panel   = document.getElementById('reader-panel');
  const btn     = document.getElementById('btn-reader');
  const isOpen  = panel.classList.contains('open');
  const willOpen = !forceClose && !isOpen;
  panel.classList.toggle('open', willOpen);
  btn.classList.toggle('panel-open', willOpen);
}

// ── Scroll helper ─────────────────────────────────────────────────────────────
let _scrollPending = false;
function scrollToNewest() {
  if (_scrollPending) return;
  _scrollPending = true;
  requestAnimationFrame(() => {
    const scroll = $('story-scroll');
    if (readerSettings.writingMode === 'horizontal') {
      // 横書き: 最新エントリは下端（append → DOM末尾 = 下）
      scroll.scrollTop = scroll.scrollHeight;
    } else {
      // 縦書き: 最新エントリは左端（prepend → DOM先頭 → 縦書きは右→左方向）
      scroll.scrollLeft = 0;
    }
    _scrollPending = false;
  });
}

// ── Action choices ────────────────────────────────────────────────────────────
/**
 * GMテキストから【行動の選択肢】セクションを解析する
 * LLMの出力バリエーションに広く対応
 * @param {string} text
 * @returns {{ mainText: string, choices: string[] } | null}
 */
function parseChoices(text) {
  // 【行動の選択肢】マーカーを探す（末尾変化も許容）
  const markerIdx = text.search(/【行動[^\n】]*選択肢[^\n】]*】|【選択肢[^\n】]*】/);
  if (markerIdx === -1) return null;

  const mainText = text.slice(0, markerIdx).trim();
  const section  = text.slice(markerIdx);

  let choices = [];

  // 優先①: ①②③ 丸数字形式
  const circled = [...section.matchAll(/[①②③④⑤]([^\n①②③④⑤]+)/g)]
    .map((m) => m[1].replace(/[〔〕【】]/g, '').trim())
    .filter(Boolean);

  if (circled.length >= 2) {
    choices = circled;
  } else {
    // 次点: 「1.」「２．」「1)」などの数字形式（各行）
    const numbered = [...section.matchAll(/^[ 　]*[1-3１-３][.．）)]\s*(.+)/gm)]
      .map((m) => m[1].trim())
      .filter(Boolean);
    if (numbered.length >= 2) choices = numbered;
  }

  if (choices.length === 0) return null;
  // 最大5つに制限
  return { mainText, choices: choices.slice(0, 5) };
}

function showActionChoices(choices) {
  const container = $('action-choices');
  container.innerHTML = '';
  choices.forEach((choice) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = choice;
    btn.addEventListener('click', () => {
      if (state.streaming) return;
      $('action-input').value = choice;
      $('btn-send').disabled = false;
      $('action-input').focus();
      hideActionChoices();
    });
    container.appendChild(btn);
  });
  container.classList.remove('hidden');
}

function hideActionChoices() {
  const container = $('action-choices');
  container.classList.add('hidden');
  container.innerHTML = '';
}

// ── DOM refs ─────────────────────────────────────────────────────────────────
const screens = {
  landing: document.getElementById('landing-screen'),
  setup:   document.getElementById('setup-screen'),
  loading: document.getElementById('loading-screen'),
  game:    document.getElementById('game-screen'),
};

const $ = (id) => document.getElementById(id);

// ── Particles controller ──────────────────────────────────────────────────────
// initParticles() の戻り値を格納。init() で設定される
let particlesCtrl = null;

// ── Screen transitions ────────────────────────────────────────────────────────
function showScreen(name) {
  // ランディング画面から離れる時はパーティクルを停止、戻る時は再開
  if (name === 'landing') {
    particlesCtrl?.restart();
  } else {
    particlesCtrl?.stop();
  }
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
  let W, H, particles, rafId = null;

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
      // 色はあらかじめ文字列で計算して保持（毎フレームのテンプレートリテラル生成を回避）
      color: Math.random() < 0.5
        ? `hsla(270, 70%, 65%, ${(Math.random() * 0.6 + 0.1).toFixed(2)})`
        : `hsla(45, 70%, 65%, ${(Math.random() * 0.6 + 0.1).toFixed(2)})`,
    }));
  }

  function draw() {
    // 背景はCSSで描画するのでcanvasはクリアのみ（毎フレームのグラジェント生成を回避）
    ctx.clearRect(0, 0, W, H);

    particles.forEach((p) => {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.fill();
    });

    rafId = requestAnimationFrame(draw);
  }

  // リサイズイベントをdebounce（連続リサイズ中の過剰処理を防止）
  // 名前付き関数で参照を保持し、destroy 時に確実に解除できるようにする
  let resizeTimer = null;
  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); createParticles(); }, 150);
  };
  window.addEventListener('resize', onResize);

  resize();
  createParticles();
  rafId = requestAnimationFrame(draw);

  // 外部から停止・再開・破棄できるコントローラーを返す
  return {
    stop:    () => { if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; } },
    restart: () => { if (rafId === null) rafId = requestAnimationFrame(draw); },
    destroy: () => {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      window.removeEventListener('resize', onResize);
    },
  };
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

// ── Auto-resume ───────────────────────────────────────────────────────────────

/**
 * localStorageに保存されたセッションIDから前回の続きを復元する
 * @param {string} sessionId
 * @returns {Promise<boolean>} 復元成功可否
 */
async function tryResumeSession(sessionId) {
  try {
    const session = await api.getSession(sessionId);
    // エラーレスポンスまたは未完了セッションは無視
    if (!session || session.error || !session.setupComplete || !session.active) {
      localStorage.removeItem('currentSessionId');
      return false;
    }

    state.sessionId = sessionId;
    state.session = session;

    // setupDataをセッション状態から復元（ステータスモーダル等で使用）
    Object.assign(setupData, {
      genre: session.rules.genre,
      customSetting: session.rules.customSetting,
      narrativeStyle: session.rules.narrativeStyle,
      diceSystem: session.rules.diceSystem,
      statsMode: session.rules.statsMode,
      responseLength: session.rules.responseLength,
      actionSuggestions: session.rules.actionSuggestions,
      charName: session.player.name,
      charDesc: session.player.characterDescription,
      adventureTheme: session.world.adventureTheme,
    });

    // ゲーム画面を準備
    $('story-inner').innerHTML = '';
    $('session-info').textContent = `— ${session.player.name}の物語`;

    if (session.rules.diceSystem !== 'none') {
      $('dice-btn-wrap').style.display = 'block';
      $('dice-label').textContent = session.rules.diceSystem === 'coc' ? 'd100' : session.rules.diceSystem;
    }

    showScreen('game');
    rehydrateStoryFromHistory(false); // トーストなしで復元
    enableInput();
    showToast('前回のセッションを再開しました');
    return true;
  } catch {
    localStorage.removeItem('currentSessionId');
    return false;
  }
}

// ── Start session ─────────────────────────────────────────────────────────────
async function beginSession() {
  showScreen('loading');
  $('loading-text').textContent = 'セッションを初期化中…';

  try {
    // Create session
    const { sessionId } = await api.newSession();
    state.sessionId = sessionId;
    // セッションIDをlocalStorageに保存（ページリロード対応）
    localStorage.setItem('currentSessionId', sessionId);

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
  const inner = $('story-inner');
  const isHorizontal = readerSettings.writingMode === 'horizontal';

  // Add divider between entries
  if (inner.children.length > 0) {
    const div = document.createElement('div');
    div.className = 'story-divider';
    if (isHorizontal) inner.append(div); else inner.prepend(div);
  }

  const entry = document.createElement('div');
  entry.className = `story-entry ${type === 'gm' ? 'gm-entry' : 'player-entry'}`;
  if (isHorizontal) inner.append(entry); else inner.prepend(entry);

  // Scroll to show newest entry
  requestAnimationFrame(() => scrollToNewest());

  return entry;
}

function addPlayerEntry(text) {
  const entry = addStoryEntry('player');
  entry.textContent = text;
  return entry;
}

/**
 * Stream SSE response into a new story entry.
 * 【行動の選択肢】セクションはストリーミング中も表示せず、
 * 生成完了後にボタンとして表示する。
 */
async function streamToStory(response, type) {
  const entry = addStoryEntry(type);
  const cursor = document.createElement('span');
  cursor.className = 'streaming-cursor';
  entry.appendChild(cursor);

  currentStreamEntry = entry;
  currentCursor = cursor;

  let fullText = '';
  let choicesFound = false; // 選択肢マーカー検出フラグ
  let doneReceived = false;  // サーバーから done イベントを受け取ったか

  try {
    await api.consumeStream(response, (event) => {
      if (event.type === 'text') {
        const prevLen = fullText.length;
        fullText += event.chunk;

        if (!choicesFound) {
          const markerIdx = fullText.search(/【行動[^\n】]*選択肢[^\n】]*】|【選択肢[^\n】]*】/);

          if (markerIdx === -1) {
            // マーカーなし：チャンクをそのままDOM追加
            entry.insertBefore(document.createTextNode(event.chunk), cursor);
          } else {
            // マーカー検出：マーカー以前の部分だけをDOMに反映
            choicesFound = true;
            if (markerIdx >= prevLen) {
              // マーカーが今回のチャンク内に出現：チャンクの手前部分だけ追加
              const visiblePart = event.chunk.slice(0, markerIdx - prevLen);
              if (visiblePart) {
                entry.insertBefore(document.createTextNode(visiblePart), cursor);
              }
            } else {
              // マーカーが複数チャンクにまたがって出現：既存ノードを整理
              while (entry.firstChild && entry.firstChild !== cursor) {
                entry.removeChild(entry.firstChild);
              }
              const mainSoFar = fullText.slice(0, markerIdx).trimEnd();
              if (mainSoFar) {
                entry.insertBefore(document.createTextNode(mainSoFar), cursor);
              }
            }
          }
        }
        // choicesFound === true の場合はDOMを更新しない（fullTextには蓄積）

        scrollToNewest();
      } else if (event.type === 'status') {
        $('loading-text').textContent = event.text;
      } else if (event.type === 'done') {
        doneReceived = true;
        cursor.remove();
        currentStreamEntry = null;
        currentCursor = null;
        // セッション統計を更新
        if (event.player && state.session) {
          state.session.player = event.player;
          state.session.turn = event.turn;
        }
        // 生成完了後に選択肢を解析してボタン表示
        if (type === 'gm') {
          const parsed = parseChoices(fullText);
          if (parsed) {
            entry.textContent = parsed.mainText;
            showActionChoices(parsed.choices);
          }
        }
      } else if (event.type === 'error') {
        doneReceived = true; // エラーも終了扱い
        cursor.remove();
        entry.textContent = `⚠️ ${event.message}`;
      }
    });
  } finally {
    // done/error を受け取らずにストリームが切れた場合の後始末
    if (!doneReceived) {
      cursor.remove();
      currentStreamEntry = null;
      currentCursor = null;
    }
  }

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
  hideActionChoices();

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

  // innerHTML を使わず DOM 構築（XSS防止）
  const popup = document.createElement('div');
  popup.className = 'dice-popup';

  const resultEl = document.createElement('div');
  resultEl.className = 'dice-popup-result';
  resultEl.textContent = result.result;

  const descEl = document.createElement('div');
  descEl.className = 'dice-popup-desc';
  descEl.textContent = result.description;

  popup.appendChild(resultEl);
  popup.appendChild(descEl);
  document.body.appendChild(popup);
  setTimeout(() => popup.remove(), 3000);
}

// ── Rollback ──────────────────────────────────────────────────────────────────
$('btn-rollback').addEventListener('click', async () => {
  if (state.streaming) { showToast('ストリーミング中は使用できません'); return; }
  if (!await showConfirm('最後のターンを巻き戻しますか？', { ok: '巻き戻す' })) return;
  hideActionChoices();

  try {
    await api.rollback(state.sessionId);
    // Remove last two entries (player + gm) and their dividers
    const inner = $('story-inner');
    const isHorizontal = readerSettings.writingMode === 'horizontal';
    // 縦書き: 最新エントリはfirstChild、横書き: 最新エントリはlastChild
    const getNewest = () => isHorizontal ? inner.lastChild : inner.firstChild;
    let removed = 0;
    while (removed < 2 && getNewest()) {
      const child = getNewest();
      inner.removeChild(child);
      if (child.classList && (child.classList.contains('story-entry') || child.classList.contains('story-divider'))) {
        if (child.classList.contains('story-entry')) removed++;
      }
    }
    // Also remove dangling divider at the newest end
    const edge = getNewest();
    if (edge?.classList?.contains('story-divider')) {
      inner.removeChild(edge);
    }
    showToast('ターンを巻き戻しました');
  } catch (err) {
    // サーバーから返るエラーメッセージ（「巻き戻せる履歴がありません」等）を表示
    showToast(err.message || '巻き戻しに失敗しました');
  }
});

// ── Status modal ──────────────────────────────────────────────────────────────
$('btn-status').addEventListener('click', () => openModal('modal-status'));

function renderStatus() {
  const session = state.session;
  if (!session) return;

  const { player, rules, turn } = session;
  // ユーザー入力値は escapeHtml でサニタイズ（XSS防止）
  let html = `<div class="status-grid">
    <div class="status-item">
      <span class="status-item-label">キャラクター</span>
      <span class="status-item-value">${escapeHtml(player?.name || '—')}</span>
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
    <span class="status-item-value" style="font-size:0.9rem">${escapeHtml(rules?.genre || '—')}</span>
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

  // s.name はユーザー入力由来のため escapeHtml でサニタイズ（XSS・属性インジェクション防止）
  // data-name 属性のエスケープはブラウザが自動でデコードするため API 呼び出し時は元の値が復元される
  list.innerHTML = saves.map((s) => {
    const date = new Date(s.savedAt).toLocaleString('ja-JP', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
    const safeName = escapeHtml(s.name);
    return `<div class="save-item">
      <div class="save-item-info">
        <span class="save-item-name">${safeName}</span>
        <span class="save-item-meta">${date} · ターン ${s.turn}</span>
      </div>
      <div class="save-item-actions">
        <button class="btn-load" data-name="${safeName}">ロード</button>
        <button class="btn-delete" data-name="${safeName}">削除</button>
      </div>
    </div>`;
  }).join('');

  list.querySelectorAll('.btn-load').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!await showConfirm(`「${btn.dataset.name}」をロードしますか？`, { ok: 'ロードする' })) return;
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
      if (!await showConfirm(`「${btn.dataset.name}」を削除しますか？`, { ok: '削除する', danger: true })) return;
      try {
        await api.deleteSave(state.sessionId, btn.dataset.name);
        await refreshSavesList();
      } catch {
        showToast('削除に失敗しました');
      }
    });
  });
}

/**
 * セッション履歴からストーリー表示を再構築
 * @param {boolean} showNotification - トースト通知を表示するか（デフォルトtrue）
 */
function rehydrateStoryFromHistory(showNotification = true) {
  const inner = $('story-inner');
  inner.innerHTML = '';
  hideActionChoices();

  if (!state.session?.history) return;

  const isHorizontal = readerSettings.writingMode === 'horizontal';
  // 縦書き: 逆順でappend（最新が先頭＝左端）、横書き: 時系列順でappend（最新が末尾＝下端）
  const ordered = isHorizontal
    ? [...state.session.history]
    : [...state.session.history].reverse();

  ordered.forEach((entry, i, arr) => {
    const type = entry.role === 'assistant' ? 'gm' : 'player';
    const el = document.createElement('div');
    el.className = `story-entry ${type === 'gm' ? 'gm-entry' : 'player-entry'}`;
    el.style.animationDelay = `${i * 30}ms`;

    // 最新エントリのインデックス（縦書き: 0、横書き: arr.length-1）
    const newestIdx = isHorizontal ? arr.length - 1 : 0;

    if (type === 'gm') {
      const parsed = parseChoices(entry.content);
      if (parsed) {
        // 選択肢テキストは常に除去して本文のみ表示
        el.textContent = parsed.mainText;
        // 最新GMエントリかつ直後にユーザー応答がない場合のみボタン表示
        if (i === newestIdx) {
          requestAnimationFrame(() => showActionChoices(parsed.choices));
        }
      } else {
        el.textContent = entry.content;
      }
    } else {
      el.textContent = entry.content;
    }

    inner.appendChild(el);

    if (i < arr.length - 1) {
      const div = document.createElement('div');
      div.className = 'story-divider';
      inner.appendChild(div);
    }
  });

  scrollToNewest();
  if (showNotification) showToast('履歴を復元しました');
}

// ── Logout ────────────────────────────────────────────────────────────────────
const btnLogout = $('btn-logout');
if (window.AUTH_REQUIRED) {
  btnLogout.style.display = '';
  btnLogout.addEventListener('click', async () => {
    if (!await showConfirm('ログアウトしますか？', { ok: 'ログアウト', danger: true })) return;
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  });
}

// ── End session ───────────────────────────────────────────────────────────────
$('btn-end').addEventListener('click', async () => {
  if (!await showConfirm('セッションを終了しますか？', { ok: '終了する', danger: true })) return;
  try {
    await api.deleteSession(state.sessionId);
  } catch {
    // サーバー側削除が失敗してもローカルをクリアして画面遷移（ユーザー操作を妨げない）
  }
  // セッション終了時はlocalStorageをクリア
  localStorage.removeItem('currentSessionId');
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

// ── Confirm dialog ────────────────────────────────────────────────────────────
/**
 * ネイティブ confirm() の代替。スタイル付きモーダルでユーザーに確認を求める。
 * @param {string} message
 * @param {{ ok?: string, cancel?: string, danger?: boolean }} options
 * @returns {Promise<boolean>}
 */
function showConfirm(message, { ok = '実行する', cancel = 'キャンセル', danger = false } = {}) {
  return new Promise((resolve) => {
    const overlay   = document.getElementById('modal-confirm');
    const msgEl     = document.getElementById('confirm-message');
    const okBtn     = document.getElementById('btn-confirm-ok');
    const cancelBtn = document.getElementById('btn-confirm-cancel');

    msgEl.textContent    = message;
    okBtn.textContent    = ok;
    cancelBtn.textContent = cancel;
    okBtn.classList.toggle('btn-confirm-danger', danger);
    overlay.classList.add('open');

    function close(result) {
      overlay.classList.remove('open');
      resolve(result);
    }

    okBtn.addEventListener('click',    () => close(true),  { once: true });
    cancelBtn.addEventListener('click', () => close(false), { once: true });
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(false);
    }, { once: true });
  });
}

// ── Toast ─────────────────────────────────────────────────────────────────────
let toastTimer = null;

function showToast(msg) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── Reader settings: イベント登録（init()から呼ぶ） ──────────────────────────
function initReaderPanel() {
  // 表示設定パネルの開閉
  $('btn-reader').addEventListener('click', () => toggleReaderPanel());

  // 文字サイズ
  $('btn-font-smaller').addEventListener('click', () => {
    if (readerSettings.fontSizeIdx > 0) {
      readerSettings.fontSizeIdx--;
      applyReaderSettings();
      saveReaderSettings();
    }
  });
  $('btn-font-larger').addEventListener('click', () => {
    if (readerSettings.fontSizeIdx < FONT_SCALES.length - 1) {
      readerSettings.fontSizeIdx++;
      applyReaderSettings();
      saveReaderSettings();
    }
  });

  // 書字方向
  $('btn-writing-vertical').addEventListener('click', () => {
    if (readerSettings.writingMode !== 'vertical') {
      readerSettings.writingMode = 'vertical';
      applyReaderSettings();
      saveReaderSettings();
      scrollToNewest();
    }
  });
  $('btn-writing-horizontal').addEventListener('click', () => {
    if (readerSettings.writingMode !== 'horizontal') {
      readerSettings.writingMode = 'horizontal';
      applyReaderSettings();
      saveReaderSettings();
      scrollToNewest();
    }
  });

  // フォント
  $('btn-font-serif').addEventListener('click', () => {
    if (readerSettings.fontFamily !== 'serif') {
      readerSettings.fontFamily = 'serif';
      applyReaderSettings();
      saveReaderSettings();
    }
  });
  $('btn-font-sans').addEventListener('click', () => {
    if (readerSettings.fontFamily !== 'sans') {
      readerSettings.fontFamily = 'sans';
      applyReaderSettings();
      saveReaderSettings();
    }
  });

  // エフェクト（軽量モード）
  $('btn-effect-full').addEventListener('click', () => {
    if (readerSettings.liteMode) {
      readerSettings.liteMode = false;
      applyReaderSettings();
      saveReaderSettings();
    }
  });
  $('btn-effect-lite').addEventListener('click', () => {
    if (!readerSettings.liteMode) {
      readerSettings.liteMode = true;
      applyReaderSettings();
      saveReaderSettings();
    }
  });

  // パネル外クリックで閉じる
  document.addEventListener('click', (e) => {
    if (!$('reader-panel').classList.contains('open')) return;
    if ($('btn-reader').contains(e.target)) return;
    if ($('reader-panel').contains(e.target)) return;
    toggleReaderPanel(true);
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  particlesCtrl = initParticles();
  // 表示設定を読み込んで反映
  applyReaderSettings();
  // 表示設定パネルのイベントを登録
  initReaderPanel();

  $('btn-start-journey').addEventListener('click', () => showScreen('setup'));

  // デフォルトスタイルカードを選択状態にする
  document.querySelector('.style-card[data-value="novel"]')?.classList.add('selected');

  // Escキーでモーダルを閉じる / リーダーパネルを閉じる
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.open').forEach((m) => m.classList.remove('open'));
      toggleReaderPanel(true);
    }
  });

  // ページリロード時の自動再開: localStorageにセッションIDが残っていれば復元を試みる
  const savedSessionId = localStorage.getItem('currentSessionId');
  if (savedSessionId) {
    showScreen('loading');
    $('loading-text').textContent = 'セッションを復元中…';
    const resumed = await tryResumeSession(savedSessionId);
    if (!resumed) showScreen('landing');
  } else {
    showScreen('landing');
  }
}

init();
