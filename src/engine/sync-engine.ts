import type { AppConfig } from '../config';
import { createDirectusSource } from '../directus/source';
import type { DirectusSource } from '../directus/source';
import { LumibaseClient } from '../lumibase/client';
import { SchemaWriter } from '../lumibase/schema-writer';
import type { Logger } from '../logger';
import { migrateFiles } from '../migrate/files';
import { migrateFlows } from '../migrate/flows';
import { migrateItems } from '../migrate/items';
import { migratePermissions } from '../migrate/permissions';
import { migrateSchema } from '../migrate/schema';
import type { MigrationContext } from '../migrate/context';
import { StateStore } from './state-store';

/**
 * Orchestrates one migration cycle in dependency order:
 *   schema → files → items → flows → permissions
 * Each stage persists its own progress; a failure aborts the cycle (state already
 * flushed for completed stages), and the next cycle resumes from the high-water-marks.
 */
export class SyncEngine {
  private constructor(
    private readonly ctx: MigrationContext,
    private readonly source: DirectusSource,
  ) {}

  static async create(cfg: AppConfig, log: Logger): Promise<SyncEngine> {
    const source = await createDirectusSource(cfg, log);
    const lumibase = new LumibaseClient({
      url: cfg.lumibase.url,
      siteId: cfg.lumibase.siteId,
      token: cfg.lumibase.token,
    });
    const schemaWriter = new SchemaWriter(lumibase, log.child('schema'));
    const state = await StateStore.load(cfg.sync.stateFile);

    const ctx: MigrationContext = {
      source,
      lumibase,
      schemaWriter,
      state,
      log,
      scope: cfg.sync.collections,
      flags: {
        schema: cfg.sync.schema,
        files: cfg.sync.files,
        flows: cfg.sync.flows,
        permissions: cfg.sync.permissions,
      },
    };
    return new SyncEngine(ctx, source);
  }

  /** Run a single full cycle. Throws on a stage failure (caller decides retry/exit). */
  async runCycle(): Promise<void> {
    const { log, flags, state } = this.ctx;
    log.info('cycle: start');

    try {
      if (flags.schema) {
        log.debug('cycle: schema');
        await migrateSchema(this.ctx);
        await state.flush();
      }

      log.debug('cycle: items');
      await migrateItems(this.ctx);
      await state.flush();

      if (flags.files) {
        log.debug('cycle: files');
        await migrateFiles(this.ctx);
        await state.flush();
      }

      if (flags.flows) {
        log.debug('cycle: flows');
        await migrateFlows(this.ctx);
        await state.flush();
      }

      if (flags.permissions) {
        log.debug('cycle: permissions');
        await migratePermissions(this.ctx);
        await state.flush();
      }

      log.info('cycle: done');
    } finally {
      // Best-effort persist whatever progress was made, even on failure.
      await state.flush().catch((e) => log.error('failed to flush state', e));
    }
  }

  /** Print the schema that WOULD be created, without writing anything. */
  async dryRunSchema(): Promise<void> {
    await migrateSchema(this.ctx, /*dryRun*/ true);
  }

  async close(): Promise<void> {
    await this.source.close();
  }
}
