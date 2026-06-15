import { LumibaseError } from '../lumibase/errors';
import type { MigrationContext } from './context';

const FLOWS_COLLECTION = 'directus_flows';
const OPERATIONS_COLLECTION = 'directus_operations';

/**
 * Migrate flow definitions + operations.
 *
 * Lumibase's SDK only exposes flow *execution* (POST /flows/:id/run), not flow CRUD.
 * As a portable approximation we write the flow + operation definitions as items into
 * `directus_flows` / `directus_operations` collections on Lumibase, preserving them
 * for later reconciliation. Fails soft if those collections don't exist (404).
 *
 * Flows/operations have no reliable timestamps in Directus, so they are re-synced each
 * cycle (low cardinality). create-vs-update is decided via the id-map.
 */
export async function migrateFlows(ctx: MigrationContext): Promise<void> {
  const { source, log } = ctx;

  const flows = await source.listFlows();
  const operations = await source.listOperations();

  const flowsOk = await upsertAll(ctx, FLOWS_COLLECTION, flows as unknown as Record<string, unknown>[]);
  if (!flowsOk) return;
  const opsOk = await upsertAll(
    ctx,
    OPERATIONS_COLLECTION,
    operations as unknown as Record<string, unknown>[],
  );
  if (!opsOk) return;

  log.info(`flows: synced ${flows.length} flow(s), ${operations.length} operation(s)`);
}

/** Returns false if the target collection is missing (404), signalling fail-soft skip. */
async function upsertAll(
  ctx: MigrationContext,
  collection: string,
  rows: Record<string, unknown>[],
): Promise<boolean> {
  const { lumibase, state, log } = ctx;
  for (const row of rows) {
    const directusId = String(row.id);
    const { id: _drop, ...payload } = row;
    const existing = state.getLumibaseId(collection, directusId);
    try {
      if (existing) {
        await lumibase.updateOne(collection, existing, payload);
      } else {
        const created = await lumibase.createOne(collection, payload);
        if (created.id != null) state.setLumibaseId(collection, directusId, String(created.id));
      }
    } catch (err) {
      if (err instanceof LumibaseError && err.isNotFound) {
        log.warn(
          `flows: collection "${collection}" not found on Lumibase — skipping. ` +
            `Create it (or enable schema sync) to migrate flow definitions.`,
        );
        return false;
      }
      throw err;
    }
  }
  return true;
}
