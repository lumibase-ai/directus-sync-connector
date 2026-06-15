import type { DirectusCollection, DirectusField } from '../directus/types';
import type { CollectionPayload, FieldPayload } from '../lumibase/schema-writer';

/**
 * Map Directus schema metadata to the (Directus-compatible, [Unverified]) Lumibase
 * schema payloads. Because the two systems share field types and meta shapes, this is
 * largely a pass-through that strips Directus-internal ids.
 */

export function mapCollection(c: DirectusCollection): CollectionPayload {
  return {
    collection: c.collection,
    meta: {
      icon: c.meta?.icon ?? null,
      note: c.meta?.note ?? null,
      hidden: c.meta?.hidden ?? false,
      singleton: c.meta?.singleton ?? false,
      archive_field: c.meta?.archive_field ?? null,
      archive_value: c.meta?.archive_value ?? null,
      sort_field: c.meta?.sort_field ?? null,
    },
    schema: c.schema ? {} : null,
  };
}

export function mapField(f: DirectusField): FieldPayload {
  return {
    collection: f.collection,
    field: f.field,
    type: f.type,
    meta: {
      interface: f.meta?.interface ?? null,
      options: f.meta?.options ?? null,
      display: f.meta?.display ?? null,
      readonly: f.meta?.readonly ?? false,
      hidden: f.meta?.hidden ?? false,
      sort: f.meta?.sort ?? null,
      width: f.meta?.width ?? null,
      required: f.meta?.required ?? false,
      note: f.meta?.note ?? null,
      special: f.meta?.special ?? null,
    },
    schema:
      f.schema && !f.schema.is_primary_key
        ? {
            is_nullable: f.schema.is_nullable ?? true,
            default_value: f.schema.default_value ?? null,
            max_length: f.schema.max_length ?? null,
          }
        : f.schema?.is_primary_key
          ? { is_primary_key: true }
          : null,
  };
}

/** The primary-key field name for a collection, if discoverable from its fields. */
export function primaryKeyField(fields: DirectusField[]): string {
  const pk = fields.find((f) => f.schema?.is_primary_key);
  return pk?.field ?? 'id';
}
