import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { getMemberRole, roleAtLeast } from '../services/workspace.service.js';

export const fieldsRouter = Router();
fieldsRouter.use(requireAuth);

async function findAdminField(fieldId: string, userId: string) {
  const field = await prisma.customFieldDefinition.findFirst({
    where: { id: fieldId },
    include: { project: true },
  });
  if (!field) return null;
  const role = await getMemberRole(field.project.workspaceId, userId, field.projectId);
  if (!roleAtLeast(role, 'admin')) return null;
  return field;
}

const updateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  options: z.array(z.string().min(1).max(80)).max(50).optional(),
  position: z.number().optional(),
});

fieldsRouter.patch('/:id', validateBody(updateSchema), async (req: AuthedRequest, res) => {
  const field = await findAdminField(req.params.id, req.userId!);
  if (!field) return res.status(404).json({ error: 'Field not found' });

  if (
    req.body.options !== undefined &&
    (field.type === 'dropdown' || field.type === 'multi_select') &&
    req.body.options.length === 0
  ) {
    return res.status(400).json({ error: 'Dropdown and multi-select fields need at least one option' });
  }

  const updated = await prisma.customFieldDefinition.update({ where: { id: field.id }, data: req.body });
  res.json(updated);
});

fieldsRouter.delete('/:id', async (req: AuthedRequest, res) => {
  const field = await findAdminField(req.params.id, req.userId!);
  if (!field) return res.status(404).json({ error: 'Field not found' });

  await prisma.customFieldDefinition.delete({ where: { id: field.id } });
  res.status(204).send();
});
