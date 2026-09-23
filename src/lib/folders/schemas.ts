import { z } from 'zod';

export const FolderNameSchema = z.object({
  name: z.string().trim().min(1, 'Give the folder a name').max(100),
});

export const MoveQRSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  /** null moves the codes out of any folder. */
  folderId: z.string().uuid().nullable(),
});
