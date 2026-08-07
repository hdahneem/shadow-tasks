/**
 * Renders a human-readable sentence for a task activity log entry. Shared between
 * the per-task activity list (TaskDetail) and the cross-task workspace feed
 * (ActivityFeedView) so the two surfaces never drift out of sync.
 */
export function describeActivity(who: string, type: string, payload: Record<string, unknown> | null): string {
  const p = payload ?? {};
  switch (type) {
    case 'task_created':
      return `${who} created this quest`;
    case 'title_changed':
      return `${who} renamed it to "${p.to}"`;
    case 'description_changed':
      return `${who} updated the description`;
    case 'status_changed':
      return `${who} marked it ${p.done ? 'complete' : 'incomplete'}`;
    case 'status_moved':
      return p.from ? `${who} moved it from ${p.from} to ${p.to}` : `${who} set status to ${p.to}`;
    case 'priority_changed':
      return `${who} changed priority from ${p.from} to ${p.to}`;
    case 'due_date_changed':
      return p.to ? `${who} set the due date` : `${who} cleared the due date`;
    case 'start_date_changed':
      return p.to ? `${who} set the start date` : `${who} cleared the start date`;
    case 'color_changed':
      return `${who} changed the color`;
    case 'cover_image_changed':
      return `${who} updated the cover image`;
    case 'archived':
      return `${who} archived this quest`;
    case 'restored':
      return `${who} restored this quest`;
    case 'moved':
      return `${who} moved this quest to another list`;
    case 'duplicated':
      return `${who} duplicated this quest`;
    case 'comment_added':
      return `${who} added a comment`;
    case 'comment_edited':
      return `${who} edited a comment`;
    case 'comment_deleted':
      return `${who} deleted a comment`;
    case 'attachment_added':
      return `${who} attached ${p.filename}`;
    case 'attachment_removed':
      return `${who} removed an attachment`;
    case 'subtask_added':
      return `${who} added subtask "${p.title}"`;
    case 'dependency_added':
      return `${who} added a dependency on "${p.title}"`;
    case 'dependency_removed':
      return `${who} removed a dependency on "${p.title}"`;
    case 'relation_added':
      return `${who} linked "${p.title}"`;
    case 'relation_removed':
      return `${who} removed the link to "${p.title}"`;
    case 'recurrence_set':
      return `${who} set this quest to repeat ${p.frequency}`;
    case 'recurrence_updated':
      return `${who} updated the recurrence settings`;
    case 'recurrence_stopped':
      return `${who} stopped this quest from repeating`;
    case 'recurrence_spawned':
      return `${who} completed it — the next occurrence was created`;
    case 'recurrence_ended':
      return `Recurrence ended (${p.reason === 'max_occurrences_reached' ? 'reached max occurrences' : 'reached end date'})`;
    case 'assignee_added':
      return `${who} assigned ${p.name}`;
    case 'assignee_removed':
      return `${who} unassigned ${p.name}`;
    case 'tag_added':
      return `${who} tagged it "${p.name}"`;
    case 'tag_removed':
      return `${who} removed the "${p.name}" tag`;
    case 'time_started':
      return `${who} started a timer`;
    case 'time_stopped':
      return `${who} stopped the timer (${p.minutes}m)`;
    case 'time_logged':
      return `${who} logged ${p.minutes}m`;
    case 'time_entry_removed':
      return `${who} removed a time entry`;
    case 'share_enabled':
      return `${who} enabled a public link for this quest`;
    case 'share_revoked':
      return `${who} revoked the public link`;
    case 'automation_ran':
      return `Automation "${p.automationName}" ${p.summary}`;
    default:
      return `${who} updated this quest`;
  }
}
