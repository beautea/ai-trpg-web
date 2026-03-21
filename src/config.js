import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
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
    dataDir: path.join(__dirname, '..', 'data', 'chroma'),
  },
  // Server
  port: process.env.PORT || 3000,
  // Paths
  paths: {
    saves: path.join(__dirname, '..', 'data', 'saves'),
    public: path.join(__dirname, '..', 'public'),
  },
};
