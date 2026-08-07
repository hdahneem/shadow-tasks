import type { AutomationActionType, AutomationTriggerType } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logActivity } from './activity.service.js';
import { getMemberRole } from './workspace.service.js';

interface TriggerContext {
  statusId?: string;
}

/**
 * Runs every enabled automation on a project that matches the given trigger, applying
 * each one's action directly via Prisma rather than re-entering the route handlers that
 * fired this trigger — so an automation's own side effects (e.g. set_status) never
 * re-trigger another automation pass. Automations only ever react to genuine
 * user-initiated events, one hop deep.
 */
export async function runAutomations(
  taskId: string,
  projectId: string,
  workspaceId: string,
  trigger: AutomationTriggerType,
  actorId: string,
  context: TriggerContext = {}
): Promise<void> {
  const automations = await prisma.automation.findMany({
    where: { projectId, enabled: true, triggerType: trigger },
  });
  if (automations.length === 0) return;

  for (const automation of automations) {
    if (trigger === 'status_changed_to') {
      const config = automation.triggerConfig as { statusId?: string };
      if (!config.statusId || config.statusId !== context.statusId) continue;
    }
    await executeAction(automation.id, automation.name, automation.actionType, automation.actionConfig, taskId, workspaceId, actorId);
  }
}

async function executeAction(
  automationId: string,
  automationName: string,
  actionType: AutomationActionType,
  actionConfig: unknown,
  taskId: string,
  workspaceId: string,
  actorId: string
): Promise<void> {
  const config = (actionConfig ?? {}) as Record<string, unknown>;

  switch (actionType) {
    case 'set_status': {
      const statusId = config.statusId as string | undefined;
      if (!statusId) return;
      const status = await prisma.status.findUnique({ where: { id: statusId } });
      if (!status) return;
      await prisma.task.update({
        where: { id: taskId },
        data: { statusId: status.id, done: status.isCompleted, completedAt: status.isCompleted ? new Date() : null },
      });
      await logActivity(taskId, actorId, 'automation_ran', {
        automationName,
        summary: `set status to ${status.name}`,
      });
      return;
    }
    case 'set_priority': {
      const priority = config.priority as string | undefined;
      if (!priority || !['low', 'medium', 'high'].includes(priority)) return;
      await prisma.task.update({ where: { id: taskId }, data: { priority: priority as never } });
      await logActivity(taskId, actorId, 'automation_ran', {
        automationName,
        summary: `set priority to ${priority}`,
      });
      return;
    }
    case 'assign_user': {
      const userId = config.userId as string | undefined;
      if (!userId) return;
      const role = await getMemberRole(workspaceId, userId);
      if (!role) return;
      const existing = await prisma.taskAssignee.findUnique({
        where: { taskId_userId: { taskId, userId } },
      });
      if (existing) return;
      const assignee = await prisma.taskAssignee.create({
        data: { taskId, userId },
        include: { user: { select: { name: true } } },
      });
      await logActivity(taskId, actorId, 'automation_ran', {
        automationName,
        summary: `assigned ${assignee.user.name}`,
      });
      return;
    }
    case 'add_comment': {
      const body = config.body as string | undefined;
      if (!body || !body.trim()) return;
      await prisma.comment.create({ data: { taskId, authorId: actorId, body } });
      await logActivity(taskId, actorId, 'automation_ran', {
        automationName,
        summary: 'added a comment',
      });
      return;
    }
    case 'add_tag': {
      const tagId = config.tagId as string | undefined;
      if (!tagId) return;
      const tag = await prisma.tag.findUnique({ where: { id: tagId } });
      if (!tag || tag.workspaceId !== workspaceId) return;
      const existing = await prisma.taskTag.findUnique({ where: { taskId_tagId: { taskId, tagId } } });
      if (existing) return;
      await prisma.taskTag.create({ data: { taskId, tagId } });
      await logActivity(taskId, actorId, 'automation_ran', {
        automationName,
        summary: `added the "${tag.name}" tag`,
      });
      return;
    }
  }
}

export const AUTOMATION_TRIGGER_TYPES: AutomationTriggerType[] = [
  'task_created',
  'status_changed_to',
  'task_completed',
  'assignee_added',
];

export const AUTOMATION_ACTION_TYPES: AutomationActionType[] = [
  'set_status',
  'set_priority',
  'assign_user',
  'add_comment',
  'add_tag',
];
