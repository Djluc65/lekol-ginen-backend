import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const defaultSqlitePath = resolve(__dirname, '../dev.db');

function required(name, fallback) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env var: ${name}`);
  return v;
}

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || 'development',
  mongoUri: required('MONGODB_URI', 'mongodb://localhost:27017/lekol_ginen'),
  databaseUrl: process.env.DATABASE_URL || `file:${defaultSqlitePath}`,
  jwtSecret: required('JWT_SECRET', 'dev-jwt-secret-change-me'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'dev-jwt-refresh-secret-change-me'),
  jwtTtl: process.env.JWT_TTL || '15m',
  jwtRefreshTtl: process.env.JWT_REFRESH_TTL || '30d',
  corsOrigin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
  rateLimitMax: Number(process.env.RATE_LIMIT_MAX || 120),
  rateLimitWindow: process.env.RATE_LIMIT_WINDOW || '1 minute',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  anthropicModel: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  cloudinaryUrl: process.env.CLOUDINARY_URL || '',
  meilisearchHost: process.env.MEILISEARCH_HOST || 'http://localhost:7700',
  meilisearchKey: process.env.MEILISEARCH_KEY || '',
};
