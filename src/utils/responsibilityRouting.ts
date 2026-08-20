import type { ResponsibilityMatrix, ResponsibilityType, UUID } from '@/types/domain';

export type MatrixMember = ResponsibilityMatrix['members'][number];

/**
 * Who a piece of work in a responsibility area goes to.
 *
 * The matrix already records this — it was just never read by anything that
 * hands out work, which is why it behaves like a wall chart instead of a
 * routing table. Roles say what you are *allowed* to do; the matrix says what
 * is *expected* of you for this area.
 */
export interface AreaRouting {
  /** Does the work. */
  executor?: MatrixMember;
  /** Signs it off. */
  approver?: MatrixMember;
  /** Hears about it when it slips. */
  supervisor?: MatrixMember;
  /** Kept in the loop. */
  informed: MatrixMember[];
}

/*
  Ordered by how directly the responsibility type implies "you are the one who
  does this". The first match wins, so an area with a To Work On owner routes
  there even if someone else is listed as To Support.
*/
const EXECUTOR_PRIORITY: ResponsibilityType[] = [
  'TO_WORK_ON',
  'TO_BE_HELD_RESPONSIBLE',
  'TO_SUPPORT',
  'TO_MANAGE',
];

export function routingForArea(matrix: ResponsibilityMatrix | null | undefined, areaId: UUID | ''): AreaRouting {
  const empty: AreaRouting = { informed: [] };
  if (!matrix || !areaId) return empty;

  const membersById = new Map(matrix.members.map((member) => [member.userId, member]));
  const cells = matrix.cells.filter((cell) => cell.areaId === areaId);
  const firstOfType = (type: ResponsibilityType) =>
    membersById.get(cells.find((cell) => cell.type === type)?.memberUserId ?? '');

  const executor = EXECUTOR_PRIORITY.reduce<MatrixMember | undefined>(
    (found, type) => found ?? firstOfType(type),
    undefined,
  );

  return {
    executor,
    approver: firstOfType('TO_APPROVE'),
    supervisor: firstOfType('TO_SUPERVISE'),
    informed: cells
      .filter((cell) => cell.type === 'TO_BE_INFORMED')
      .map((cell) => membersById.get(cell.memberUserId))
      .filter((member): member is MatrixMember => Boolean(member)),
  };
}

export function memberLabel(member?: MatrixMember): string {
  if (!member) return 'Nobody assigned';
  return member.fullName || member.email;
}
