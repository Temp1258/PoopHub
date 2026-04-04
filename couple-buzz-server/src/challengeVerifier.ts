import { DbOps, WeeklyChallenge } from './db';
import { ChallengeDefinition } from './challenges';

export function computeProgress(
  dbOps: DbOps,
  challenge: WeeklyChallenge,
  def: ChallengeDefinition,
  requestingUserId: string
): number {
  const weekEnd = new Date(challenge.week_start);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  switch (def.type) {
    case 'action_count':
      // Per-user: count only the requesting user's actions
      return dbOps.countUserActionsInWeek(
        requestingUserId,
        challenge.week_start, weekEndStr, def.action_type
      );
    case 'action_any_count':
      // Per-user: count only the requesting user's actions
      return dbOps.countUserActionsInWeek(
        requestingUserId,
        challenge.week_start, weekEndStr
      );
    case 'streak_days':
      // Couple-based: both must be active
      return dbOps.countBothActiveDaysInWeek(
        challenge.user_id, challenge.partner_id,
        challenge.week_start, weekEndStr
      );
    case 'action_variety':
      // Per-user: count only the requesting user's distinct types
      return dbOps.countUserDistinctActionTypesInWeek(
        requestingUserId,
        challenge.week_start, weekEndStr
      );
    case 'daily_question_count':
      // Couple-based: both must answer
      return dbOps.countBothAnsweredQuestionsInWeek(
        challenge.user_id, challenge.partner_id,
        challenge.week_start, weekEndStr
      );
    case 'custom_response': {
      const r = dbOps.getChallengeResponse(challenge.id, requestingUserId);
      return r ? 1 : 0;
    }
    default:
      return 0;
  }
}
