/**
 * ストーリー表示: エントリ追加・ストリーミング・履歴再構築・行動選択肢
 */
import * as api from './api.js';
import type { SSEEvent } from '../../src/types.js';
import { $, showToast } from './utils.js';
import { state } from './state.js';
import { readerSettings, scrollToNewest } from './reader.js';

// ── Action choices ────────────────────────────────────────────────────────────

/**
 * GMテキストから【行動の選択肢】セクションを解析する
 * LLMの出力バリエーションに広く対応
 */
export function parseChoices(text: string): { mainText: string; choices: string[] } | null {
  // 【行動の選択肢】マーカーを探す（末尾変化も許容）
  const markerIdx = text.search(/【行動[^\n】]*選択肢[^\n】]*】|【選択肢[^\n】]*】/);
  if (markerIdx === -1) return null;

  const mainText = text.slice(0, markerIdx).trim();
  const section  = text.slice(markerIdx);

  let choices: string[] = [];

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

export function showActionChoices(choices: string[]): void {
  const container = $('action-choices');
  container.innerHTML = '';
  choices.forEach((choice) => {
    const btn = document.createElement('button');
    btn.className = 'choice-btn';
    btn.textContent = choice;
    btn.addEventListener('click', () => {
      if (state.streaming) return;
      ($('action-input') as HTMLInputElement).value = choice;
      ($('btn-send') as HTMLButtonElement).disabled = false;
      ($('action-input') as HTMLInputElement).focus();
      hideActionChoices();
    });
    container.appendChild(btn);
  });
  container.classList.remove('hidden');
}

export function hideActionChoices(): void {
  const container = $('action-choices');
  container.classList.add('hidden');
  container.innerHTML = '';
}

// ── Story rendering ───────────────────────────────────────────────────────────

let currentStreamEntry: HTMLElement | null = null;
let currentCursor: HTMLElement | null = null;

export function addStoryEntry(type: string): HTMLElement {
  const inner = $('story-inner');
  const isHorizontal = readerSettings.writingMode === 'horizontal';

  // エントリ間にセパレータを追加
  if (inner.children.length > 0) {
    const div = document.createElement('div');
    div.className = 'story-divider';
    if (isHorizontal) inner.append(div); else inner.prepend(div);
  }

  const entry = document.createElement('div');
  entry.className = `story-entry ${type === 'gm' ? 'gm-entry' : 'player-entry'}`;
  if (isHorizontal) inner.append(entry); else inner.prepend(entry);

  requestAnimationFrame(() => scrollToNewest());
  return entry;
}

export function addPlayerEntry(text: string): HTMLElement {
  const entry = addStoryEntry('player');
  entry.textContent = text;
  return entry;
}

/**
 * SSEレスポンスをストーリーエントリにストリーミング表示する。
 * 【行動の選択肢】セクションはストリーミング中は表示せず、生成完了後にボタンとして表示する。
 */
export async function streamToStory(response: Response, type: string): Promise<string> {
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
    await api.consumeStream(response, (event: SSEEvent) => {
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
          state.session.turn = event.turn ?? state.session.turn;
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

/**
 * セッション履歴からストーリー表示を再構築する
 */
export function rehydrateStoryFromHistory(showNotification = true): void {
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
