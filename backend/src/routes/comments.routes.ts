import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { logActivity } from '../services/activity.service.js';

export const commentsRouter = Router();
commentsRouter.use(requireAuth);

async function findEditableComment(commentId: string, userId: string) {
  return prisma.comment.findFirst({ where: { id: commentId, authorId: userId } });
}

const updateSchema = z.object({ body: z.string().min(1).max(10000) });

commentsRouter.patch('/:id', validateBody(updateSchema), async (req: AuthedRequest, res) => {
  const comment = await findEditableComment(req.params.id, req.userId!);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  const updated = await prisma.comment.update({
    where: { id: comment.id },
    data: { body: req.body.body, editedAt: new Date() },
    include: { author: { select: { id: true, name: true } } },
  });
  await logActivity(comment.taskId, req.userId!, 'comment_edited', { commentId: comment.id });
  res.json(updated);
});

commentsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const comment = await findEditableComment(req.params.id, req.userId!);
  if (!comment) return res.status(404).json({ error: 'Comment not found' });

  await prisma.comment.delete({ where: { id: comment.id } });
  await logActivity(comment.taskId, req.userId!, 'comment_deleted', { commentId: comment.id });
  res.status(204).send();
});
