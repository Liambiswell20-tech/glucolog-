/**
 * Given a time-only selection (hours + minutes from a DateTimePicker),
 * returns a Date for today at that time — unless that would be in the future,
 * in which case it snaps to yesterday.
 */
export function applyLateEntryTime(selectedTime: Date): Date {
  const now = new Date();
  const candidate = new Date(now);
  candidate.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
  // If the resulting time is in the future, use yesterday at the same time
  if (candidate > now) {
    candidate.setDate(candidate.getDate() - 1);
  }
  return candidate;
}
