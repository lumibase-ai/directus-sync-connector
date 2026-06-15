import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

/** zod-validated configuration, sourced from environment variables (.env supported). */

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : /^(1|true|yes|on)$/i.test(v.trim())));

const ConfigSchema = z
  .object({
    directus: z.object({
      url: z.string().url().optional(),
      token: z.string().min(1).optional(),
      dbUrl: z.string().min(1).optional(),
    }),
    lumibase: z.object({
      url: z.string().url(),
      siteId: z.string().min(1),
      token: z.string().min(1),
    }),
    sync: z.object({
      intervalMs: z.coerce.number().int().positive().default(30_000),
      collections: z
        .string()
        .default('*')
        .transform((s) => (s.trim() === '*' ? '*' : s.split(',').map((c) => c.trim()).filter(Boolean))),
      schema: boolish.default(false),
      files: boolish.default(true),
      flows: boolish.default(true),
      permissions: boolish.default(true),
      stateFile: z.string().default('./.sync-state.json'),
    }),
    logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  })
  .superRefine((cfg, ctx) => {
    // At least one Directus read path must be configured.
    const hasRest = Boolean(cfg.directus.url && cfg.directus.token);
    const hasDb = Boolean(cfg.directus.dbUrl);
    if (!hasRest && !hasDb) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'No Directus source configured: set DIRECTUS_URL + DIRECTUS_TOKEN (REST) and/or DIRECTUS_DB_URL (DB).',
        path: ['directus'],
      });
    }
  });

export type AppConfig = z.infer<typeof ConfigSchema>;
export type CollectionScope = AppConfig['sync']['collections'];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  loadDotenv();
  // Treat blank env vars as absent so partially-filled .env files don't produce
  // confusing per-field "invalid" errors; optional fields fall back cleanly.
  const v = (key: keyof NodeJS.ProcessEnv): string | undefined => {
    const raw = env[key];
    if (raw === undefined) return undefined;
    const trimmed = raw.trim();
    return trimmed === '' ? undefined : trimmed;
  };

  const raw = {
    directus: {
      url: v('DIRECTUS_URL'),
      token: v('DIRECTUS_TOKEN'),
      dbUrl: v('DIRECTUS_DB_URL'),
    },
    lumibase: {
      url: v('LUMIBASE_URL'),
      siteId: v('LUMIBASE_SITE_ID'),
      token: v('LUMIBASE_TOKEN'),
    },
    sync: {
      intervalMs: v('SYNC_INTERVAL_MS'),
      collections: v('SYNC_COLLECTIONS'),
      schema: v('SYNC_SCHEMA'),
      files: v('SYNC_FILES'),
      flows: v('SYNC_FLOWS'),
      permissions: v('SYNC_PERMISSIONS'),
      stateFile: v('STATE_FILE'),
    },
    logLevel: v('LOG_LEVEL'),
  };

  const parsed = ConfigSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  return parsed.data;
}

/** True if the named collection is in scope for syncing. */
export function isCollectionInScope(scope: CollectionScope, collection: string): boolean {
  return scope === '*' || scope.includes(collection);
}
