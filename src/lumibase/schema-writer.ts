import type { Logger } from '../logger';
import { LumibaseError } from './errors';
import type { LumibaseClient } from './client';

/**
 * [Unverified] Schema-management adapter for Lumibase.
 *
 * The published @lumibase/sdk surface exposes only data endpoints (items/files/flows)
 * — it has NO collection/field management. Because Lumibase's API is otherwise
 * Directus-compatible, this adapter assumes Directus-style schema endpoints:
 *   POST /api/v1/collections   { collection, meta, schema }
 *   POST /api/v1/fields/:collection   { field, type, meta, schema }
 *
 * These routes are UNCONFIRMED. The adapter fails soft: if the server returns 404,
 * it logs a clear warning and reports the capability as unavailable so the engine
 * skips schema sync rather than crashing. Confirm the real endpoints before relying
 * on this in production (operate with SYNC_SCHEMA=false until then).
 */

export interface CollectionPayload {
  collection: string;
  meta?: Record<string, unknown>;
  schema?: Record<string, unknown> | null;
}

export interface FieldPayload {
  collection: string;
  field: string;
  type: string;
  meta?: Record<string, unknown>;
  schema?: Record<string, unknown> | null;
}

export class SchemaWriter {
  /** Set false once a request 404s, so we stop hammering missing endpoints. */
  private available = true;

  constructor(
    private readonly client: LumibaseClient,
    private readonly log: Logger,
  ) {}

  get isAvailable(): boolean {
    return this.available;
  }

  /** Create a collection. Idempotency is the engine's concern (it checks existence first). */
  async createCollection(payload: CollectionPayload): Promise<boolean> {
    return this.attempt('POST', '/api/v1/collections', payload, `collection ${payload.collection}`);
  }

  async createField(payload: FieldPayload): Promise<boolean> {
    const { collection, ...body } = payload;
    return this.attempt(
      'POST',
      `/api/v1/fields/${encodeURIComponent(collection)}`,
      body,
      `field ${collection}.${payload.field}`,
    );
  }

  /** Returns true if the collection already exists in Lumibase. */
  async collectionExists(collection: string): Promise<boolean> {
    if (!this.available) return false;
    try {
      await this.client.request('GET', `/api/v1/collections/${encodeURIComponent(collection)}`);
      return true;
    } catch (err) {
      if (err instanceof LumibaseError) {
        if (err.isNotFound && this.routeMissing(err)) {
          // 404 here is ambiguous: missing collection vs. missing route. Treat
          // a route-shaped 404 as "schema API unavailable".
          this.markUnavailable('GET /api/v1/collections/:id');
          return false;
        }
        if (err.isNotFound) return false; // collection genuinely absent
      }
      throw err;
    }
  }

  private async attempt(
    method: string,
    path: string,
    body: unknown,
    label: string,
  ): Promise<boolean> {
    if (!this.available) return false;
    try {
      await this.client.request(method, path, { body });
      this.log.debug(`schema: created ${label}`);
      return true;
    } catch (err) {
      if (err instanceof LumibaseError && err.isNotFound && this.routeMissing(err)) {
        this.markUnavailable(`${method} ${path}`);
        return false;
      }
      throw err;
    }
  }

  /** Heuristic: a 404 with no field-level errors looks like a missing route. */
  private routeMissing(err: LumibaseError): boolean {
    return !err.errors || err.errors.length === 0;
  }

  private markUnavailable(route: string): void {
    if (!this.available) return;
    this.available = false;
    this.log.warn(
      `[Unverified] Lumibase schema endpoint not found (${route}). ` +
        `Disabling schema sync for this run — pre-create collections in Lumibase, ` +
        `or wire SchemaWriter to the real endpoints. (Based on the assumption that ` +
        `Lumibase exposes Directus-style schema routes.)`,
    );
  }
}
