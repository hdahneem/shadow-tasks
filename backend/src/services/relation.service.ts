import type { RelationType } from '@prisma/client';

/**
 * The label shown on the *other* task for a given relation type. Most types read
 * the same from both sides ("Related", "Bug", ...); child/parent is the one
 * genuinely directional pair, so it flips.
 */
export const INVERSE_RELATION_TYPE: Record<RelationType, RelationType> = {
  related: 'related',
  duplicate: 'duplicate',
  child_project: 'parent_initiative',
  parent_initiative: 'child_project',
  bug: 'bug',
  requirement: 'requirement',
  documentation: 'documentation',
};
