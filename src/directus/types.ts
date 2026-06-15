/** Directus system shapes relevant to migration (subset of the public API/schema). */

export interface DirectusCollection {
  collection: string;
  meta: {
    icon?: string | null;
    note?: string | null;
    display_template?: string | null;
    hidden?: boolean;
    singleton?: boolean;
    translations?: unknown;
    archive_field?: string | null;
    archive_value?: string | null;
    sort_field?: string | null;
  } | null;
  schema: { name: string } | null; // null for folder-only (no DB table)
}

export interface DirectusField {
  collection: string;
  field: string;
  type: string; // string, integer, uuid, timestamp, boolean, json, ...
  meta: {
    id?: number;
    interface?: string | null;
    options?: Record<string, unknown> | null;
    display?: string | null;
    display_options?: Record<string, unknown> | null;
    readonly?: boolean;
    hidden?: boolean;
    sort?: number | null;
    width?: string | null;
    required?: boolean;
    note?: string | null;
    special?: string[] | null; // e.g. ['uuid'], ['date-created'], ['m2o'], ['o2m'], ['m2m']
  } | null;
  schema: {
    data_type?: string;
    is_primary_key?: boolean;
    is_nullable?: boolean;
    default_value?: unknown;
    max_length?: number | null;
  } | null;
}

export interface DirectusRelation {
  collection: string; // the "many" collection holding the FK
  field: string; // the FK field
  related_collection: string | null; // the "one" target
  meta: {
    one_field?: string | null; // o2m back-reference field
    one_collection_field?: string | null;
    one_allowed_collections?: string[] | null;
    junction_field?: string | null; // set on the junction collection for m2m
    sort_field?: string | null;
    one_deselect_action?: string | null;
  } | null;
  schema: {
    on_delete?: string | null;
  } | null;
}

export interface DirectusFile {
  id: string;
  filename_download: string;
  title?: string | null;
  type?: string | null; // MIME
  folder?: string | null;
  filesize?: number | string | null;
  modified_on?: string | null;
  uploaded_on?: string | null;
}

export interface DirectusFlow {
  id: string;
  name: string;
  icon?: string | null;
  color?: string | null;
  description?: string | null;
  status?: string | null;
  trigger?: string | null;
  accountability?: string | null;
  options?: Record<string, unknown> | null;
}

export interface DirectusOperation {
  id: string;
  name?: string | null;
  key: string;
  type: string;
  position_x?: number | null;
  position_y?: number | null;
  options?: Record<string, unknown> | null;
  resolve?: string | null;
  reject?: string | null;
  flow: string;
}

export interface DirectusRole {
  id: string;
  name: string;
  icon?: string | null;
  description?: string | null;
  admin_access?: boolean;
  app_access?: boolean;
}

export interface DirectusPermission {
  id: number;
  role: string | null; // null = public
  collection: string;
  action: 'create' | 'read' | 'update' | 'delete' | 'share';
  fields?: string[] | null;
  permissions?: Record<string, unknown> | null;
  validation?: Record<string, unknown> | null;
  presets?: Record<string, unknown> | null;
}

export type DirectusItem = Record<string, unknown>;

/** A downloaded asset: raw bytes plus the metadata needed to re-upload. */
export interface DownloadedFile {
  bytes: Buffer;
  filename: string;
  type?: string;
  title?: string;
  folder?: string;
}

export interface ReadItemsOptions {
  /** ISO timestamp; only return items changed strictly after this. */
  sinceIso?: string;
  page: number;
  limit: number;
}

export interface ItemPage {
  items: DirectusItem[];
  /** True if more pages may exist (i.e. a full page was returned). */
  hasMore: boolean;
}
