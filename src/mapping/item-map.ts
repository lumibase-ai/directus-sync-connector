import type { DirectusItem } from '../directus/types';
import type { StateStore } from '../engine/state-store';
import type { RelationInfo } from './relation-index';

export interface MappedItem {
  /** Directus primary key of the source row (string-normalized). */
  directusId: string;
  /** Payload to send to Lumibase, with FKs rewritten and the source PK stripped. */
  payload: Record<string, unknown>;
  /** Relations whose target was not yet mapped — caller should defer/re-run. */
  unresolved: string[];
}

/**
 * Transform a Directus item into a Lumibase create/update payload:
 *  - strips the source primary key (Lumibase generates its own id),
 *  - rewrites every m2o FK value from a Directus id to the mapped Lumibase id.
 *
 * Files referenced by id are remapped through the synthetic `directus_files` bucket
 * in the id-map (populated by the file migration stage).
 */
export function mapItem(
  item: DirectusItem,
  pkField: string,
  relations: RelationInfo[],
  state: StateStore,
): MappedItem {
  const directusId = String(item[pkField]);
  const payload: Record<string, unknown> = {};
  const unresolved: string[] = [];
  const relByField = new Map(relations.map((r) => [r.field, r.relatedCollection]));

  for (const [key, value] of Object.entries(item)) {
    if (key === pkField) continue; // never carry the source PK

    const relatedCollection = relByField.get(key);
    if (relatedCollection && value != null) {
      const rewritten = rewriteForeignKey(value, relatedCollection, state);
      if (rewritten.unresolved) unresolved.push(key);
      payload[key] = rewritten.value;
      continue;
    }
    payload[key] = value;
  }

  return { directusId, payload, unresolved };
}

/**
 * Rewrite a single FK value (scalar id, array of ids, or nested object with an id)
 * into Lumibase id space. Unmapped ids are left as-is and flagged unresolved so the
 * engine can retry after the target rows are created.
 */
function rewriteForeignKey(
  value: unknown,
  relatedCollection: string,
  state: StateStore,
): { value: unknown; unresolved: boolean } {
  if (Array.isArray(value)) {
    let anyUnresolved = false;
    const mapped = value.map((v) => {
      const r = rewriteForeignKey(v, relatedCollection, state);
      if (r.unresolved) anyUnresolved = true;
      return r.value;
    });
    return { value: mapped, unresolved: anyUnresolved };
  }

  if (value && typeof value === 'object') {
    // Expanded relation object — remap its `id` if present, leave the rest intact.
    const obj = value as Record<string, unknown>;
    if ('id' in obj && obj.id != null) {
      const mapped = state.getLumibaseId(relatedCollection, String(obj.id));
      if (mapped) return { value: { ...obj, id: mapped }, unresolved: false };
      return { value: obj, unresolved: true };
    }
    return { value: obj, unresolved: false };
  }

  // Scalar FK id.
  const mapped = state.getLumibaseId(relatedCollection, String(value));
  if (mapped) return { value: mapped, unresolved: false };
  return { value, unresolved: true };
}
