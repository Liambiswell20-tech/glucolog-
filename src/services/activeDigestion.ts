/**
 * Active digestion window computation — Section 8.6
 * Determines if any meal is currently within its digestion window
 * and returns remaining time for the home screen footer.
 */
import type { Meal, Session } from './storage';

export interface ActiveDigestionInfo {
  remainingMinutes: number;
  displayText: string;
}

/**
 * Returns info about the latest active digestion window, or null if none active.
 *
 * For solo meals: uses meal.loggedAt + meal.digestionWindowMinutes.
 * For session members: uses session.sessionEnd (latest member window end).
 * Section 8.6: purely informational, no CTA, no advisory language.
 */
export function getActiveDigestionInfo(
  meals: Meal[],
  sessions: Session[],
  now: Date,
): ActiveDigestionInfo | null {
  const nowMs = now.getTime();
  let latestEndMs = 0;

  // Build a set of meal IDs that belong to sessions (to avoid double-counting)
  const sessionMealIds = new Set<string>();
  const sessionMap = new Map<string, Session>();
  for (const s of sessions) {
    sessionMap.set(s.id, s);
    for (const mId of s.mealIds) {
      sessionMealIds.add(mId);
    }
  }

  // Check sessions for active windows using session_end
  const processedSessions = new Set<string>();
  for (const meal of meals) {
    if (meal.sessionId && sessionMap.has(meal.sessionId) && !processedSessions.has(meal.sessionId)) {
      processedSessions.add(meal.sessionId);
      const session = sessionMap.get(meal.sessionId)!;
      let endMs: number;
      if (session.sessionEnd) {
        endMs = new Date(session.sessionEnd).getTime();
      } else {
        // Fallback for pre-migration sessions without sessionEnd:
        // compute from latest member meal loggedAt + digestionWindowMinutes
        const memberMeals = meals.filter(m => m.sessionId === session.id);
        endMs = Math.max(
          ...memberMeals.map(m => new Date(m.loggedAt).getTime() + (m.digestionWindowMinutes ?? 180) * 60 * 1000)
        );
      }
      if (endMs > nowMs && endMs > latestEndMs) {
        latestEndMs = endMs;
      }
    }
  }

  // Check solo meals (not in a session)
  for (const meal of meals) {
    if (sessionMealIds.has(meal.id)) continue; // handled via session
    const windowMinutes = meal.digestionWindowMinutes ?? 180; // default 180 for pre-migration
    const mealEndMs = new Date(meal.loggedAt).getTime() + windowMinutes * 60 * 1000;
    if (mealEndMs > nowMs && mealEndMs > latestEndMs) {
      latestEndMs = mealEndMs;
    }
  }

  if (latestEndMs <= nowMs) return null;

  const remainingMinutes = Math.round((latestEndMs - nowMs) / (60 * 1000));
  if (remainingMinutes <= 0) return null;

  return {
    remainingMinutes,
    displayText: `meal active: ${formatRemaining(remainingMinutes)} remaining`,
  };
}

function formatRemaining(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}
