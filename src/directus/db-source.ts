import type { Logger } from '../logger';
import type { DirectusSource } from './source';
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

/** Minimal query interface both pg and mysql2 are adapted to. */
interface DbDriver {
  query(sql: string, params: unknown[]): Promise<Record<string, unknown>[]>;
  end(): Promise<void>;
  /** '$1','$2' for pg; '?' for mysql. */
  placeholder(index: number): string;
}

/**
 * Directus DB adapter. Reads directus_* system tables directly.
 *
 * Its primary role in the composite setup is `changedItemIds` — activity-based
 * incremental detection for user collections that lack a date_updated field.
 * The driver (pg / mysql2) is lazy-imported so REST-only installs don't need it.
 */
export class DirectusDbSource implements DirectusSource {
  private constructor(
    private readonly driver: DbDriver,
    private readonly log: Logger,
  ) {}

  static async connect(dbUrl: string, log: Logger): Promise<DirectusDbSource> {
    const driver = await openDriver(dbUrl, log);
    return new DirectusDbSource(driver, log);
  }

  async changedItemIds(sinceIso: string, collections: string[]): Promise<Map<string, Set<string>>> {
    const result = new Map<string, Set<string>>();
    if (collections.length === 0) return result;

    const ph = (i: number) => this.driver.placeholder(i);
    const inList = collections.map((_, i) => ph(i + 2)).join(', ');
    const sql =
      `SELECT collection, item FROM directus_activity ` +
      `WHERE timestamp > ${ph(1)} AND collection IN (${inList}) ` +
      `AND action IN ('create', 'update')`;

    const rows = await this.driver.query(sql, [sinceIso, ...collections]);
    for (const row of rows) {
      const collection = String(row.collection);
      const item = row.item == null ? null : String(row.item);
      if (!item) continue;
      if (!result.has(collection)) result.set(collection, new Set());
      result.get(collection)!.add(item);
    }
    return result;
  }

  async listCollections(): Promise<DirectusCollection[]> {
    const rows = await this.driver.query(
      `SELECT collection, icon, note, hidden, singleton, archive_field, archive_value, sort_field ` +
        `FROM directus_collections WHERE collection NOT LIKE 'directus_%'`,
      [],
    );
    return rows.map((r) => ({
      collection: String(r.collection),
      meta: {
        icon: (r.icon as string) ?? null,
        note: (r.note as string) ?? null,
        hidden: Boolean(r.hidden),
        singleton: Boolean(r.singleton),
        archive_field: (r.archive_field as string) ?? null,
        archive_value: (r.archive_value as string) ?? null,
        sort_field: (r.sort_field as string) ?? null,
      },
      schema: { name: String(r.collection) },
    }));
  }

  async listFields(collection?: string): Promise<DirectusField[]> {
    const where = collection
      ? `collection = ${this.driver.placeholder(1)}`
      : `collection NOT LIKE 'directus_%'`;
    const rows = await this.driver.query(
      `SELECT collection, field, type, interface, options, display, readonly, hidden, sort, width, note, special ` +
        `FROM directus_fields WHERE ${where}`,
      collection ? [collection] : [],
    );
    return rows.map((r) => ({
      collection: String(r.collection),
      field: String(r.field),
      type: String(r.type ?? 'unknown'),
      meta: {
        interface: (r.interface as string) ?? null,
        options: parseJson(r.options),
        display: (r.display as string) ?? null,
        readonly: Boolean(r.readonly),
        hidden: Boolean(r.hidden),
        sort: (r.sort as number) ?? null,
        width: (r.width as string) ?? null,
        note: (r.note as string) ?? null,
        special: (parseJson(r.special) as unknown as string[] | null) ?? null,
      },
      schema: null,
    }));
  }

  async listRelations(): Promise<DirectusRelation[]> {
    const rows = await this.driver.query(
      `SELECT many_collection, many_field, one_collection, one_field, junction_field, sort_field ` +
        `FROM directus_relations WHERE many_collection NOT LIKE 'directus_%'`,
      [],
    );
    return rows.map((r) => ({
      collection: String(r.many_collection),
      field: String(r.many_field),
      related_collection: r.one_collection ? String(r.one_collection) : null,
      meta: {
        one_field: (r.one_field as string) ?? null,
        junction_field: (r.junction_field as string) ?? null,
        sort_field: (r.sort_field as string) ?? null,
      },
      schema: null,
    }));
  }

  // The DB source does not read user-table rows itself in this build; the REST
  // source is the read path. Standalone DB reads would require dynamic table
  // introspection — out of scope here. Returns empty so the engine degrades safely.
  async readItems(_collection: string, _options: ReadItemsOptions): Promise<ItemPage> {
    this.log.warn(
      'DB source readItems is not implemented (use a REST source for item reads). Returning empty page.',
    );
    return { items: [], hasMore: false };
  }

  async listFiles(sinceIso?: string): Promise<DirectusFile[]> {
    const ph = this.driver.placeholder(1);
    const sql =
      `SELECT id, filename_download, title, type, folder, filesize, modified_on, uploaded_on ` +
      `FROM directus_files` +
      (sinceIso ? ` WHERE modified_on > ${ph}` : '');
    const rows = await this.driver.query(sql, sinceIso ? [sinceIso] : []);
    return rows.map((r) => ({
      id: String(r.id),
      filename_download: String(r.filename_download),
      title: (r.title as string) ?? null,
      type: (r.type as string) ?? null,
      folder: r.folder ? String(r.folder) : null,
      filesize: (r.filesize as number) ?? null,
      modified_on: (r.modified_on as string) ?? null,
      uploaded_on: (r.uploaded_on as string) ?? null,
    }));
  }

  async downloadFile(_id: string): Promise<DownloadedFile> {
    throw new Error('DB source cannot download asset bytes; configure a REST source for files.');
  }

  async listFlows(): Promise<DirectusFlow[]> {
    const rows = await this.driver.query(
      `SELECT id, name, icon, color, description, status, trigger, accountability, options FROM directus_flows`,
      [],
    );
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      icon: (r.icon as string) ?? null,
      color: (r.color as string) ?? null,
      description: (r.description as string) ?? null,
      status: (r.status as string) ?? null,
      trigger: (r.trigger as string) ?? null,
      accountability: (r.accountability as string) ?? null,
      options: parseJson(r.options),
    }));
  }

  async listOperations(): Promise<DirectusOperation[]> {
    const rows = await this.driver.query(
      `SELECT id, name, "key", type, position_x, position_y, options, resolve, reject, flow FROM directus_operations`,
      [],
    );
    return rows.map((r) => ({
      id: String(r.id),
      name: (r.name as string) ?? null,
      key: String(r.key),
      type: String(r.type),
      position_x: (r.position_x as number) ?? null,
      position_y: (r.position_y as number) ?? null,
      options: parseJson(r.options),
      resolve: r.resolve ? String(r.resolve) : null,
      reject: r.reject ? String(r.reject) : null,
      flow: String(r.flow),
    }));
  }

  async listRoles(): Promise<DirectusRole[]> {
    const rows = await this.driver.query(
      `SELECT id, name, icon, description, admin_access, app_access FROM directus_roles`,
      [],
    );
    return rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      icon: (r.icon as string) ?? null,
      description: (r.description as string) ?? null,
      admin_access: Boolean(r.admin_access),
      app_access: Boolean(r.app_access),
    }));
  }

  async listPermissions(): Promise<DirectusPermission[]> {
    const rows = await this.driver.query(
      `SELECT id, role, collection, action, fields, permissions, validation, presets FROM directus_permissions`,
      [],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      role: r.role ? String(r.role) : null,
      collection: String(r.collection),
      action: String(r.action) as DirectusPermission['action'],
      fields: (parseJson(r.fields) as unknown as string[] | null) ?? null,
      permissions: parseJson(r.permissions),
      validation: parseJson(r.validation),
      presets: parseJson(r.presets),
    }));
  }

  async close(): Promise<void> {
    await this.driver.end();
  }
}

function parseJson(v: unknown): Record<string, unknown> | null {
  if (v == null) return null;
  if (typeof v === 'object') return v as Record<string, unknown>;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  }
  return null;
}

/** Lazy-import the right driver based on the connection URL scheme. */
async function openDriver(dbUrl: string, log: Logger): Promise<DbDriver> {
  const scheme = dbUrl.split(':', 1)[0]?.toLowerCase() ?? '';
  if (scheme === 'postgres' || scheme === 'postgresql') {
    const pg = await import('pg').catch(() => {
      throw new Error("DIRECTUS_DB_URL is Postgres but the 'pg' package is not installed. Run: npm i pg");
    });
    const pool = new pg.default.Pool({ connectionString: dbUrl });
    log.debug('connected to Postgres');
    return {
      async query(sql, params) {
        const res = await pool.query(sql, params);
        return res.rows as Record<string, unknown>[];
      },
      end: () => pool.end(),
      placeholder: (i) => `$${i}`,
    };
  }
  if (scheme === 'mysql' || scheme === 'mariadb') {
    const mysql = await import('mysql2/promise').catch(() => {
      throw new Error(
        "DIRECTUS_DB_URL is MySQL but the 'mysql2' package is not installed. Run: npm i mysql2",
      );
    });
    const pool = mysql.createPool(dbUrl);
    log.debug('connected to MySQL');
    return {
      async query(sql, params) {
        // MySQL uses `?` placeholders; callers pass them via placeholder().
        const [rows] = await pool.query(sql, params);
        return rows as Record<string, unknown>[];
      },
      end: () => pool.end(),
      placeholder: () => '?',
    };
  }
  throw new Error(`Unsupported DIRECTUS_DB_URL scheme: "${scheme}" (expected postgres or mysql).`);
}
