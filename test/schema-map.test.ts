import { describe, expect, it } from 'vitest';

import { mapCollection, mapField, primaryKeyField } from '../src/mapping/schema-map';
import type { DirectusCollection, DirectusField } from '../src/directus/types';

describe('schema-map', () => {
  it('maps a collection, preserving meta and dropping internals', () => {
    const c: DirectusCollection = {
      collection: 'articles',
      meta: { icon: 'article', note: 'Posts', hidden: false, singleton: false },
      schema: { name: 'articles' },
    };
    const out = mapCollection(c);
    expect(out.collection).toBe('articles');
    expect(out.meta).toMatchObject({ icon: 'article', note: 'Posts', singleton: false });
    expect(out.schema).toEqual({}); // table-backed
  });

  it('marks folder-only collections (no table) with null schema', () => {
    const c: DirectusCollection = { collection: 'group', meta: null, schema: null };
    expect(mapCollection(c).schema).toBeNull();
  });

  it('maps a normal field with schema constraints', () => {
    const f: DirectusField = {
      collection: 'articles',
      field: 'title',
      type: 'string',
      meta: { interface: 'input', required: true },
      schema: { is_nullable: false, max_length: 255 },
    };
    const out = mapField(f);
    expect(out).toMatchObject({ collection: 'articles', field: 'title', type: 'string' });
    expect(out.schema).toMatchObject({ is_nullable: false, max_length: 255 });
    expect(out.meta?.required).toBe(true);
  });

  it('flags primary-key fields distinctly', () => {
    const f: DirectusField = {
      collection: 'articles',
      field: 'id',
      type: 'uuid',
      meta: null,
      schema: { is_primary_key: true },
    };
    expect(mapField(f).schema).toEqual({ is_primary_key: true });
  });

  it('finds the primary key field, defaulting to "id"', () => {
    const fields: DirectusField[] = [
      { collection: 'x', field: 'code', type: 'string', meta: null, schema: { is_primary_key: true } },
      { collection: 'x', field: 'name', type: 'string', meta: null, schema: null },
    ];
    expect(primaryKeyField(fields)).toBe('code');
    expect(primaryKeyField([])).toBe('id');
  });
});
