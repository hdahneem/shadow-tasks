import { Router } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { logActivity } from '../services/activity.service.js';
import { getMemberRole, roleAtLeast } from '../services/workspace.service.js';
import { env } from '../lib/env.js';

export const attachmentsRouter = Router();
attachmentsRouter.use(requireAuth);

attachmentsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const found = await prisma.attachment.findFirst({
    where: { id: req.params.id },
    include: { task: { include: { list: { include: { project: true } } } } },
  });
  const role = found
    ? await getMemberRole(found.task.list.project.workspaceId, req.userId!, found.task.list.projectId)
    : null;
  if (!found || !roleAtLeast(role, 'member')) return res.status(404).json({ error: 'Attachment not found' });
  const attachment = found;

  await prisma.attachment.delete({ where: { id: attachment.id } });
  await logActivity(attachment.taskId, req.userId!, 'attachment_removed', { filename: attachment.filename });

  const filePath = path.join(env.uploadsDir, path.basename(attachment.url));
  fs.unlink(filePath, (err) => {
    if (err && err.code !== 'ENOENT') console.error(`Failed to delete attachment file ${filePath}:`, err);
  });

  res.status(204).send();
});
