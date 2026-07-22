/**
 * Billing-cycle date math for recurring charges. Kept dependency-free so the
 * scheduled task, the recovery helper, and the unit tests share one source of
 * truth.
 */

export type ChargeInterval = "month" | "year";

/** Number of months a billing interval spans. */
export function intervalMonths(interval: ChargeInterval): number {
  return interval === "year" ? 12 : 1;
}

/** Add whole months, clamping the day for short months (Jan 31 + 1mo → Feb 28). */
export function addMonthsClamped(date: Date, months: number): Date {
  const d = new Date(date);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const daysInTarget = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, daysInTarget));
  return d;
}

/**
 * The next charge date after a successful debit: one interval on from the
 * previous anchor, advanced repeatedly until it lands in the future. The loop
 * prevents a charge whose anchor fell far behind (pause/resume, downtime) from
 * being debited again on every subsequent daily run — customers are never
 * back-billed for elapsed periods.
 */
export function nextChargeAfter(
  previous: Date,
  interval: ChargeInterval,
  now: Date = new Date(),
): Date {
  const step = intervalMonths(interval);
  let next = addMonthsClamped(previous, step);
  while (next.getTime() <= now.getTime()) {
    next = addMonthsClamped(next, step);
  }
  return next;
}
