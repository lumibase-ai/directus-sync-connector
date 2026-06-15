import { FILES_BUCKET, mapFileUpload } from '../mapping/file-map';
import type { MigrationContext } from './context';
import { nowIso } from './context';

const STREAM = 'files';

/**
 * Migrate Directus files/assets into Lumibase. Each file is downloaded and re-uploaded;
 * the resulting Lumibase file id is recorded in the id-map under FILES_BUCKET so item
 * FK rewrites can resolve file references. Already-mapped files are skipped.
 */
export async function migrateFiles(ctx: MigrationContext): Promise<void> {
  const { source, lumibase, state, log } = ctx;
  const since = state.getHighWaterMark(STREAM);
  const cycleMark = nowIso();

  const files = await source.listFiles(since);
  if (files.length === 0) {
    log.debug('files: nothing changed');
    state.setHighWaterMark(STREAM, cycleMark);
    return;
  }

  let migrated = 0;
  for (const file of files) {
    if (state.getLumibaseId(FILES_BUCKET, file.id)) continue; // already uploaded

    try {
      const downloaded = await source.downloadFile(file.id);
      const { bytes, meta } = mapFileUpload(downloaded);
      const uploaded = await lumibase.uploadFile(bytes, meta);
      state.setLumibaseId(FILES_BUCKET, file.id, uploaded.id);
      migrated++;
    } catch (err) {
      log.warn(`files: failed to migrate ${file.id} (${file.filename_download})`, err);
      // Leave unmapped; a later cycle retries. Do not advance the mark past failures.
      return;
    }
  }

  state.setHighWaterMark(STREAM, cycleMark);
  log.info(`files: migrated ${migrated} new file(s)`);
}
