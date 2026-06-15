import type { AppConfig } from '../config';
import type { Logger } from '../logger';
import { DirectusRestSource } from './rest-source';
import { DirectusDbSource } from './db-source';
import type {
  DirectusCollection,
  DirectusField,
  DirectusFile,
  DirectusFlow,
  DirectusOperation,
  DirectusPermission,
  DirectusRelation,
  DirectusRole,
  DownloadedFile,
  ItemPage,
  ReadItemsOptions,
} from './types';

/**
 * Read-only interface over a Directus instance, implemented by both the REST
 * and DB adapters so the migration engine stays source-agnostic.
 */
export interface DirectusSource {
  /** Identify which primary field marks incremental change for a collection (date_updated/date_created/null). */
  listCollections(): Promise<DirectusCollection[]>;
  listFields(collection?: string): Promise<DirectusField[]>;
  listRelations(): Promise<DirectusRelation[]>;

  readItems(collection: string, options: ReadItemsOptions): Promise<ItemPage>;

  listFiles(sinceIso?: string): Promise<DirectusFile[]>;
  downloadFile(id: string): Promise<DownloadedFile>;

  listFlows(): Promise<DirectusFlow[]>;
  listOperations(): Promise<DirectusOperation[]>;
  listRoles(): Promise<DirectusRole[]>;
  listPermissions(): Promise<DirectusPermission[]>;

  /**
   * Optional: ids of items changed since a timestamp, by collection, derived from
   * directus_activity. Only the DB source implements this; REST returns undefined,
   * signalling the engine to fall back to date_updated filtering.
   */
  changedItemIds?(sinceIso: string, collections: string[]): Promise<Map<string, Set<string>>>;

  close(): Promise<void>;
}

/**
 * Build the source from config. REST is preferred for reads. When a DB URL is also
 * present, the DB source is used only for `changedItemIds` (activity-based incremental),
 * composed onto the REST source.
 */
export async function createDirectusSource(cfg: AppConfig, log: Logger): Promise<DirectusSource> {
  const hasRest = Boolean(cfg.directus.url && cfg.directus.token);
  const hasDb = Boolean(cfg.directus.dbUrl);

  if (hasRest && hasDb) {
    log.info('Directus source: REST (reads) + DB (activity-based incremental)');
    const rest = new DirectusRestSource(cfg.directus.url!, cfg.directus.token!, log.child('directus-rest'));
    const db = await DirectusDbSource.connect(cfg.directus.dbUrl!, log.child('directus-db'));
    return new CompositeSource(rest, db);
  }
  if (hasRest) {
    log.info('Directus source: REST');
    return new DirectusRestSource(cfg.directus.url!, cfg.directus.token!, log.child('directus-rest'));
  }
  log.info('Directus source: DB');
  return DirectusDbSource.connect(cfg.directus.dbUrl!, log.child('directus-db'));
}

/** REST for everything except `changedItemIds`, which the DB source provides. */
class CompositeSource implements DirectusSource {
  constructor(
    private readonly rest: DirectusRestSource,
    private readonly db: DirectusDbSource,
  ) {}

  listCollections() {
    return this.rest.listCollections();
  }
  listFields(collection?: string) {
    return this.rest.listFields(collection);
  }
  listRelations() {
    return this.rest.listRelations();
  }
  readItems(collection: string, options: ReadItemsOptions) {
    return this.rest.readItems(collection, options);
  }
  listFiles(sinceIso?: string) {
    return this.rest.listFiles(sinceIso);
  }
  downloadFile(id: string) {
    return this.rest.downloadFile(id);
  }
  listFlows() {
    return this.rest.listFlows();
  }
  listOperations() {
    return this.rest.listOperations();
  }
  listRoles() {
    return this.rest.listRoles();
  }
  listPermissions() {
    return this.rest.listPermissions();
  }
  changedItemIds(sinceIso: string, collections: string[]) {
    return this.db.changedItemIds(sinceIso, collections);
  }
  async close() {
    await this.db.close();
    await this.rest.close();
  }
}
