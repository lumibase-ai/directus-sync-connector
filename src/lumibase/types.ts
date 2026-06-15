/**
 * Lumibase REST contract types. Mirrors the @lumibase/sdk surface
 * (lumibase-app/packages/lumibase-sdk) but vendored here since this connector
 * lives in a separate repo and cannot use `workspace:*`.
 */

export interface LumibaseConfig {
  url: string;
  siteId: string;
  token: string;
  timeoutMs?: number;
}

export type FilterOperator =
  | '_eq'
  | '_neq'
  | '_lt'
  | '_lte'
  | '_gt'
  | '_gte'
  | '_in'
  | '_nin'
  | '_contains'
  | '_starts_with'
  | '_null'
  | '_nnull';

export type FilterRule = { [op in FilterOperator]?: unknown };

export type Filter = {
  _and?: Filter[];
  _or?: Filter[];
  [field: string]: FilterRule | Filter[] | undefined;
};

export interface QueryParams {
  fields?: string[];
  filter?: Filter;
  sort?: string[];
  page?: number;
  limit?: number;
  search?: string;
}

export interface ListMeta {
  total: number;
  page: number;
  pageSize: number;
}

export interface ListResult<T> {
  data: T[];
  meta: ListMeta;
}

export interface FileMeta {
  id: string;
  filename: string;
  type: string;
  title?: string;
  folder?: string;
  size?: number;
}

export type LumibaseRecord = Record<string, unknown>;
