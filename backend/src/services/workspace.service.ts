import type { WorkspaceRole } from '@prisma/client';
import { prisma } from '../lib/prisma.js';

const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

export function roleAtLeast(role: WorkspaceRole | null, minRole: WorkspaceRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

/**
 * Resolves a user's effective role: their workspace role, unless a project-level
 * override exists for `projectId`, in which case the override wins outright — it
 * can restrict (e.g. workspace admin capped to viewer on one sensitive project) or
 * elevate (workspace viewer promoted to admin on one project) relative to the
 * workspace role. Not being a workspace member at all always means no access,
 * regardless of any override row.
 */
export async function getMemberRole(
  workspaceId: string,
  userId: string,
  projectId?: string | null
): Promise<WorkspaceRole | null> {
  const membership = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  if (!membership) return null;
  if (!projectId) return membership.role;

  const override = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  return override?.role ?? membership.role;
}

export async function hasWorkspaceRole(
  workspaceId: string,
  userId: string,
  minRole: WorkspaceRole
): Promise<boolean> {
  const role = await getMemberRole(workspaceId, userId);
  return roleAtLeast(role, minRole);
}

export async function countOwners(workspaceId: string): Promise<number> {
  return prisma.workspaceMember.count({ where: { workspaceId, role: 'owner' } });
}

/** Creates a personal workspace for a brand-new user and makes them its owner. */
export async function createPersonalWorkspace(userId: string, userName: string) {
  return prisma.workspace.create({
    data: {
      name: `${userName}'s Workspace`,
      ownerId: userId,
      members: { create: { userId, role: 'owner' } },
    },
  });
}

/** Accepts every pending invite addressed to this email, adding the user as a member of each workspace. */
export async function acceptPendingInvites(userId: string, email: string): Promise<void> {
  const invites = await prisma.workspaceInvite.findMany({ where: { email, acceptedAt: null } });
  for (const invite of invites) {
    await prisma.$transaction([
      prisma.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: invite.workspaceId, userId } },
        create: { workspaceId: invite.workspaceId, userId, role: invite.role },
        update: {},
      }),
      prisma.workspaceInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } }),
    ]);
  }
}
