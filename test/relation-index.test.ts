import { describe, expect, it } from 'vitest';

import { RelationIndex } from '../src/mapping/relation-index';
import type { DirectusRelation } from '../src/directus/types';

function rel(collection: string, field: string, related: string): DirectusRelation {
  return { collection, field, related_collection: related, meta: null, schema: null };
}

describe('RelationIndex', () => {
  it('indexes m2o relations per collection', () => {
    const idx = new RelationIndex([rel('articles', 'author', 'authors')]);
    expect(idx.relationsFor('articles')).toEqual([{ field: 'author', relatedCollection: 'authors' }]);
    expect(idx.relationsFor('authors')).toEqual([]);
  });

  it('skips relations without a related collection (m2a)', () => {
    const idx = new RelationIndex([
      { collection: 'blocks', field: 'item', related_collection: null, meta: null, schema: null },
    ]);
    expect(idx.relationsFor('blocks')).toEqual([]);
  });

  it('orders referenced collections before their dependents', () => {
    const idx = new RelationIndex([
      rel('articles', 'author', 'authors'),
      rel('comments', 'article', 'articles'),
    ]);
    const order = idx.topoOrder(['comments', 'articles', 'authors']);
    expect(order.indexOf('authors')).toBeLessThan(order.indexOf('articles'));
    expect(order.indexOf('articles')).toBeLessThan(order.indexOf('comments'));
  });

  it('breaks cycles without dropping nodes', () => {
    const idx = new RelationIndex([rel('a', 'b_ref', 'b'), rel('b', 'a_ref', 'a')]);
    const order = idx.topoOrder(['a', 'b']);
    expect(new Set(order)).toEqual(new Set(['a', 'b']));
    expect(order).toHaveLength(2);
  });

  it('tolerates self-references', () => {
    const idx = new RelationIndex([rel('pages', 'parent', 'pages')]);
    expect(idx.topoOrder(['pages'])).toEqual(['pages']);
  });
});
