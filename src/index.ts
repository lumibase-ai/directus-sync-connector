/** Programmatic entry point for embedding the connector in another process. */

export { loadConfig, isCollectionInScope } from './config';
export type { AppConfig, CollectionScope } from './config';
export { createLogger } from './logger';
export type { Logger, LogLevel } from './logger';
export { SyncEngine } from './engine/sync-engine';
export { Scheduler } from './engine/scheduler';
export { StateStore } from './engine/state-store';
export { LumibaseClient, queryToParams } from './lumibase/client';
export { LumibaseError } from './lumibase/errors';
export { createDirectusSource } from './directus/source';
export type { DirectusSource } from './directus/source';
export { RelationIndex } from './mapping/relation-index';
export { mapItem } from './mapping/item-map';
export { mapCollection, mapField, primaryKeyField } from './mapping/schema-map';
