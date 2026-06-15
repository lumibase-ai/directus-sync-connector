import { isCollectionInScope } from '../config';
import { RelationIndex } from '../mapping/relation-index';
import { mapCollection, mapField } from '../mapping/schema-map';
import type { MigrationContext } from './context';

/**
 * Sync schema (collections + fields) into Lumibase via the [Unverified] schema-writer.
 * Collections are created in relation-topological order. Fails soft: if the schema
 * endpoints are unavailable, the stage logs and returns without error.
 *
 * `dryRun` prints the would-create payloads without writing — used by `sync schema --dry-run`
 * to validate source reads independently of the unconfirmed Lumibase schema API.
 */
export async function migrateSchema(ctx: MigrationContext, dryRun = false): Promise<void> {
  const { source, schemaWriter, log, scope } = ctx;

  const collections = (await source.listCollections()).filter((c) =>
    isCollectionInScope(scope, c.collection),
  );
  const relations = await source.listRelations();
  const index = new RelationIndex(relations);
  const ordered = index.topoOrder(collections.map((c) => c.collection));
  const byName = new Map(collections.map((c) => [c.collection, c]));

  const allFields = await source.listFields();
  const fieldsByCollection = new Map<string, typeof allFields>();
  for (const f of allFields) {
    const list = fieldsByCollection.get(f.collection) ?? [];
    list.push(f);
    fieldsByCollection.set(f.collection, list);
  }

  for (const name of ordered) {
    const collection = byName.get(name);
    if (!collection) continue;
    const collectionPayload = mapCollection(collection);
    const fieldPayloads = (fieldsByCollection.get(name) ?? []).map(mapField);

    if (dryRun) {
      log.info(`[dry-run] collection ${name}`, collectionPayload);
      for (const fp of fieldPayloads) log.info(`[dry-run]   field ${name}.${fp.field} (${fp.type})`);
      continue;
    }

    if (!schemaWriter.isAvailable) {
      log.warn(`Skipping schema for ${name}: Lumibase schema API unavailable.`);
      return;
    }

    const exists = await schemaWriter.collectionExists(name);
    if (!exists) {
      const created = await schemaWriter.createCollection(collectionPayload);
      if (!created) return; // endpoint went unavailable mid-run
      for (const fp of fieldPayloads) {
        const ok = await schemaWriter.createField(fp);
        if (!ok) return;
      }
      log.info(`schema: created collection ${name} with ${fieldPayloads.length} fields`);
    } else {
      log.debug(`schema: collection ${name} already exists; skipping (field diffing not implemented)`);
    }
  }
}
