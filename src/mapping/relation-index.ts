import type { DirectusRelation } from '../directus/types';

export interface RelationInfo {
  /** The FK field on the owning ("many") collection. */
  field: string;
  /** The collection the FK points to. */
  relatedCollection: string;
}

/**
 * Indexes Directus relations for fast lookup and exposes a topological ordering of
 * collections by their many-to-one dependencies (so referenced rows exist first).
 */
export class RelationIndex {
  /** collection -> (field -> related collection) for m2o FKs held on that collection. */
  private readonly byCollection = new Map<string, Map<string, string>>();

  constructor(relations: DirectusRelation[]) {
    for (const rel of relations) {
      if (!rel.related_collection) continue; // skip m2a / unresolved
      const fields = this.byCollection.get(rel.collection) ?? new Map<string, string>();
      fields.set(rel.field, rel.related_collection);
      this.byCollection.set(rel.collection, fields);
    }
  }

  /** m2o relations owned by `collection` (its FK fields → target collection). */
  relationsFor(collection: string): RelationInfo[] {
    const fields = this.byCollection.get(collection);
    if (!fields) return [];
    return [...fields.entries()].map(([field, relatedCollection]) => ({ field, relatedCollection }));
  }

  /**
   * Order collections so that each comes after the collections it references via m2o.
   * Cycles (e.g. self-reference, mutual FKs) are broken by emitting the remaining
   * nodes in input order — relations within a cycle are reconciled on later passes.
   */
  topoOrder(collections: string[]): string[] {
    const inScope = new Set(collections);
    const visited = new Set<string>();
    const onStack = new Set<string>();
    const ordered: string[] = [];

    const visit = (col: string): void => {
      if (visited.has(col) || !inScope.has(col)) return;
      if (onStack.has(col)) return; // cycle edge — skip to break it
      onStack.add(col);
      for (const { relatedCollection } of this.relationsFor(col)) {
        if (relatedCollection !== col) visit(relatedCollection);
      }
      onStack.delete(col);
      visited.add(col);
      ordered.push(col);
    };

    for (const col of collections) visit(col);
    return ordered;
  }
}
