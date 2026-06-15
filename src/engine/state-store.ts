import { readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/**
 * Persistent sync state, file-backed JSON.
 *
 *  - highWaterMarks: per-stream ISO timestamp of the last successfully synced change.
 *    Keys: `items:<collection>`, `files`, etc. A stream advances its mark only after
 *    the stage fully succeeds, so a crash mid-stage re-processes that stream cleanly.
 *  - idMap: Directus id -> Lumibase id, keyed by `<collection>` then `<directusId>`.
 *    Used to (a) choose create-vs-update and (b) rewrite relational FKs to Lumibase ids.
 */
export interface SyncState {
  version: 1;
  highWaterMarks: Record<string, string>;
  idMap: Record<string, Record<string, string>>;
}

function emptyState(): SyncState {
  return { version: 1, highWaterMarks: {}, idMap: {} };
}

export class StateStore {
  private constructor(
    private readonly path: string,
    private state: SyncState,
    private dirty = false,
  ) {}

  static async load(filePath: string): Promise<StateStore> {
    const path = resolve(filePath);
    try {
      const raw = await readFile(path, 'utf8');
      const parsed = JSON.parse(raw) as SyncState;
      const state: SyncState = {
        version: 1,
        highWaterMarks: parsed.highWaterMarks ?? {},
        idMap: parsed.idMap ?? {},
      };
      return new StateStore(path, state);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return new StateStore(path, emptyState(), true);
      }
      throw err;
    }
  }

  getHighWaterMark(stream: string): string | undefined {
    return this.state.highWaterMarks[stream];
  }

  setHighWaterMark(stream: string, iso: string): void {
    if (this.state.highWaterMarks[stream] === iso) return;
    this.state.highWaterMarks[stream] = iso;
    this.dirty = true;
  }

  getLumibaseId(collection: string, directusId: string): string | undefined {
    return this.state.idMap[collection]?.[directusId];
  }

  setLumibaseId(collection: string, directusId: string, lumibaseId: string): void {
    const bucket = (this.state.idMap[collection] ??= {});
    if (bucket[directusId] === lumibaseId) return;
    bucket[directusId] = lumibaseId;
    this.dirty = true;
  }

  /** Persist to disk atomically (write temp + rename) if there are unsaved changes. */
  async flush(): Promise<void> {
    if (!this.dirty) return;
    const tmp = `${this.path}.tmp`;
    const body = JSON.stringify(this.state, null, 2);
    await writeFile(tmp, body, 'utf8').catch(async (err) => {
      // Ensure the directory exists, then retry once.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        const { mkdir } = await import('node:fs/promises');
        await mkdir(dirname(this.path), { recursive: true });
        await writeFile(tmp, body, 'utf8');
      } else throw err;
    });
    await rename(tmp, this.path);
    this.dirty = false;
  }
}
