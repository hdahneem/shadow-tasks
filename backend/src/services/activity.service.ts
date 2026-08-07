import { prisma } from '../lib/prisma.js';

export type ActivityType =
  | 'task_created'
  | 'title_changed'
  | 'description_changed'
  | 'status_changed'
  | 'status_moved'
  | 'priority_changed'
  | 'due_date_changed'
  | 'start_date_changed'
  | 'color_changed'
  | 'cover_image_changed'
  | 'archived'
  | 'restored'
  | 'moved'
  | 'duplicated'
  | 'comment_added'
  | 'comment_edited'
  | 'comment_deleted'
  | 'attachment_added'
  | 'attachment_removed'
  | 'subtask_added'
  | 'dependency_added'
  | 'dependency_removed'
  | 'relation_added'
  | 'relation_removed'
  | 'recurrence_set'
  | 'recurrence_updated'
  | 'recurrence_stopped'
  | 'recurrence_spawned'
  | 'recurrence_ended'
  | 'assignee_added'
  | 'assignee_removed'
  | 'tag_added'
  | 'tag_removed'
  | 'share_enabled'
  | 'share_revoked'
  | 'time_started'
  | 'time_stopped'
  | 'time_logged'
  | 'time_entry_removed'
  | 'automation_ran';

export function logActivity(
  taskId: string,
  actorId: string | null,
  type: ActivityType,
  payload?: Record<string, unknown>
) {
  return prisma.activityLogEntry.create({
    data: { taskId, actorId, type, payload: (payload ?? undefined) as never },
  });
}
