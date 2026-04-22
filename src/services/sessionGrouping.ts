/**
 * Session Grouping — Overlap Detection + Session Lifecycle
 * Spec: Session Grouping Design Spec, Section 3 (Overlap) + Section 4 (Lifecycle)
 * Phase C — Pure functions. No storage writes, no network calls.
 *
 * Integrated into saveMeal()/updateMeal()/deleteMeal() in Phase H.
 * Audit log writes added in Phase D.
 */
import type { Session, SessionEventType } from './storage';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Minimum meal fields needed for overlap detection and session grouping */
export interface OverlapMeal {
  id: string;
  loggedAt: string;            // ISO timestamp
  digestionWindowMinutes: number | null;
  sessionId: string | null;
}

/** A new session to be created */
export interface NewSessionData {
  id: string;
  mealIds: string[];
  startedAt: string;           // ISO — earliest member timestamp
  sessionEnd: string;          // ISO — MAX(member.timestamp + digestionWindow)
}

/** Update to a session's end time */
export interface SessionEndUpdate {
  sessionId: string;
  newSessionEnd: string;       // ISO
}

/** An event to be logged by Phase D's audit trail */
export interface PendingAuditEvent {
  sessionId: string;
  eventType: SessionEventType;
  triggeredByMealId: string | null;
}

/** The full set of mutations resulting from a grouping or re-evaluation operation */
export interface SessionMutations {
  mealUpdates: Array<{ mealId: string; newSessionId: string | null }>;
  sessionsToCreate: NewSessionData[];
  sessionsToDissolve: string[];
  sessionEndUpdates?: SessionEndUpdate[];
  auditEvents: PendingAuditEvent[];
}

// ---------------------------------------------------------------------------
// ID generation (same pattern as storage.ts — no crypto.randomUUID)
// ---------------------------------------------------------------------------

function generateSessionId(): string {
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

// ---------------------------------------------------------------------------
// Primary window computation (Section 3 — 75% rule)
// ---------------------------------------------------------------------------

/**
 * Compute the primary digestion window in minutes (first 75%, floored).
 * Spec Section 3: overlap detection uses the primary window, not the full window.
 */
export function computePrimaryWindowMinutes(digestionWindowMinutes: number): number {
  return Math.floor(digestionWindowMinutes * 0.75);
}

// ---------------------------------------------------------------------------
// Overlap detection (Section 3)
// ---------------------------------------------------------------------------

/**
 * Find existing meals whose primary window contains the new meal's timestamp.
 * Spec Section 3: "A new meal M2 overlaps an existing meal M1 if M2's timestamp
 * falls within M1's primary digestion window."
 *
 * Directionality: does newMeal fall inside existingMeal's primary window?
 * The reverse is never checked.
 * Boundary inclusive (Section 3 E2).
 */
export function detectOverlaps(
  newMeal: OverlapMeal,
  existingMeals: OverlapMeal[],
): OverlapMeal[] {
  const newTimestamp = new Date(newMeal.loggedAt).getTime();
  const overlaps: OverlapMeal[] = [];

  for (const existing of existingMeals) {
    // Skip meals without classification data (legacy/unclassified)
    if (!existing.digestionWindowMinutes) continue;
    // Skip self
    if (existing.id === newMeal.id) continue;

    const existingTimestamp = new Date(existing.loggedAt).getTime();
    const primaryWindowMs = computePrimaryWindowMinutes(existing.digestionWindowMinutes) * 60 * 1000;
    const primaryWindowEnd = existingTimestamp + primaryWindowMs;

    // Spec Section 3: existingMeal.timestamp <= newMeal.timestamp <= primaryWindowEnd
    // Boundary inclusive (E2)
    if (existingTimestamp <= newTimestamp && newTimestamp <= primaryWindowEnd) {
      overlaps.push(existing);
    }
  }

  return overlaps;
}

// ---------------------------------------------------------------------------
// Session end computation (Section 4.2)
// ---------------------------------------------------------------------------

/**
 * session_end = MAX(member.timestamp + member.digestion_window_minutes)
 * Full window, not primary. Spec Section 4.2.
 */
export function computeSessionEnd(memberMeals: OverlapMeal[]): string {
  let maxEnd = 0;

  for (const meal of memberMeals) {
    const ts = new Date(meal.loggedAt).getTime();
    const windowMs = (meal.digestionWindowMinutes ?? 180) * 60 * 1000;
    const end = ts + windowMs;
    if (end > maxEnd) maxEnd = end;
  }

  return new Date(maxEnd).toISOString();
}

// ---------------------------------------------------------------------------
// Session closure check (Section 4.3)
// ---------------------------------------------------------------------------

/**
 * A session is closed when current_time > session_end.
 * Spec Section 4.3: "closed the moment current_time > session_end"
 * Exactly equal = NOT closed (strict greater-than).
 */
export function isSessionClosed(session: Session, now?: Date): boolean {
  const sessionEnd = session.sessionEnd;
  if (!sessionEnd) return true; // Legacy sessions without sessionEnd are considered closed
  const nowMs = (now ?? new Date()).getTime();
  const endMs = new Date(sessionEnd).getTime();
  return nowMs > endMs;
}

// ---------------------------------------------------------------------------
// Group or create session (Section 3 pseudocode + Section 4.1)
// ---------------------------------------------------------------------------

/**
 * Decide what session action to take for a newly logged meal.
 * Spec Section 3 pseudocode + Section 4.1 (creation).
 *
 * Returns mutations for the caller (Phase H) to apply.
 */
export function groupOrCreateSession(
  newMeal: OverlapMeal,
  overlaps: OverlapMeal[],
  existingSessions: Session[],
): SessionMutations {
  const result: SessionMutations = {
    mealUpdates: [],
    sessionsToCreate: [],
    sessionsToDissolve: [],
    sessionEndUpdates: [],
    auditEvents: [],
  };

  // No overlaps → solo meal, no mutations
  if (overlaps.length === 0) {
    return result;
  }

  // Find distinct session IDs among overlapping meals
  const existingSessionIds = new Set<string>();
  for (const meal of overlaps) {
    if (meal.sessionId) {
      existingSessionIds.add(meal.sessionId);
    }
  }

  if (existingSessionIds.size === 0) {
    // No existing session — create one, backfill overlapping solo meals (Section 3 backfilling)
    const newSessionId = generateSessionId();
    const allMembers = [...overlaps, newMeal];
    const sessionEnd = computeSessionEnd(allMembers);
    const startedAt = allMembers
      .map((m) => new Date(m.loggedAt).getTime())
      .reduce((min, ts) => Math.min(min, ts), Infinity);

    result.sessionsToCreate.push({
      id: newSessionId,
      mealIds: allMembers.map((m) => m.id),
      startedAt: new Date(startedAt).toISOString(),
      sessionEnd,
    });

    // All meals (including backfilled solos) get assigned to the new session
    for (const meal of allMembers) {
      result.mealUpdates.push({ mealId: meal.id, newSessionId });
    }

    // Audit events
    result.auditEvents.push({
      sessionId: newSessionId,
      eventType: 'created',
      triggeredByMealId: newMeal.id,
    });
    for (const meal of overlaps) {
      result.auditEvents.push({
        sessionId: newSessionId,
        eventType: 'member_added_via_backfill',
        triggeredByMealId: meal.id,
      });
    }
  } else if (existingSessionIds.size === 1) {
    // One existing session — join it (Section 4.2 extension)
    const sessionId = [...existingSessionIds][0];
    const session = existingSessions.find((s) => s.id === sessionId);

    // Add new meal to session
    result.mealUpdates.push({ mealId: newMeal.id, newSessionId: sessionId });

    // Backfill any solo meals from overlaps that aren't in the session yet
    for (const meal of overlaps) {
      if (!meal.sessionId) {
        result.mealUpdates.push({ mealId: meal.id, newSessionId: sessionId });
        result.auditEvents.push({
          sessionId,
          eventType: 'member_added_via_backfill',
          triggeredByMealId: meal.id,
        });
      }
    }

    // Recompute session_end with all members including the new meal
    if (session) {
      const existingMembers = existingSessions
        .find((s) => s.id === sessionId)
        ?.mealIds ?? [];
      // We don't have the full meal objects for existing members, so compute from what we know
      // The caller must pass all relevant meals. For now, compute with overlaps + newMeal.
      const allKnownMembers = [...overlaps, newMeal];
      const newEnd = computeSessionEnd(allKnownMembers);

      // Only update if the new end is later than current
      const currentEnd = session.sessionEnd ? new Date(session.sessionEnd).getTime() : 0;
      const newEndMs = new Date(newEnd).getTime();
      if (newEndMs > currentEnd) {
        result.sessionEndUpdates!.push({
          sessionId,
          newSessionEnd: newEnd,
        });
      }
    }

    result.auditEvents.push({
      sessionId,
      eventType: 'extended',
      triggeredByMealId: newMeal.id,
    });
  } else {
    // Multiple sessions — merge (Section 3 pseudocode: merge case)
    const sessionsToMerge = [...existingSessionIds];
    const newSessionId = generateSessionId();

    // Collect all member meal IDs from sessions being merged + new meal + solo overlaps
    const allMemberIds = new Set<string>();
    allMemberIds.add(newMeal.id);
    for (const sid of sessionsToMerge) {
      const session = existingSessions.find((s) => s.id === sid);
      if (session) {
        for (const mid of session.mealIds) {
          allMemberIds.add(mid);
        }
      }
    }
    // Add any solo meals from overlaps
    for (const meal of overlaps) {
      allMemberIds.add(meal.id);
    }

    // Compute session boundaries
    const allMembers = [...allMemberIds]
      .map((mid) => {
        if (mid === newMeal.id) return newMeal;
        return overlaps.find((m) => m.id === mid);
      })
      .filter((m): m is OverlapMeal => m != null);

    const startedAt = allMembers
      .map((m) => new Date(m.loggedAt).getTime())
      .reduce((min, ts) => Math.min(min, ts), Infinity);
    const sessionEnd = computeSessionEnd(allMembers);

    // Dissolve old sessions
    result.sessionsToDissolve.push(...sessionsToMerge);

    // Create merged session
    result.sessionsToCreate.push({
      id: newSessionId,
      mealIds: [...allMemberIds],
      startedAt: new Date(startedAt).toISOString(),
      sessionEnd,
    });

    // All meals → merged session
    for (const mid of allMemberIds) {
      result.mealUpdates.push({ mealId: mid, newSessionId: newSessionId });
    }

    // Audit events
    for (const sid of sessionsToMerge) {
      result.auditEvents.push({
        sessionId: sid,
        eventType: 'merged',
        triggeredByMealId: newMeal.id,
      });
    }
    result.auditEvents.push({
      sessionId: newSessionId,
      eventType: 'created',
      triggeredByMealId: newMeal.id,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Transitive chain builder (union-find for re-evaluation)
// ---------------------------------------------------------------------------

/**
 * Build connected components of overlapping meals using union-find.
 * Meals sorted by timestamp; for each pair (i < j), if j falls in i's primary window,
 * they're in the same component. Spec Section 3 E3: transitive grouping.
 */
function buildOverlapChains(meals: OverlapMeal[]): Map<string, Set<string>> {
  // Sort by timestamp ascending
  const sorted = [...meals].sort(
    (a, b) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime(),
  );

  // Union-find parent map
  const parent = new Map<string, string>();
  for (const meal of sorted) {
    parent.set(meal.id, meal.id);
  }

  function find(id: string): string {
    let root = id;
    while (parent.get(root) !== root) {
      root = parent.get(root)!;
    }
    // Path compression
    let current = id;
    while (current !== root) {
      const next = parent.get(current)!;
      parent.set(current, root);
      current = next;
    }
    return root;
  }

  function union(a: string, b: string): void {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) {
      parent.set(rootB, rootA);
    }
  }

  // Build overlap edges
  for (let i = 0; i < sorted.length; i++) {
    const mealI = sorted[i];
    if (!mealI.digestionWindowMinutes) continue;

    const iTimestamp = new Date(mealI.loggedAt).getTime();
    const primaryWindowMs = computePrimaryWindowMinutes(mealI.digestionWindowMinutes) * 60 * 1000;
    const primaryEnd = iTimestamp + primaryWindowMs;

    for (let j = i + 1; j < sorted.length; j++) {
      const mealJ = sorted[j];
      const jTimestamp = new Date(mealJ.loggedAt).getTime();

      // If j is beyond i's primary window, no later meal can overlap i either
      if (jTimestamp > primaryEnd) break;

      // j falls within i's primary window (boundary inclusive)
      union(mealI.id, mealJ.id);
    }
  }

  // Collect connected components
  const components = new Map<string, Set<string>>();
  for (const meal of sorted) {
    const root = find(meal.id);
    if (!components.has(root)) {
      components.set(root, new Set());
    }
    components.get(root)!.add(meal.id);
  }

  return components;
}

// ---------------------------------------------------------------------------
// Re-evaluate on edit (Section 4.4 — Edit 1: timestamp change)
// ---------------------------------------------------------------------------

/**
 * Re-evaluate all sessions after a meal is edited (timestamp or classification change).
 * Spec Section 4.4: re-run overlap detection, recompute membership.
 *
 * @param editedMealId - The meal that was edited
 * @param allMeals - All meals AFTER the edit (with updated fields)
 * @param allSessions - All current sessions
 */
export function reEvaluateOnEdit(
  editedMealId: string,
  allMeals: OverlapMeal[],
  allSessions: Session[],
): SessionMutations {
  return reEvaluateSessionMembership(allMeals, allSessions, editedMealId);
}

// ---------------------------------------------------------------------------
// Re-evaluate on delete (Section 4.4 — Edit 3: delete)
// ---------------------------------------------------------------------------

/**
 * Re-evaluate sessions after a meal is deleted.
 * @param deletedMealId - The meal that was deleted (for audit trail)
 * @param remainingMeals - All meals AFTER deletion (deleted meal NOT included)
 * @param allSessions - All current sessions
 */
export function reEvaluateOnDelete(
  deletedMealId: string,
  remainingMeals: OverlapMeal[],
  allSessions: Session[],
): SessionMutations {
  return reEvaluateSessionMembership(remainingMeals, allSessions, deletedMealId);
}

// ---------------------------------------------------------------------------
// Core re-evaluation logic
// ---------------------------------------------------------------------------

/**
 * Rebuild session membership from scratch for affected sessions.
 * Used by both edit and delete flows.
 */
function reEvaluateSessionMembership(
  meals: OverlapMeal[],
  sessions: Session[],
  triggerMealId: string,
): SessionMutations {
  const result: SessionMutations = {
    mealUpdates: [],
    sessionsToCreate: [],
    sessionsToDissolve: [],
    sessionEndUpdates: [],
    auditEvents: [],
  };

  // Find all sessions that are affected (contain the trigger meal, or contain
  // meals that might now overlap differently)
  const affectedSessionIds = new Set<string>();
  for (const session of sessions) {
    if (session.mealIds.includes(triggerMealId)) {
      affectedSessionIds.add(session.id);
    }
  }

  // Also check: any meal in the affected sessions could now overlap with
  // meals from other sessions. Collect all affected meals.
  const affectedMealIds = new Set<string>();
  for (const sid of affectedSessionIds) {
    const session = sessions.find((s) => s.id === sid);
    if (session) {
      for (const mid of session.mealIds) {
        affectedMealIds.add(mid);
      }
    }
  }
  // Also add the trigger meal itself
  affectedMealIds.add(triggerMealId);

  // Get the actual meal objects for affected meals (only those still present)
  const affectedMeals = meals.filter((m) => affectedMealIds.has(m.id));

  // Rebuild overlap chains for affected meals
  const chains = buildOverlapChains(affectedMeals);

  // Determine new session membership
  const dissolvedSessions = new Set<string>();
  const processedMeals = new Set<string>();

  for (const [, component] of chains) {
    if (component.size >= 2) {
      // This group forms a session
      const memberMeals = affectedMeals.filter((m) => component.has(m.id));

      // Check if these meals were already in the same session
      const currentSessionIds = new Set(
        memberMeals.map((m) => m.sessionId).filter((sid): sid is string => sid != null),
      );

      if (currentSessionIds.size === 1) {
        // All in same session already — check if membership changed
        const existingSessionId = [...currentSessionIds][0];
        const existingSession = sessions.find((s) => s.id === existingSessionId);
        if (existingSession) {
          const existingMemberSet = new Set(existingSession.mealIds);
          const newMemberSet = component;

          // Check if membership is the same (ignoring deleted meals)
          const existingFiltered = new Set(
            [...existingMemberSet].filter((mid) => meals.some((m) => m.id === mid)),
          );

          if (
            existingFiltered.size === newMemberSet.size &&
            [...existingFiltered].every((mid) => newMemberSet.has(mid))
          ) {
            // Same membership — update session_end if needed
            const newEnd = computeSessionEnd(memberMeals);
            if (existingSession.sessionEnd !== newEnd) {
              result.sessionEndUpdates!.push({
                sessionId: existingSessionId,
                newSessionEnd: newEnd,
              });
            }
            for (const mid of component) processedMeals.add(mid);
            continue;
          }
        }
      }

      // Membership changed — dissolve old sessions, create new
      for (const sid of currentSessionIds) {
        if (!dissolvedSessions.has(sid)) {
          dissolvedSessions.add(sid);
          result.sessionsToDissolve.push(sid);
        }
      }

      const newSessionId = generateSessionId();
      const startedAt = memberMeals
        .map((m) => new Date(m.loggedAt).getTime())
        .reduce((min, ts) => Math.min(min, ts), Infinity);

      result.sessionsToCreate.push({
        id: newSessionId,
        mealIds: [...component],
        startedAt: new Date(startedAt).toISOString(),
        sessionEnd: computeSessionEnd(memberMeals),
      });

      for (const mid of component) {
        result.mealUpdates.push({ mealId: mid, newSessionId: newSessionId });
        processedMeals.add(mid);
      }

      result.auditEvents.push({
        sessionId: newSessionId,
        eventType: 'created',
        triggeredByMealId: triggerMealId,
      });
    } else {
      // Single meal — becomes solo
      const mealId = [...component][0];
      const meal = affectedMeals.find((m) => m.id === mealId);

      if (meal?.sessionId) {
        // Was in a session, now solo — dissolve if not already
        if (!dissolvedSessions.has(meal.sessionId)) {
          dissolvedSessions.add(meal.sessionId);
          result.sessionsToDissolve.push(meal.sessionId);
        }
        result.mealUpdates.push({ mealId, newSessionId: null });
      }
      processedMeals.add(mealId);
    }
  }

  // Handle meals that were in affected sessions but aren't in any chain
  // (e.g., deleted meal is gone, remaining meal with no overlaps)
  for (const mid of affectedMealIds) {
    if (!processedMeals.has(mid) && meals.some((m) => m.id === mid)) {
      const meal = meals.find((m) => m.id === mid);
      if (meal?.sessionId) {
        if (!dissolvedSessions.has(meal.sessionId)) {
          dissolvedSessions.add(meal.sessionId);
          result.sessionsToDissolve.push(meal.sessionId);
        }
        result.mealUpdates.push({ mealId: mid, newSessionId: null });
      }
    }
  }

  // Add dissolution audit events
  for (const sid of dissolvedSessions) {
    result.auditEvents.push({
      sessionId: sid,
      eventType: 'dissolved',
      triggeredByMealId: triggerMealId,
    });
  }

  return result;
}
