import 'dotenv/config';

export interface Config {
  port: number;
  corsOrigins: string[];
  editorToken: string;
  adminToken: string;
  rateLimitGeneralPerMin: number;
  rateLimitWritesPerMin: number;
  nodeEnv: string;
  databaseUrl?: string;
}

function parseList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function loadConfig(overrides: Partial<Config> = {}): Config {
  const corsOrigins = parseList(process.env.CORS_ORIGINS);
  const config: Config = {
    port: parsePositiveInt(process.env.PORT, 4000),
    corsOrigins: corsOrigins.length > 0 ? corsOrigins : ['http://localhost:5173'],
    editorToken: process.env.DEMO_EDITOR_TOKEN || 'demo-editor',
    adminToken: process.env.DEMO_ADMIN_TOKEN || 'demo-admin',
    rateLimitGeneralPerMin: parsePositiveInt(process.env.RATE_LIMIT_GENERAL_PER_MIN, 120),
    rateLimitWritesPerMin: parsePositiveInt(process.env.RATE_LIMIT_WRITES_PER_MIN, 20),
    nodeEnv: process.env.NODE_ENV || 'development',
    databaseUrl: process.env.DATABASE_URL || undefined,
  };
  return { ...config, ...overrides };
}
