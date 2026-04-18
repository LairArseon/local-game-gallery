import { unlink } from 'node:fs/promises';

/**
 * Shared staged archive upload map helpers.
 *
 * New to this project: these helpers keep temp upload lifecycle behavior
 * consistent between HTTP-service and desktop IPC entrypoints.
 */

export async function removeStagedArchiveUpload(
  stagedUploads: Map<string, { filePath: string; originalFileName: string }>,
  uploadId: string,
) {
  const staged = stagedUploads.get(uploadId);
  if (!staged) {
    return;
  }

  stagedUploads.delete(uploadId);
  await unlink(staged.filePath).catch(() => undefined);
}
