import { DbOps, WeeklyChallenge } from './db';
import { ChallengeDefinition } from './challenges';

export function computeProgress(
  dbOps: DbOps,
  challenge: WeeklyChallenge,
  def: ChallengeDefinition
): number {
  const weekEnd = new Date(challenge.week_start);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndStr = weekEnd.toISOString().slice(0, 10);

  switch (def.type) {
    case 'action_count':
      return dbOps.countActionsInWeek(
        challenge.user_id, challenge.partner_id,
        challenge.week_start, weekEndStr, def.action_type
      );
    case 'action_any_count':
      return dbOps.countActionsInWeek(
        challenge.user_id, challenge.partner_id,
        challenge.week_start, weekEndStr
      );
    case 'streak_days':
      return dbOps.countBothActiveDaysInWeek(
        challenge.user_id, challenge.partner_id,
        challenge.week_start, weekEndStr
      );
    case 'action_variety':
      return dbOps.countDistinctActionTypesInWeek(
        challenge.user_id, challenge.partner_id,
        challenge.week_start, weekEndStr
      );
    case 'daily_question_count':
      return dbOps.countBothAnsweredQuestionsInWeek(
        challenge.user_id, challenge.partner_id,
        challenge.week_start, weekEndStr
      );
    case 'custom_response': {
      // Count users who have submitted a response
      const r1 = dbOps.getChallengeResponse(challenge.id, challenge.user_id);
      const r2 = dbOps.getChallengeResponse(challenge.id, challenge.partner_id);
      return (r1 ? 1 : 0) + (r2 ? 1 : 0);
    }
    default:
      return 0;
  }
}
