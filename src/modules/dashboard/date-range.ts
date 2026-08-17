/**
 * Date-window resolution for the dashboard, kept free of database access so it
 * can be tested directly.
 *
 * Two coordinate systems are in play, and mixing them is the classic source of
 * "yesterday's evening sales showed up in today's total" bugs. The pharmacy
 * thinks in *civil dates* in its own timezone ("today is the 17th"), while
 * `sales.created_at` is a TIMESTAMPTZ — an absolute instant. Everything here
 * resolves civil dates first and converts to instants exactly once, at the end.
 */

/** The pharmacy's own calendar. "Today" means today *here*, not in UTC. */
export const PHARMACY_TIME_ZONE = 'Asia/Dhaka';

export const PERIODS = ['today', 'this_week', 'this_month'] as const;
export type Period = (typeof PERIODS)[number];

/** First day of the week for `this_week`, as `Date#getUTCDay` numbers it: 0 = Sunday. */
const WEEK_START_DAY = 0;

/** Matches a bare civil date with no time part, e.g. `2026-07-10`. */
export const CIVIL_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface CivilDateRange {
  /** Inclusive `YYYY-MM-DD`. */
  from: string;
  /** Inclusive `YYYY-MM-DD`. */
  to: string;
}

export interface InstantWindow {
  /** Inclusive: `created_at >= start`. */
  start: Date;
  /** Exclusive: `created_at < endExclusive`. Start of the day *after* `to`. */
  endExclusive: Date;
}

/** The civil date `instant` falls on in `timeZone`, as `YYYY-MM-DD`. */
export function civilDateIn(instant: Date, timeZone: string): string {
  const { year, month, day } = wallClockIn(instant, timeZone);
  return formatCivilDate(year, month, day);
}

/** Turns a preset into a concrete inclusive civil range, relative to `today`. */
export function resolvePeriod(period: Period, today: string): CivilDateRange {
  switch (period) {
    case 'today':
      return { from: today, to: today };
    case 'this_week': {
      const { year, month, day } = parseCivilDate(today);
      const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
      // Days elapsed since the start of the week, wrapped into 0–6 so the
      // arithmetic holds whichever day WEEK_START_DAY names.
      const elapsed = (weekday - WEEK_START_DAY + 7) % 7;
      return { from: addCivilDays(today, -elapsed), to: today };
    }
    case 'this_month':
      return { from: `${today.slice(0, 7)}-01`, to: today };
  }
}

/**
 * Converts an inclusive civil range into the half-open instant window to query
 * with. The upper bound is the *start of the day after* `to` and the comparison
 * is `<`, never `<=`: a `<=` against midnight would drop all but the first
 * instant of the final day.
 */
export function toInstantWindow(
  range: CivilDateRange,
  timeZone: string,
): InstantWindow {
  return {
    start: startOfCivilDay(range.from, timeZone),
    endExclusive: startOfCivilDay(addCivilDays(range.to, 1), timeZone),
  };
}

/** The instant at which `date` begins in `timeZone`. */
export function startOfCivilDay(date: string, timeZone: string): Date {
  const { year, month, day } = parseCivilDate(date);
  // Read the wall clock as though it were UTC, then step back by whatever
  // `timeZone` is offset from UTC at that moment.
  const asIfUtc = Date.UTC(year, month - 1, day);
  const firstGuess = new Date(
    asIfUtc - offsetMsAt(new Date(asIfUtc), timeZone),
  );

  // The offset is itself a function of the instant, so re-read it at the guess
  // and settle. Asia/Dhaka has no DST today, but this must not quietly break if
  // the zone is ever changed to one that does.
  const settled = asIfUtc - offsetMsAt(firstGuess, timeZone);
  return settled === firstGuess.getTime() ? firstGuess : new Date(settled);
}

/** `2026-07-10` plus/minus whole days, still as a civil date. */
export function addCivilDays(date: string, days: number): string {
  const { year, month, day } = parseCivilDate(date);
  // Date.UTC normalises overflow, so month and year ends roll over correctly.
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return formatCivilDate(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
  );
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** What a clock on the wall in `timeZone` reads at `instant`. */
function wallClockIn(instant: Date, timeZone: string): WallClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    // h23 rather than hour12:false — the latter renders midnight as hour 24 in
    // some ICU builds, which would throw the offset arithmetic out by a day.
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const part = parts.find((candidate) => candidate.type === type);
    if (part === undefined) {
      throw new Error(`Intl gave no ${type} part for time zone ${timeZone}`);
    }
    return Number(part.value);
  };

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

/** How far ahead of UTC `timeZone` is at `instant`, in milliseconds. */
function offsetMsAt(instant: Date, timeZone: string): number {
  const clock = wallClockIn(instant, timeZone);
  const asIfUtc = Date.UTC(
    clock.year,
    clock.month - 1,
    clock.day,
    clock.hour,
    clock.minute,
    clock.second,
  );
  // The parts carry no milliseconds, so truncate the instant to the second
  // before subtracting — otherwise the result is the offset minus a stray
  // sub-second remainder.
  return asIfUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

function parseCivilDate(date: string): {
  year: number;
  month: number;
  day: number;
} {
  if (!CIVIL_DATE_PATTERN.test(date)) {
    throw new Error(`Expected a YYYY-MM-DD date, got "${date}"`);
  }
  return {
    year: Number(date.slice(0, 4)),
    month: Number(date.slice(5, 7)),
    day: Number(date.slice(8, 10)),
  };
}

function formatCivilDate(year: number, month: number, day: number): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
}
