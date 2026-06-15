#!/usr/bin/env node
import { loadConfig } from './config';
import { Scheduler } from './engine/scheduler';
import { SyncEngine } from './engine/sync-engine';
import { createLogger } from './logger';

const USAGE = `directus-sync — migrate a Directus project into Lumibase

Usage:
  directus-sync run                 Run continuously, polling on SYNC_INTERVAL_MS
  directus-sync once                Run a single migration cycle, then exit
  directus-sync schema --dry-run    Print the schema that would be created (no writes)
  directus-sync help                Show this help

Configuration is read from environment / .env (see .env.example).`;

async function main(argv: string[]): Promise<number> {
  const [command = 'help', ...rest] = argv;

  if (command === 'help' || command === '--help' || command === '-h') {
    console.log(USAGE);
    return 0;
  }

  let config;
  try {
    config = loadConfig();
  } catch (err) {
    console.error(String((err as Error).message ?? err));
    return 1;
  }
  const log = createLogger(config.logLevel, 'sync');

  if (command === 'schema' && rest.includes('--dry-run')) {
    const engine = await SyncEngine.create(config, log);
    try {
      await engine.dryRunSchema();
      return 0;
    } finally {
      await engine.close();
    }
  }

  if (command === 'once') {
    const engine = await SyncEngine.create(config, log);
    try {
      await engine.runCycle();
      return 0;
    } catch (err) {
      log.error('cycle failed', err);
      return 1;
    } finally {
      await engine.close();
    }
  }

  if (command === 'run') {
    const engine = await SyncEngine.create(config, log);
    const scheduler = new Scheduler(engine, config.sync.intervalMs, log);
    try {
      await scheduler.start(); // resolves on graceful shutdown
      return 0;
    } finally {
      await engine.close();
      log.info('shutdown complete');
    }
  }

  console.error(`Unknown command: ${command}\n`);
  console.log(USAGE);
  return 1;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error('fatal:', err);
    process.exitCode = 1;
  });
