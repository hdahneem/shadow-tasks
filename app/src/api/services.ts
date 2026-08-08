import { api } from './client';
import type {
  Folder,
  Project,
  TodoList,
  Task,
  Rank,
  Priority,
  Comment,
  Attachment,
  CustomFieldDefinition,
  FieldType,
  FieldValue,
  TaskCustomField,
  Status,
  SearchResults,
  SavedSearch,
  SavedSearchFilters,
  ProjectTemplate,
  TaskTemplate,
  Workspace,
  WorkspaceMember,
  WorkspaceInvite,
  WorkspaceRole,
  TaskDependency,
  DependencyType,
  TaskRelation,
  RelationType,
  RecurrenceRule,
  RecurrenceFrequency,
  RecurrenceMode,
  TaskAssignee,
  TimeEntry,
  AppNotification,
  NotificationPreference,
  NotificationType,
  Automation,
  AutomationTriggerType,
  AutomationActionType,
  Doc,
  DocSummary,
  PublicTask,
  WorkspaceActivityEntry,
  WorkloadEntry,
  ProjectMemberAccess,
  Tag,
  PaginatedTasks,
  SyncStatus,
} from '../types';

// --- Workspaces ---
export const workspacesApi = {
  list: () => api.get<Workspace[]>('/workspaces'),
  create: (name: string) => api.post<Workspace>('/workspaces', { name }),
  rename: (id: string, name: string) => api.patch<Workspace>(`/workspaces/${id}`, { name }),
  members: (workspaceId: string) => api.get<WorkspaceMember[]>(`/workspaces/${workspaceId}/members`),
  changeMemberRole: (workspaceId: string, userId: string, role: WorkspaceRole) =>
    api.patch<WorkspaceMember>(`/workspaces/${workspaceId}/members/${userId}`, { role }),
  removeMember: (workspaceId: string, userId: string) =>
    api.delete<void>(`/workspaces/${workspaceId}/members/${userId}`),
  invites: (workspaceId: string) => api.get<WorkspaceInvite[]>(`/workspaces/${workspaceId}/invites`),
  invite: (workspaceId: string, email: string, role: WorkspaceRole) =>
    api.post<WorkspaceInvite & { autoAccepted: boolean }>(`/workspaces/${workspaceId}/invites`, { email, role }),
  revokeInvite: (workspaceId: string, inviteId: string) =>
    api.delete<void>(`/workspaces/${workspaceId}/invites/${inviteId}`),
  activity: (workspaceId: string, limit = 50, offset = 0) =>
    api.get<WorkspaceActivityEntry[]>(`/workspaces/${workspaceId}/activity?limit=${limit}&offset=${offset}`),
  workload: (workspaceId: string) => api.get<WorkloadEntry[]>(`/workspaces/${workspaceId}/workload`),
};

// --- Folders ---
export const foldersApi = {
  list: () => api.get<Folder[]>('/folders'),
  create: (name: string, color: string, workspaceId: string) =>
    api.post<Folder>('/folders', { name, color, workspaceId }),
  update: (id: string, patch: Partial<Pick<Folder, 'name' | 'color'>>) =>
    api.patch<Folder>(`/folders/${id}`, patch),
  remove: (id: string) => api.delete<void>(`/folders/${id}`),
};

// --- Projects ---
export const projectsApi = {
  list: () => api.get<Project[]>('/projects'),
  create: (data: { name: string; folderId: string | null; rank: Rank; description?: string; workspaceId: string }) =>
    api.post<Project>('/projects', data),
  update: (id: string, patch: Partial<Pick<Project, 'name' | 'description' | 'rank' | 'folderId'>>) =>
    api.patch<Project>(`/projects/${id}`, patch),
  remove: (id: string) => api.delete<void>(`/projects/${id}`),
  members: (projectId: string) => api.get<ProjectMemberAccess[]>(`/projects/${projectId}/members`),
  setMemberRole: (projectId: string, userId: string, role: WorkspaceRole) =>
    api.put<{ userId: string; overrideRole: WorkspaceRole; effectiveRole: WorkspaceRole }>(
      `/projects/${projectId}/members/${userId}`,
      { role }
    ),
  removeMemberOverride: (projectId: string, userId: string) =>
    api.delete<void>(`/projects/${projectId}/members/${userId}`),
};

// --- Lists ---
export const listsApi = {
  listAll: () => api.get<TodoList[]>('/lists'),
  listForProject: (projectId: string) => api.get<TodoList[]>(`/projects/${projectId}/lists`),
  create: (projectId: string, name: string) =>
    api.post<TodoList>(`/projects/${projectId}/lists`, { name }),
  rename: (id: string, name: string) => api.patch<TodoList>(`/lists/${id}`, { name }),
  remove: (id: string) => api.delete<void>(`/lists/${id}`),
};

export interface TaskCreateInput {
  title: string;
  description?: string;
  priority?: Priority;
  dueDate?: string;
  startDate?: string;
  color?: string;
  parentTaskId?: string;
}

export interface TaskUpdateInput {
  title?: string;
  description?: string | null;
  priority?: Priority;
  done?: boolean;
  color?: string | null;
  coverImageUrl?: string | null;
  dueDate?: string | null;
  startDate?: string | null;
  estimatedMinutes?: number | null;
  actualMinutes?: number | null;
}

// --- Tasks ---
export const tasksApi = {
  listAll: (includeDone = false, archived = false) =>
    api.get<Task[]>(`/tasks?includeDone=${includeDone}&archived=${archived}`),
  listAllPaged: (opts: { includeDone?: boolean; archived?: boolean; page: number; pageSize?: number }) => {
    const { includeDone = false, archived = false, page, pageSize = 25 } = opts;
    return api.get<PaginatedTasks>(
      `/tasks?includeDone=${includeDone}&archived=${archived}&page=${page}&pageSize=${pageSize}`
    );
  },
  syncStatus: () => api.get<SyncStatus>('/tasks/sync-status?includeDone=true'),
  listForList: (listId: string) => api.get<Task[]>(`/tasks/by-list/${listId}`),
  listForProject: (projectId: string) => api.get<Task[]>(`/projects/${projectId}/tasks`),
  get: (id: string) => api.get<Task>(`/tasks/${id}`),
  create: (listId: string, data: TaskCreateInput) =>
    api.post<Task>(`/tasks/by-list/${listId}`, data),
  update: (id: string, patch: TaskUpdateInput) => api.patch<Task>(`/tasks/${id}`, patch),
  remove: (id: string) => api.delete<void>(`/tasks/${id}`),
  archive: (id: string) => api.post<Task>(`/tasks/${id}/archive`),
  restore: (id: string) => api.post<Task>(`/tasks/${id}/restore`),
  move: (id: string, listId: string) => api.post<Task>(`/tasks/${id}/move`, { listId }),
  duplicate: (id: string) => api.post<Task>(`/tasks/${id}/duplicate`),
  reorder: (id: string, patch: { parentTaskId?: string | null; position: number }) =>
    api.patch<Task>(`/tasks/${id}/reorder`, patch),
  setStatus: (id: string, statusId: string) => api.patch<Task>(`/tasks/${id}/status`, { statusId }),
  addComment: (id: string, body: string, parentCommentId?: string) =>
    api.post<Comment>(`/tasks/${id}/comments`, { body, parentCommentId }),
  uploadAttachment: (id: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.upload<Attachment>(`/tasks/${id}/attachments`, form);
  },
};

export const dependenciesApi = {
  create: (taskId: string, predecessorId: string, type: DependencyType) =>
    api.post<TaskDependency>(`/tasks/${taskId}/dependencies`, { predecessorId, type }),
  remove: (dependencyId: string) => api.delete<void>(`/dependencies/${dependencyId}`),
};

export const relationsApi = {
  create: (taskId: string, relatedTaskId: string, type: RelationType) =>
    api.post<TaskRelation>(`/tasks/${taskId}/relations`, { relatedTaskId, type }),
  remove: (relationId: string) => api.delete<void>(`/relations/${relationId}`),
};

export interface RecurrenceCreateInput {
  frequency: RecurrenceFrequency;
  interval: number;
  mode: RecurrenceMode;
  skipWeekends: boolean;
  endDate?: string | null;
  maxOccurrences?: number | null;
}

export interface RecurrenceUpdateInput {
  interval?: number;
  skipWeekends?: boolean;
  endDate?: string | null;
  maxOccurrences?: number | null;
}

export const assigneesApi = {
  add: (taskId: string, userId: string) => api.post<TaskAssignee>(`/tasks/${taskId}/assignees`, { userId }),
  remove: (taskId: string, userId: string) => api.delete<void>(`/tasks/${taskId}/assignees/${userId}`),
};

// --- Tags (workspace-wide labels) ---
export const tagsApi = {
  list: (workspaceId: string) => api.get<Tag[]>(`/tags?workspaceId=${workspaceId}`),
  create: (workspaceId: string, name: string, color: string) =>
    api.post<Tag>('/tags', { workspaceId, name, color }),
  update: (id: string, patch: Partial<Pick<Tag, 'name' | 'color'>>) => api.patch<Tag>(`/tags/${id}`, patch),
  remove: (id: string) => api.delete<void>(`/tags/${id}`),
};

export const taskTagsApi = {
  add: (taskId: string, tagId: string) => api.post<Tag>(`/tasks/${taskId}/tags`, { tagId }),
  remove: (taskId: string, tagId: string) => api.delete<void>(`/tasks/${taskId}/tags/${tagId}`),
};

export interface TimeEntryLogInput {
  startedAt: string;
  endedAt: string;
  note?: string;
}

export interface TimeEntryUpdateInput {
  startedAt?: string;
  endedAt?: string | null;
  note?: string | null;
}

export const timeEntriesApi = {
  start: (taskId: string) => api.post<TimeEntry>(`/tasks/${taskId}/time-entries/start`),
  stop: (taskId: string) => api.post<TimeEntry>(`/tasks/${taskId}/time-entries/stop`),
  logManual: (taskId: string, data: TimeEntryLogInput) => api.post<TimeEntry>(`/tasks/${taskId}/time-entries`, data),
  update: (entryId: string, patch: TimeEntryUpdateInput) => api.patch<TimeEntry>(`/time-entries/${entryId}`, patch),
  remove: (entryId: string) => api.delete<void>(`/time-entries/${entryId}`),
};

export const shareApi = {
  enable: (taskId: string) => api.post<{ shareToken: string }>(`/tasks/${taskId}/share`),
  revoke: (taskId: string) => api.delete<void>(`/tasks/${taskId}/share`),
};

export const publicApi = {
  getTask: (token: string) => api.get<PublicTask>(`/public/tasks/${token}`, { skipAuth: true }),
};

export const docsApi = {
  list: (workspaceId: string) => api.get<DocSummary[]>(`/docs?workspaceId=${workspaceId}`),
  create: (workspaceId: string, title: string) => api.post<Doc>('/docs', { workspaceId, title }),
  get: (id: string) => api.get<Doc>(`/docs/${id}`),
  update: (id: string, patch: Partial<Pick<Doc, 'title' | 'content'>>) => api.patch<Doc>(`/docs/${id}`, patch),
  remove: (id: string) => api.delete<void>(`/docs/${id}`),
};

export const notificationsApi = {
  list: () => api.get<{ notifications: AppNotification[]; unreadCount: number }>('/notifications'),
  markRead: (id: string) => api.post<AppNotification>(`/notifications/${id}/read`),
  markAllRead: () => api.post<void>('/notifications/read-all'),
  remove: (id: string) => api.delete<void>(`/notifications/${id}`),
  getPreferences: () => api.get<NotificationPreference[]>('/notifications/preferences'),
  setPreference: (type: NotificationType, muted: boolean) =>
    api.put<NotificationPreference>(`/notifications/preferences/${type}`, { muted }),
};

export const recurrenceApi = {
  create: (taskId: string, data: RecurrenceCreateInput) =>
    api.post<RecurrenceRule>(`/tasks/${taskId}/recurrence`, data),
  update: (ruleId: string, patch: RecurrenceUpdateInput) =>
    api.patch<RecurrenceRule>(`/recurrence/${ruleId}`, patch),
  stop: (ruleId: string) => api.delete<void>(`/recurrence/${ruleId}`),
};

export const commentsApi = {
  update: (id: string, body: string) => api.patch<Comment>(`/comments/${id}`, { body }),
  remove: (id: string) => api.delete<void>(`/comments/${id}`),
};

export const attachmentsApi = {
  remove: (id: string) => api.delete<void>(`/attachments/${id}`),
};

// --- Custom field definitions (per project) ---
export const fieldsApi = {
  listForProject: (projectId: string) =>
    api.get<CustomFieldDefinition[]>(`/projects/${projectId}/fields`),
  create: (projectId: string, data: { name: string; type: FieldType; options?: string[] }) =>
    api.post<CustomFieldDefinition>(`/projects/${projectId}/fields`, data),
  update: (id: string, patch: { name?: string; options?: string[]; position?: number }) =>
    api.patch<CustomFieldDefinition>(`/fields/${id}`, patch),
  remove: (id: string) => api.delete<void>(`/fields/${id}`),
  setValue: (taskId: string, fieldId: string, value: FieldValue) =>
    api.patch<TaskCustomField>(`/tasks/${taskId}/fields/${fieldId}`, { value }),
};

// --- Statuses (per-project workflow columns) ---
export const statusesApi = {
  listForProject: (projectId: string) => api.get<Status[]>(`/projects/${projectId}/statuses`),
  create: (projectId: string, data: { name: string; color: string; isCompleted?: boolean }) =>
    api.post<Status>(`/projects/${projectId}/statuses`, data),
  update: (id: string, patch: Partial<Pick<Status, 'name' | 'color' | 'position' | 'isCompleted'>>) =>
    api.patch<Status>(`/statuses/${id}`, patch),
  remove: (id: string) => api.delete<void>(`/statuses/${id}`),
};

export const automationsApi = {
  listForProject: (projectId: string) => api.get<Automation[]>(`/projects/${projectId}/automations`),
  create: (
    projectId: string,
    data: {
      name: string;
      triggerType: AutomationTriggerType;
      triggerConfig?: Automation['triggerConfig'];
      actionType: AutomationActionType;
      actionConfig?: Automation['actionConfig'];
    }
  ) => api.post<Automation>(`/projects/${projectId}/automations`, data),
  update: (id: string, patch: Partial<Pick<Automation, 'name' | 'enabled'>>) =>
    api.patch<Automation>(`/automations/${id}`, patch),
  remove: (id: string) => api.delete<void>(`/automations/${id}`),
};

// --- Search ---
export interface SearchQuery extends SavedSearchFilters {
  q?: string;
}

export const searchApi = {
  run: (query: SearchQuery) => {
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    if (query.priority) params.set('priority', query.priority);
    if (query.done !== undefined) params.set('done', String(query.done));
    if (query.projectId) params.set('projectId', query.projectId);
    if (query.dueFrom) params.set('dueFrom', query.dueFrom);
    if (query.dueTo) params.set('dueTo', query.dueTo);
    return api.get<SearchResults>(`/search?${params.toString()}`);
  },
};

export const savedSearchesApi = {
  list: () => api.get<SavedSearch[]>('/saved-searches'),
  create: (data: { name: string; query?: string; filters?: SavedSearchFilters }) =>
    api.post<SavedSearch>('/saved-searches', data),
  remove: (id: string) => api.delete<void>(`/saved-searches/${id}`),
};

// --- Templates ---
export const projectTemplatesApi = {
  list: () => api.get<ProjectTemplate[]>('/project-templates'),
  saveFromProject: (projectId: string, name: string) =>
    api.post<ProjectTemplate>(`/projects/${projectId}/save-as-template`, { name }),
  remove: (id: string) => api.delete<void>(`/project-templates/${id}`),
  createProject: (
    templateId: string,
    data: { name: string; folderId: string | null; rank: Rank; description?: string; workspaceId: string }
  ) => api.post<Project>(`/project-templates/${templateId}/create-project`, data),
};

export const taskTemplatesApi = {
  list: () => api.get<TaskTemplate[]>('/task-templates'),
  saveFromTask: (taskId: string, name: string) =>
    api.post<TaskTemplate>(`/tasks/${taskId}/save-as-template`, { name }),
  remove: (id: string) => api.delete<void>(`/task-templates/${id}`),
  createTask: (templateId: string, listId: string) =>
    api.post<Task>(`/task-templates/${templateId}/create-task`, { listId }),
};
