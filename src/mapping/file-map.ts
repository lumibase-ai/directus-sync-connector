import type { DownloadedFile } from '../directus/types';

/** Map a downloaded Directus asset to the Lumibase upload arguments. */
export function mapFileUpload(file: DownloadedFile): {
  bytes: Buffer;
  meta: { filename: string; type?: string; title?: string; folder?: string };
} {
  return {
    bytes: file.bytes,
    meta: {
      filename: file.filename,
      type: file.type,
      title: file.title,
      folder: file.folder,
    },
  };
}

/** Synthetic id-map bucket for files, so item FK rewrites can resolve file references. */
export const FILES_BUCKET = 'directus_files';
