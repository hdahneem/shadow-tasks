export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

export type Priority = 'low' | 'medium' | 'high';

export interface ActivityEntry {
  id: string;
  taskId: string;
  actorId: string | null;
  actor: { id: string; name: string } | null;
  type: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface Comment {
  id: string;
  taskId: string;
  authorId: string;
  author: { id: string; name: string };
  body: string;
  createdAt: string;
  editedAt: string | null;
  parentCommentId: string | null;
}

export interface Attachment {
  id: string;
  taskId: string;
  filename: string;
  url: string;
  mimeType: string;
  size: number;
  createdAt: string;
}

export interface SearchCommentHit {
  id: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  author: { id: string; name: string };
  task: { id: string; title: string; list: { id: string; name: string; project: { id: string; name: string } } };
}

export interface SearchDocHit {
  id: string;
  title: string;
  content: string;
  updatedAt: string;
  workspace: { id: string; name: string };
}

export interface SearchResults {
  tasks: Task[];
  comments: SearchCommentHit[];
  docs: SearchDocHit[];
}

export interface SavedSearchFilters {
  priority?: Priority;
  done?: boolean;
  projectId?: string;
  dueFrom?: string;
  dueTo?: string;
}

export interface SavedSearch {
  id: string;
  userId: string;
  name: string;
  query: string | null;
  filters: SavedSearchFilters | null;
  createdAt: string;
}

export type FieldType =
  | 'text'
  | 'number'
  | 'email'
  | 'phone'
  | 'currency'
  | 'rating'
  | 'checkbox'
  | 'dropdown'
  | 'multi_select'
  | 'date'
  | 'url';

export const FIELD_TYPES: FieldType[] = [
  'text',
  'number',
  'email',
  'phone',
  'currency',
  'rating',
  'checkbox',
  'dropdown',
  'multi_select',
  'date',
  'url',
];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Text',
  number: 'Number',
  email: 'Email',
  phone: 'Phone',
  currency: 'Currency',
  rating: 'Rating',
  checkbox: 'Checkbox',
  dropdown: 'Dropdown',
  multi_select: 'Multi-select',
  date: 'Date',
  url: 'URL',
};

export interface CustomFieldDefinition {
  id: string;
  projectId: string;
  name: string;
  type: FieldType;
  options: string[] | null;
  position: number;
  createdAt: string;
}

export type FieldValue = string | number | boolean | string[] | null;

export interface TaskCustomField {
  id: string;
  name: string;
  type: FieldType;
  options: string[] | null;
  value: FieldValue;
}

export interface Status {
  id: string;
  projectId: string;
  name: string;
  color: string;
  position: number;
  isCompleted: boolean;
  createdAt: string;
}

export type AutomationTriggerType = 'task_created' | 'status_changed_to' | 'task_completed' | 'assignee_added';
export type AutomationActionType = 'set_status' | 'set_priority' | 'assign_user' | 'add_comment' | 'add_tag';

export const AUTOMATION_TRIGGER_LABELS: Record<AutomationTriggerType, string> = {
  task_created: 'Task Created',
  status_changed_to: 'Status Changed To',
  task_completed: 'Task Completed',
  assignee_added: 'Assignee Added',
};

export const AUTOMATION_ACTION_LABELS: Record<AutomationActionType, string> = {
  set_status: 'Set Status',
  set_priority: 'Set Priority',
  assign_user: 'Assign User',
  add_comment: 'Add Comment',
  add_tag: 'Add Tag',
};

export interface Automation {
  id: string;
  projectId: string;
  name: string;
  enabled: boolean;
  triggerType: AutomationTriggerType;
  triggerConfig: { statusId?: string };
  actionType: AutomationActionType;
  actionConfig: { statusId?: string; priority?: Priority; userId?: string; body?: string; tagId?: string };
  createdAt: string;
  updatedAt: string;
}

export interface ProjectTemplateStatus {
  name: string;
  color: string;
  isCompleted: boolean;
  position: number;
}

export interface ProjectTemplateField {
  name: string;
  type: FieldType;
  options: string[] | null;
  position: number;
}

export interface ProjectTemplate {
  id: string;
  userId: string;
  name: string;
  statuses: ProjectTemplateStatus[];
  fields: ProjectTemplateField[];
  listNames: string[];
  createdAt: string;
}

export interface ChecklistNode {
  title: string;
  priority: Priority;
  children: ChecklistNode[];
}

export interface TaskTemplate {
  id: string;
  userId: string;
  name: string;
  title: string;
  description: string | null;
  priority: Priority;
  subtasks: ChecklistNode[];
  createdAt: string;
}

export type DependencyType = 'finish_to_start' | 'start_to_start' | 'finish_to_finish';

export const DEPENDENCY_TYPES: DependencyType[] = ['finish_to_start', 'start_to_start', 'finish_to_finish'];

export const DEPENDENCY_TYPE_LABELS: Record<DependencyType, string> = {
  finish_to_start: 'Finish → Start',
  start_to_start: 'Start → Start',
  finish_to_finish: 'Finish → Finish',
};

export interface TaskSummary {
  id: string;
  title: string;
  done: boolean;
  priority: Priority;
}

export interface TaskDependency {
  id: string;
  type: DependencyType;
  task: TaskSummary;
}

export type RelationType =
  | 'related'
  | 'duplicate'
  | 'child_project'
  | 'parent_initiative'
  | 'bug'
  | 'requirement'
  | 'documentation';

export const RELATION_TYPES: RelationType[] = [
  'related',
  'duplicate',
  'child_project',
  'parent_initiative',
  'bug',
  'requirement',
  'documentation',
];

export const RELATION_TYPE_LABELS: Record<RelationType, string> = {
  related: 'Related',
  duplicate: 'Duplicate',
  child_project: 'Child Project',
  parent_initiative: 'Parent Initiative',
  bug: 'Bug',
  requirement: 'Requirement',
  documentation: 'Documentation',
};

export interface TaskRelation {
  id: string;
  type: RelationType;
  task: TaskSummary;
}

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';

export const RECURRENCE_FREQUENCIES: RecurrenceFrequency[] = ['daily', 'weekly', 'monthly', 'yearly'];

export const RECURRENCE_FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

export type RecurrenceMode = 'after_completion' | 'fixed_schedule';

export const RECURRENCE_MODES: RecurrenceMode[] = ['after_completion', 'fixed_schedule'];

export const RECURRENCE_MODE_LABELS: Record<RecurrenceMode, string> = {
  after_completion: 'After completion',
  fixed_schedule: 'Fixed schedule',
};

export interface TaskAssignee {
  id: string;
  name: string;
}

export interface Tag {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  createdAt: string;
}

export type NotificationType = 'assigned' | 'comment_added' | 'mentioned' | 'due_soon';

export interface AppNotification {
  id: string;
  type: NotificationType;
  taskId: string;
  taskTitle: string;
  actorName: string | null;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
}

export interface NotificationPreference {
  type: NotificationType;
  muted: boolean;
}

export interface TimeEntry {
  id: string;
  userId: string;
  userName: string;
  startedAt: string;
  endedAt: string | null;
  note: string | null;
}

export interface RecurrenceRule {
  id: string;
  listId: string;
  frequency: RecurrenceFrequency;
  interval: number;
  mode: RecurrenceMode;
  skipWeekends: boolean;
  endDate: string | null;
  maxOccurrences: number | null;
  occurrenceCount: number;
  active: boolean;
  nextRunAt: string | null;
  createdAt: string;
}

export interface SubtaskNode {
  id: string;
  parentTaskId: string | null;
  title: string;
  done: boolean;
  priority: Priority;
  dueDate: string | null;
  position: number;
  progress: number;
  children: SubtaskNode[];
}

export interface Task {
  id: string;
  listId: string;
  parentTaskId: string | null;
  title: string;
  description?: string | null;
  priority: Priority;
  done: boolean;
  statusId?: string | null;
  status?: Status | null;
  color?: string | null;
  coverImageUrl?: string | null;
  position: number;
  startDate?: string | null;
  dueDate?: string | null;
  estimatedMinutes?: number | null;
  actualMinutes?: number | null;
  archivedAt?: string | null;
  completedAt?: string | null;
  shareToken?: string | null;
  createdAt: string;
  updatedAt: string;
  progress: number;
  // present on list-view responses
  _count?: { subtasks: number; comments: number };
  list?: { id: string; name: string; project?: { id: string; name: string } };
  // present only on the full task-detail response
  projectId?: string;
  workspaceId?: string;
  subtasks?: SubtaskNode[];
  comments?: Comment[];
  activity?: ActivityEntry[];
  attachments?: Attachment[];
  customFields?: TaskCustomField[];
  dependsOn?: TaskDependency[];
  blocks?: TaskDependency[];
  relatedTasks?: TaskRelation[];
  recurrence?: RecurrenceRule | null;
  assignees?: TaskAssignee[];
  tags?: Tag[];
  timeEntries?: TimeEntry[];
  loggedMinutes?: number;
}

export interface PaginatedTasks {
  tasks: Task[];
  total: number;
  page: number;
  pageSize: number;
}

export interface SyncStatus {
  lastModifiedAt: string | null;
  count: number;
}

export interface TodoList {
  id: string;
  projectId: string;
  name: string;
  createdAt: string;
}

export interface Project {
  id: string;
  workspaceId: string;
  folderId: string | null;
  name: string;
  description?: string | null;
  rank: Rank;
  createdAt: string;
  effectiveRole: WorkspaceRole;
}

export interface ProjectMemberAccess {
  userId: string;
  user: WorkspaceMemberUser;
  workspaceRole: WorkspaceRole;
  overrideRole: WorkspaceRole | null;
  effectiveRole: WorkspaceRole;
}

export interface Folder {
  id: string;
  workspaceId: string;
  name: string;
  color: string;
  createdAt: string;
}

export type WorkspaceRole = 'viewer' | 'member' | 'admin' | 'owner';

export const WORKSPACE_ROLES: WorkspaceRole[] = ['viewer', 'member', 'admin', 'owner'];

export interface Workspace {
  id: string;
  name: string;
  ownerId: string;
  role: WorkspaceRole;
  createdAt: string;
}

export interface WorkspaceMemberUser {
  id: string;
  name: string;
  email: string;
}

export interface WorkspaceMember {
  id: string;
  role: WorkspaceRole;
  createdAt: string;
  user: WorkspaceMemberUser;
}

export interface WorkspaceInvite {
  id: string;
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  invitedById: string;
  createdAt: string;
  acceptedAt: string | null;
}

export interface HunterState {
  level: number;
  xp: number;
  tasksCompleted: number;
}

export const RANKS: Rank[] = ['E', 'D', 'C', 'B', 'A', 'S'];

export const RANK_COLORS: Record<Rank, string> = {
  E: '#9CA3AF',
  D: '#4ADE80',
  C: '#38BDF8',
  B: '#A78BFA',
  A: '#FB923C',
  S: '#F43F5E',
};

export const PRIORITY_XP: Record<Priority, number> = {
  low: 10,
  medium: 20,
  high: 35,
};

export interface DocSummary {
  id: string;
  workspaceId: string;
  title: string;
  authorName: string;
  createdAt: string;
  updatedAt: string;
}

export interface Doc extends DocSummary {
  content: string;
}

export interface PublicComment {
  authorName: string;
  body: string;
  createdAt: string;
}

export interface WorkspaceActivityEntry {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
  actorName: string | null;
  taskId: string;
  taskTitle: string;
}

export interface WorkloadEntry {
  userId: string;
  name: string;
  totalTasks: number;
  openTasks: number;
  doneTasks: number;
  overdueTasks: number;
  estimatedMinutes: number;
  actualMinutes: number;
}

export interface PublicTask {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  done: boolean;
  status: { name: string; color: string; isCompleted: boolean } | null;
  startDate: string | null;
  dueDate: string | null;
  progress: number;
  projectName: string;
  listName: string;
  subtasks: SubtaskNode[];
  comments: PublicComment[];
}
