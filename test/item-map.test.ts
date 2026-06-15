import { describe, expect, it } from 'vitest';

import { mapItem } from '../src/mapping/item-map';
import type { StateStore } from '../src/engine/state-store';

/** Minimal StateStore stub: only getLumibaseId is exercised by mapItem. */
function fakeState(map: Record<string, Record<string, string>>): StateStore {
  return {
    getLumibaseId: (collection: string, directusId: string) => map[collection]?.[directusId],
  } as unknown as StateStore;
}

const REL = [{ field: 'author', relatedCollection: 'authors' }];

describe('mapItem', () => {
  it('strips the source primary key', () => {
    const state = fakeState({});
    const { payload, directusId } = mapItem({ id: '42', title: 'Hi' }, 'id', [], state);
    expect(directusId).toBe('42');
    expect(payload).toEqual({ title: 'Hi' });
    expect('id' in payload).toBe(false);
  });

  it('rewrites a scalar FK via the id-map', () => {
    const state = fakeState({ authors: { 'dir-1': 'lum-9' } });
    const { payload, unresolved } = mapItem({ id: 'a', author: 'dir-1' }, 'id', REL, state);
    expect(payload.author).toBe('lum-9');
    expect(unresolved).toEqual([]);
  });

  it('flags unresolved FKs and leaves the original value', () => {
    const state = fakeState({});
    const { payload, unresolved } = mapItem({ id: 'a', author: 'dir-1' }, 'id', REL, state);
    expect(payload.author).toBe('dir-1');
    expect(unresolved).toEqual(['author']);
  });

  it('rewrites arrays of FK ids (o2m / m2m)', () => {
    const state = fakeState({ authors: { x: 'LX', y: 'LY' } });
    const rel = [{ field: 'authors', relatedCollection: 'authors' }];
    const { payload, unresolved } = mapItem({ id: 'a', authors: ['x', 'y'] }, 'id', rel, state);
    expect(payload.authors).toEqual(['LX', 'LY']);
    expect(unresolved).toEqual([]);
  });

  it('partially-resolved arrays are flagged unresolved', () => {
    const state = fakeState({ authors: { x: 'LX' } });
    const rel = [{ field: 'authors', relatedCollection: 'authors' }];
    const { payload, unresolved } = mapItem({ id: 'a', authors: ['x', 'y'] }, 'id', rel, state);
    expect(payload.authors).toEqual(['LX', 'y']);
    expect(unresolved).toEqual(['authors']);
  });

  it('remaps the id of an expanded relation object', () => {
    const state = fakeState({ authors: { 'dir-1': 'lum-9' } });
    const { payload } = mapItem(
      { id: 'a', author: { id: 'dir-1', name: 'Jo' } },
      'id',
      REL,
      state,
    );
    expect(payload.author).toEqual({ id: 'lum-9', name: 'Jo' });
  });

  it('leaves null FKs untouched', () => {
    const state = fakeState({});
    const { payload, unresolved } = mapItem({ id: 'a', author: null }, 'id', REL, state);
    expect(payload.author).toBeNull();
    expect(unresolved).toEqual([]);
  });
});
