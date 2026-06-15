import { describe, expect, it } from 'vitest';

import { queryToParams } from '../src/lumibase/client';

describe('queryToParams', () => {
  it('returns empty object for no query', () => {
    expect(queryToParams()).toEqual({});
  });

  it('joins fields and sort with commas', () => {
    expect(queryToParams({ fields: ['id', 'title'], sort: ['-date', 'id'] })).toEqual({
      fields: 'id,title',
      sort: '-date,id',
    });
  });

  it('serializes the filter DSL to JSON (Directus-compatible operators)', () => {
    const params = queryToParams({ filter: { date_updated: { _gt: '2024-01-01T00:00:00Z' } } });
    expect(params.filter).toBe('{"date_updated":{"_gt":"2024-01-01T00:00:00Z"}}');
  });

  it('stringifies page and limit', () => {
    expect(queryToParams({ page: 2, limit: 100 })).toEqual({ page: '2', limit: '100' });
  });

  it('passes search through', () => {
    expect(queryToParams({ search: 'hello' }).search).toBe('hello');
  });
});
