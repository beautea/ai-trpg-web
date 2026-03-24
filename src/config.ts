import path from 'path';

// process.cwd() はサーバー起動ディレクトリ（プロジェクトルート）を指す
// dev (tsx server.ts) / prod (node dist/server.js) 両方でルートから正しく解決する
const ROOT = process.cwd();

interface AppConfig {
  llm: {
    model: string;
    maxTokens: number;
    temperature: number;
    maxHistoryTurns: number;
  };
  chroma: {
    url: string;
    port: number;
    dataDir: string;
  };
  port: string | number;
  paths: {
    saves: string;
    public: string;
  };
}

export const config: AppConfig = {
  // LLM
  llm: {
    model: 'claude-sonnet-4-6',
    maxTokens: 1024,
    temperature: 0.85,
    maxHistoryTurns: 30,
  },
  // ChromaDB
  chroma: {
    url: process.env.CHROMA_URL || 'http://localhost:8001',
    port: 8001,
    dataDir: path.join(ROOT, 'data', 'chroma'),
  },
  // Server
  port: process.env.PORT || 3000,
  // Paths
  paths: {
    saves: path.join(ROOT, 'data', 'saves'),
    public: path.join(ROOT, 'public'),
  },
};
