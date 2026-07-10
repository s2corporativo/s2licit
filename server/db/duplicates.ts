/**
 * Barrel de acesso a dados - Domínio: Duplicidades e Equivalências.
 */
export {
  listEquivalenceGroups,
  getEquivalenceGroupWithMembers,
  createEquivalenceGroup,
  addEquivalenceMember,
  removeEquivalenceMember,
  deleteEquivalenceGroup,
  matchProductInMaster,
} from "../db";

export type { MatchResult } from "../db";
