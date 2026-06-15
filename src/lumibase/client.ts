import { Buffer } from 'node:buffer';

import { LumibaseError } from './errors';
import type { FileMeta, ListResult, LumibaseConfig, LumibaseRecord, QueryParams } from './types';

/** Encode QueryParams into the wire query string (matches @lumibase/sdk items resource). */
export function queryToParams(query?: QueryParams): Record<string, string> {
  const params: Record<string, string> = {};
  if (!query) return params;
  if (query.fields) params.fields = query.fields.join(',');
  if (query.filter) params.filter = JSON.stringify(query.filter);
  if (query.sort) params.sort = query.sort.join(',');
  if (query.page !== undefined) params.page = String(query.page);
  if (query.limit !== undefined) params.limit = String(query.limit);
  if (query.search) params.search = query.search;
  return params;
}

function unwrap<T>(res: { data: T } | T): T {
  return res !== null && typeof res === 'object' && 'data' in res
    ? (res as { data: T }).data
    : (res as T);
}

/**
 * Vendored Lumibase REST client. Targets the same /api/v1 contract as @lumibase/sdk:
 * X-Site-Id header, Bearer token, {data,meta} envelope.
 */
export class LumibaseClient {
  private readonly baseUrl: string;

  constructor(private readonly config: LumibaseConfig) {
    this.baseUrl = config.url.replace(/\/+$/, '');
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      'X-Site-Id': this.config.siteId,
      Authorization: `Bearer ${this.config.token}`,
      ...extra,
    };
  }

  async request<T>(
    method: string,
    path: string,
    options: { body?: unknown; query?: Record<string, string>; headers?: Record<string, string> } = {},
  ): Promise<T> {
    const url = new URL(this.baseUrl + path);
    if (options.query) {
      for (const [k, v] of Object.entries(options.query)) {
        if (v !== undefined && v !== null) url.searchParams.set(k, v);
      }
    }

    const isJsonBody = options.body !== undefined && !(options.body instanceof FormData);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 30_000);

    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method,
        headers: this.headers({
          ...(isJsonBody ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
        }),
        body:
          options.body === undefined
            ? undefined
            : options.body instanceof FormData
              ? options.body
              : JSON.stringify(options.body),
        signal: controller.signal,
      });
    } catch (cause) {
      clearTimeout(timeout);
      if (controller.signal.aborted) {
        throw new LumibaseError('TIMEOUT', `Request to ${path} timed out`, { cause });
      }
      throw new LumibaseError('NETWORK_ERROR', `Request to ${path} failed`, { cause });
    }
    clearTimeout(timeout);

    const text = await res.text();
    const parsed = text ? safeJson(text) : undefined;
    if (!res.ok) throw LumibaseError.fromResponse(res.status, parsed);
    return parsed as T;
  }

  // ── Items ──────────────────────────────────────────────────────────────────
  async readMany<T extends LumibaseRecord = LumibaseRecord>(
    collection: string,
    query?: QueryParams,
  ): Promise<ListResult<T>> {
    return this.request<ListResult<T>>('GET', this.itemsBase(collection), {
      query: queryToParams(query),
    });
  }

  async createOne<T extends LumibaseRecord = LumibaseRecord>(
    collection: string,
    data: Partial<T>,
  ): Promise<T> {
    const res = await this.request<{ data: T } | T>('POST', this.itemsBase(collection), { body: data });
    return unwrap(res);
  }

  async updateOne<T extends LumibaseRecord = LumibaseRecord>(
    collection: string,
    id: string,
    data: Partial<T>,
  ): Promise<T> {
    const res = await this.request<{ data: T } | T>(
      'PATCH',
      `${this.itemsBase(collection)}/${encodeURIComponent(id)}`,
      { body: data },
    );
    return unwrap(res);
  }

  // ── Files ──────────────────────────────────────────────────────────────────
  /** Upload a buffer as a file. Returns the created Lumibase file metadata. */
  async uploadFile(
    bytes: Buffer | Uint8Array,
    meta: { filename: string; type?: string; title?: string; folder?: string },
  ): Promise<FileMeta> {
    const form = new FormData();
    const blob = new Blob([bytes], meta.type ? { type: meta.type } : undefined);
    form.append('file', blob, meta.filename);
    if (meta.title) form.append('title', meta.title);
    if (meta.folder) form.append('folder', meta.folder);
    const res = await this.request<{ data: FileMeta } | FileMeta>('POST', '/api/v1/files', { body: form });
    return unwrap(res);
  }

  // ── Flows ──────────────────────────────────────────────────────────────────
  async runFlow(flowId: string, payload?: Record<string, unknown>): Promise<unknown> {
    return this.request('POST', `/api/v1/flows/${encodeURIComponent(flowId)}/run`, { body: payload });
  }

  private itemsBase(collection: string): string {
    return `/api/v1/items/${encodeURIComponent(collection)}`;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
