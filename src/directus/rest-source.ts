import { Buffer } from 'node:buffer';

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

interface Envelope<T> {
  data: T;
}

/** Directus REST adapter using a static admin token. */
export class DirectusRestSource implements DirectusSource {
  private readonly baseUrl: string;

  constructor(
    url: string,
    private readonly token: string,
    private readonly log: Logger,
  ) {
    this.baseUrl = url.replace(/\/+$/, '');
  }

  async listCollections(): Promise<DirectusCollection[]> {
    const res = await this.get<Envelope<DirectusCollection[]>>('/collections');
    // Drop system collections (directus_*) and folder-only collections without a table.
    return res.data.filter((c) => !c.collection.startsWith('directus_'));
  }

  async listFields(collection?: string): Promise<DirectusField[]> {
    const path = collection ? `/fields/${encodeURIComponent(collection)}` : '/fields';
    const res = await this.get<Envelope<DirectusField[]>>(path);
    return res.data.filter((f) => !f.collection.startsWith('directus_'));
  }

  async listRelations(): Promise<DirectusRelation[]> {
    const res = await this.get<Envelope<DirectusRelation[]>>('/relations');
    return res.data.filter((r) => !r.collection.startsWith('directus_'));
  }

  async readItems(collection: string, options: ReadItemsOptions): Promise<ItemPage> {
    const query: Record<string, string> = {
      limit: String(options.limit),
      page: String(options.page),
      // Stable ordering so pagination is deterministic.
      sort: 'id',
    };
    if (options.sinceIso) {
      query.filter = JSON.stringify({ date_updated: { _gt: options.sinceIso } });
    }
    const res = await this.get<Envelope<Record<string, unknown>[]>>(
      `/items/${encodeURIComponent(collection)}`,
      query,
    );
    return { items: res.data, hasMore: res.data.length === options.limit };
  }

  async listFiles(sinceIso?: string): Promise<DirectusFile[]> {
    const query: Record<string, string> = { limit: '-1' };
    if (sinceIso) query.filter = JSON.stringify({ modified_on: { _gt: sinceIso } });
    const res = await this.get<Envelope<DirectusFile[]>>('/files', query);
    return res.data;
  }

  async downloadFile(id: string): Promise<DownloadedFile> {
    const meta = (await this.get<Envelope<DirectusFile>>(`/files/${encodeURIComponent(id)}`)).data;
    const res = await fetch(`${this.baseUrl}/assets/${encodeURIComponent(id)}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) {
      throw new Error(`Directus asset download failed for ${id}: HTTP ${res.status}`);
    }
    const bytes = Buffer.from(await res.arrayBuffer());
    return {
      bytes,
      filename: meta.filename_download,
      type: meta.type ?? undefined,
      title: meta.title ?? undefined,
      folder: meta.folder ?? undefined,
    };
  }

  async listFlows(): Promise<DirectusFlow[]> {
    const res = await this.get<Envelope<DirectusFlow[]>>('/flows', { limit: '-1' });
    return res.data;
  }

  async listOperations(): Promise<DirectusOperation[]> {
    const res = await this.get<Envelope<DirectusOperation[]>>('/operations', { limit: '-1' });
    return res.data;
  }

  async listRoles(): Promise<DirectusRole[]> {
    const res = await this.get<Envelope<DirectusRole[]>>('/roles', { limit: '-1' });
    return res.data;
  }

  async listPermissions(): Promise<DirectusPermission[]> {
    const res = await this.get<Envelope<DirectusPermission[]>>('/permissions', { limit: '-1' });
    return res.data;
  }

  async close(): Promise<void> {
    // REST has no persistent resources to release.
  }

  private async get<T>(path: string, query?: Record<string, string>): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
    });
    const text = await res.text();
    if (!res.ok) {
      this.log.debug(`GET ${path} -> ${res.status}`);
      throw new Error(`Directus GET ${path} failed: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    return JSON.parse(text) as T;
  }
}
