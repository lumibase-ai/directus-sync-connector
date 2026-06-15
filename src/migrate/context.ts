import type { CollectionScope } from '../config';
import type { DirectusSource } from '../directus/source';
import type { StateStore } from '../engine/state-store';
import type { LumibaseClient } from '../lumibase/client';
import type { SchemaWriter } from '../lumibase/schema-writer';
import type { Logger } from '../logger';

/** Shared dependencies threaded through every migration stage. */
export interface MigrationContext {
  source: DirectusSource;
  lumibase: LumibaseClient;
  schemaWriter: SchemaWriter;
  state: StateStore;
  log: Logger;
  scope: CollectionScope;
  flags: {
    schema: boolean;
    files: boolean;
    flows: boolean;
    permissions: boolean;
  };
}

/** A monotonic ISO timestamp for "now", captured once per cycle as the new mark. */
export function nowIso(): string {
  return new Date().toISOString();
}
