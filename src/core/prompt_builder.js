/**
 * Builds the GM system prompt from session state
 */
export function buildSystemPrompt(session) {
  const { rules, world, player } = session;

  // Narrative style instructions
  const styleMap = {
    novel: `あなたは優れた小説家であり、ゲームマスターです。
プレイヤーの行動に対して、文学的で没入感のある三人称視点の物語を紡いでください。
描写は豊かで感情的に深く、登場人物の内面心理や情景の細部を丁寧に描写してください。`,
    trpg: `あなたは公正なゲームマスターです。
プレイヤーの行動に対して、ルールに基づいた明確な結果と状況描写を提供してください。
判定の根拠や選択肢を示し、ゲームの進行を円滑にしてください。`,
    balanced: `あなたは物語とゲームの両面を重視するゲームマスターです。
プレイヤーの行動に対して、没入感のある描写とゲームとしての明確さを両立させてください。`,
  };

  // Response length instructions
  const lengthMap = {
    short: '応答は100〜200文字程度の簡潔なものにしてください。',
    standard: '応答は200〜400文字程度の適度な長さにしてください。',
    long: '応答は400〜700文字程度の豊かな描写を心がけてください。',
  };

  // Dice instructions
  const diceInstructions =
    rules.diceSystem !== 'none'
      ? `判定が必要な場面では「【判定要求】〇〇のダイスを振ってください」と明示し、プレイヤーの出目を物語に反映してください。`
      : `ダイスは使用しません。物語の流れとプレイヤーの選択のみで展開を決定してください。`;

  // Stats instructions
  let statsInstructions = '';
  if (rules.statsMode === 'hp' || rules.statsMode === 'hpmp') {
    statsInstructions = `HP（ヒットポイント）を管理します。戦闘やダメージ描写後に「【HP】現在: X / 最大: Y」の形式で残HPを示してください。`;
    if (rules.statsMode === 'hpmp') {
      statsInstructions += `MP（マジックポイント）も管理します。魔法使用後に「【MP】現在: X / 最大: Y」も示してください。`;
    }
  }

  const genreNote = rules.genre === 'カスタム' && rules.customSetting
    ? `世界観・ルール: ${rules.customSetting}`
    : `ジャンル: ${rules.genre}`;

  const worldNote = world.coreConceptGenerated
    ? `\n世界の核心設定:\n${world.coreConceptGenerated}`
    : world.adventureTheme
    ? `\n冒険テーマ: ${world.adventureTheme}`
    : '';

  const playerNote = `
プレイヤーキャラクター:
- 名前: ${player.name || '不明'}
- 設定: ${player.characterDescription || '特になし'}`;

  const actionSuggest = rules.actionSuggestions
    ? `各応答の末尾に「【行動の選択肢】」として3つの行動案を提示してください（プレイヤーはこれに限定されません）。`
    : '';

  const systemPrompt = `${styleMap[rules.narrativeStyle] || styleMap.balanced}

${genreNote}${worldNote}

${playerNote}

${diceInstructions}
${statsInstructions}
${actionSuggest}

${lengthMap[rules.responseLength] || lengthMap.standard}

重要なルール:
- 常に日本語で応答してください
- プレイヤーキャラクター以外の行動を勝手に決めないでください
- 物語を適切なペースで進め、単調にならないよう工夫してください
- プレイヤーの選択を尊重し、その結果を公正に描写してください
- 応答はMarkdownを使わず、自然な文章で書いてください`;

  return systemPrompt.trim();
}

/**
 * Build intro scene generation prompt
 */
export function buildIntroPrompt(session) {
  const { rules, world, player } = session;

  return `以下の設定でTRPGセッションを開始します。プレイヤーを物語の世界に引き込む、魅力的な導入シーンを書いてください。

ジャンル: ${rules.genre}
${rules.customSetting ? `特別設定: ${rules.customSetting}` : ''}
冒険テーマ: ${world.adventureTheme || '謎めいた冒険'}
プレイヤーキャラクター名: ${player.name}
キャラクター設定: ${player.characterDescription}

導入シーンの要件:
- ${rules.narrativeStyle === 'novel' ? '文学的で没入感のある描写' : rules.narrativeStyle === 'trpg' ? '状況を明確に提示する描写' : '没入感と明確さを兼ねた描写'}
- 場所、時間、雰囲気を鮮やかに描写
- プレイヤーキャラクターが既に何らかの状況にいる形で始める
- ${rules.actionSuggestions ? '末尾に【行動の選択肢】として3つの選択肢を提示' : '物語の続きを選択できる形で終わる'}
- 日本語のみで書くこと（Markdown記法不使用）
- ${rules.responseLength === 'long' ? '400〜600文字' : rules.responseLength === 'short' ? '150〜250文字' : '250〜400文字'}程度`;
}

/**
 * Build world/concept generation prompt for auto-setup
 */
export function buildWorldGenPrompt(session) {
  const { rules, player } = session;
  return `以下の情報からTRPGの世界設定のコアコンセプトを生成してください。

ジャンル: ${rules.genre}
${rules.customSetting ? `特別設定: ${rules.customSetting}` : ''}
冒険テーマ: ${session.world.adventureTheme}
キャラクター: ${player.name} — ${player.characterDescription}

世界のコアコンセプト（200文字以内）として、舞台背景、世界の重要な秘密や課題、プレイヤーキャラクターとの関係を簡潔に記述してください。日本語のみで出力し、Markdown記法は使わないでください。`;
}
