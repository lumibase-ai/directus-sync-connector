import { isCollectionInScope } from '../config';
import { mapItem } from '../mapping/item-map';
import { RelationIndex } from '../mapping/relation-index';
import { primaryKeyField } from '../mapping/schema-map';
import type { DirectusField } from '../directus/types';
import type { MigrationContext } from './context';
import { nowIso } from './context';

const PAGE_SIZE = 100;

/**
 * Migrate item data for all in-scope collections, in relation-topological order so
 * that referenced rows are created before the rows that point at them.
 *
 * Per item: rewrite FKs via the id-map, then create (no existing mapping) or update
 * (mapping present). Items with still-unresolved relations are collected and retried
 * in a second pass once more ids are known (handles intra-batch and cyclic references).
 */
export async function migrateItems(ctx: MigrationContext): Promise<void> {
  const { source, log, scope } = ctx;

  const collections = (await source.listCollections())
    .map((c) => c.collection)
    .filter((c) => isCollectionInScope(scope, c));
  const relations = await source.listRelations();
  const index = new RelationIndex(relations);
  const ordered = index.topoOrder(collections);

  const allFields = await source.listFields();
  const pkByCollection = new Map<string, string>();
  for (const col of ordered) {
    const fields = allFields.filter((f: DirectusField) => f.collection === col);
    pkByCollection.set(col, primaryKeyField(fields));
  }

  const deferred: { collection: string; raw: Record<string, unknown> }[] = [];

  for (const collection of ordered) {
    const pkField = pkByCollection.get(collection) ?? 'id';
    const rels = index.relationsFor(collection);
    const result = await syncCollection(ctx, collection, pkField, rels);
    deferred.push(...result.deferred.map((raw) => ({ collection, raw })));
  }

  // Second pass: items whose relations referenced not-yet-known ids.
  if (deferred.length > 0) {
    log.info(`items: retrying ${deferred.length} item(s) with deferred relations`);
    for (const { collection, raw } of deferred) {
      const pkField = pkByCollection.get(collection) ?? 'id';
      const rels = index.relationsFor(collection);
      await writeItem(ctx, collection, raw, pkField, rels, /*allowUnresolved*/ true);
    }
  }
}

async function syncCollection(
  ctx: MigrationContext,
  collection: string,
  pkField: string,
  rels: ReturnType<RelationIndex['relationsFor']>,
): Promise<{ deferred: Record<string, unknown>[] }> {
  const { source, state, log } = ctx;
  const stream = `items:${collection}`;
  const since = state.getHighWaterMark(stream);
  const cycleMark = nowIso();
  const deferred: Record<string, unknown>[] = [];

  let page = 1;
  let count = 0;
  for (;;) {
    const { items, hasMore } = await source.readItems(collection, { sinceIso: since, page, limit: PAGE_SIZE });
    for (const raw of items) {
      const wrote = await writeItem(ctx, collection, raw, pkField, rels, /*allowUnresolved*/ false);
      if (wrote === 'deferred') deferred.push(raw);
      count++;
    }
    if (!hasMore) break;
    page++;
  }

  // Advance the mark only after the whole collection is processed without throwing.
  state.setHighWaterMark(stream, cycleMark);
  if (count > 0) log.info(`items: ${collection} processed ${count} item(s)`);
  return { deferred };
}

async function writeItem(
  ctx: MigrationContext,
  collection: string,
  raw: Record<string, unknown>,
  pkField: string,
  rels: ReturnType<RelationIndex['relationsFor']>,
  allowUnresolved: boolean,
): Promise<'created' | 'updated' | 'deferred'> {
  const { lumibase, state, log } = ctx;
  const mapped = mapItem(raw, pkField, rels, state);

  if (mapped.unresolved.length > 0 && !allowUnresolved) {
    return 'deferred';
  }
  if (mapped.unresolved.length > 0) {
    log.warn(
      `items: ${collection}/${mapped.directusId} has unresolved relations after retry: ` +
        mapped.unresolved.join(', '),
    );
  }

  const existing = state.getLumibaseId(collection, mapped.directusId);
  if (existing) {
    await lumibase.updateOne(collection, existing, mapped.payload);
    return 'updated';
  }
  const created = await lumibase.createOne(collection, mapped.payload);
  const newId = created.id != null ? String(created.id) : undefined;
  if (newId) state.setLumibaseId(collection, mapped.directusId, newId);
  else log.warn(`items: ${collection}/${mapped.directusId} created but response had no id; not mapped`);
  return 'created';
}
