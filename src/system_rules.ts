/**
 * AIGMへの永続システムルール定義
 * ChromaDBに保存され、全セッション・全ターンで必ずプロンプトに注入される。
 *
 * ルールの追加・変更はこのファイルのみ編集すればよい。
 * id は一意な文字列（変更すると新規エントリとして追加されるため注意）。
 */

export interface SystemRule {
  id: string;
  category: string;
  text: string;
}

export const SYSTEM_RULES: SystemRule[] = [
  // ── フォーマット ──────────────────────────────────────────────────────────
  {
    id: 'fmt_linebreak',
    category: 'formatting',
    text: '文ごとに改行を入れること（1文＝1行）。',
  },
  {
    id: 'fmt_dialogue',
    category: 'formatting',
    text: 'セリフ（「」や『』で囲まれた発言）は必ず独立した行にする。',
  },
  {
    id: 'fmt_paragraph',
    category: 'formatting',
    text: '場面転換・段落の区切りには空行（改行2つ）を使う。',
  },
  {
    id: 'fmt_nohtml',
    category: 'formatting',
    text: 'HTMLタグ・Markdown記法は一切使わない。',
  },
];
