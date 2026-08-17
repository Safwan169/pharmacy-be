import {
  PHARMACY_TIME_ZONE,
  addCivilDays,
  civilDateIn,
  resolvePeriod,
  startOfCivilDay,
  toInstantWindow,
} from './date-range';

describe('Dashboard — civilDateIn', () => {
  it('reports the local date, not the UTC one, late in the local evening', () => {
    // 2026-07-10 20:00 in Dhaka (UTC+6) is still 14:00 UTC on the same day.
    expect(
      civilDateIn(new Date('2026-07-10T14:00:00Z'), PHARMACY_TIME_ZONE),
    ).toBe('2026-07-10');
  });

  it('has already rolled to the next local date while UTC is on the previous one', () => {
    // 18:30 UTC is 00:30 the next morning in Dhaka — a sale here belongs to
    // the 11th's takings, and reading the date off UTC would file it under the 10th.
    expect(
      civilDateIn(new Date('2026-07-10T18:30:00Z'), PHARMACY_TIME_ZONE),
    ).toBe('2026-07-11');
  });

  it('stays on the local date through the whole local day', () => {
    // 2026-07-09 18:00Z is 2026-07-10 00:00 local — the first instant of the day.
    expect(
      civilDateIn(new Date('2026-07-09T18:00:00Z'), PHARMACY_TIME_ZONE),
    ).toBe('2026-07-10');
    // ...and 17:59:59Z is 23:59:59 local, the last.
    expect(
      civilDateIn(new Date('2026-07-10T17:59:59Z'), PHARMACY_TIME_ZONE),
    ).toBe('2026-07-10');
  });
});

describe('Dashboard — startOfCivilDay', () => {
  it('resolves local midnight to the corresponding UTC instant', () => {
    expect(
      startOfCivilDay('2026-07-10', PHARMACY_TIME_ZONE).toISOString(),
    ).toBe('2026-07-09T18:00:00.000Z');
  });

  it('agrees with UTC for a zero-offset zone', () => {
    expect(startOfCivilDay('2026-07-10', 'UTC').toISOString()).toBe(
      '2026-07-10T00:00:00.000Z',
    );
  });

  it('handles a zone behind UTC as well as ahead of it', () => {
    // New York in July is UTC-4, so local midnight is 04:00Z the same day.
    expect(
      startOfCivilDay('2026-07-10', 'America/New_York').toISOString(),
    ).toBe('2026-07-10T04:00:00.000Z');
  });

  it('lands on the right instant across a DST transition', () => {
    // New York springs forward on 2026-03-08; the 9th is already UTC-4.
    expect(
      startOfCivilDay('2026-03-09', 'America/New_York').toISOString(),
    ).toBe('2026-03-09T04:00:00.000Z');
    // The day before the switch is still UTC-5.
    expect(
      startOfCivilDay('2026-03-07', 'America/New_York').toISOString(),
    ).toBe('2026-03-07T05:00:00.000Z');
  });

  it('rejects anything that is not a bare civil date', () => {
    expect(() => startOfCivilDay('2026-07-10T00:00:00Z', 'UTC')).toThrow();
    expect(() => startOfCivilDay('10-07-2026', 'UTC')).toThrow();
  });
});

describe('Dashboard — addCivilDays', () => {
  it('rolls over a month end', () => {
    expect(addCivilDays('2026-07-31', 1)).toBe('2026-08-01');
  });

  it('rolls over a year end', () => {
    expect(addCivilDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('handles a leap day', () => {
    expect(addCivilDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addCivilDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('steps backwards across a month boundary', () => {
    expect(addCivilDays('2026-08-01', -1)).toBe('2026-07-31');
  });
});

describe('Dashboard — resolvePeriod', () => {
  it('resolves today to a single-day range', () => {
    expect(resolvePeriod('today', '2026-07-10')).toEqual({
      from: '2026-07-10',
      to: '2026-07-10',
    });
  });

  it('starts this_week on the preceding Sunday', () => {
    // 2026-07-10 is a Friday, so the week began Sunday the 5th.
    expect(resolvePeriod('this_week', '2026-07-10')).toEqual({
      from: '2026-07-05',
      to: '2026-07-10',
    });
  });

  it('treats a Sunday as the first day of its own week, not the last of the previous', () => {
    // 2026-07-05 is a Sunday.
    expect(resolvePeriod('this_week', '2026-07-05')).toEqual({
      from: '2026-07-05',
      to: '2026-07-05',
    });
  });

  it('reaches back into the previous month when the week straddles one', () => {
    // 2026-08-01 is a Saturday; its week started Sunday 2026-07-26.
    expect(resolvePeriod('this_week', '2026-08-01')).toEqual({
      from: '2026-07-26',
      to: '2026-08-01',
    });
  });

  it('starts this_month on the first of the month', () => {
    expect(resolvePeriod('this_month', '2026-07-10')).toEqual({
      from: '2026-07-01',
      to: '2026-07-10',
    });
  });

  it('gives a single-day range on the first of the month', () => {
    expect(resolvePeriod('this_month', '2026-07-01')).toEqual({
      from: '2026-07-01',
      to: '2026-07-01',
    });
  });
});

describe('Dashboard — toInstantWindow', () => {
  it('spans the whole of the last day via an exclusive upper bound', () => {
    const window = toInstantWindow(
      { from: '2026-07-10', to: '2026-07-15' },
      PHARMACY_TIME_ZONE,
    );

    expect(window.start.toISOString()).toBe('2026-07-09T18:00:00.000Z');
    // Start of the 16th locally — so 15 July 23:59 local is still inside.
    expect(window.endExclusive.toISOString()).toBe('2026-07-15T18:00:00.000Z');
  });

  it('covers a full 24 hours for a single-day range', () => {
    const window = toInstantWindow(
      { from: '2026-07-10', to: '2026-07-10' },
      PHARMACY_TIME_ZONE,
    );

    const hours =
      (window.endExclusive.getTime() - window.start.getTime()) / 3_600_000;
    expect(hours).toBe(24);
  });

  it('includes a sale at the last local second of the final day', () => {
    const window = toInstantWindow(
      { from: '2026-07-10', to: '2026-07-10' },
      PHARMACY_TIME_ZONE,
    );
    // 23:59:59 local on the 10th.
    const lateSale = new Date('2026-07-10T17:59:59Z');

    expect(lateSale.getTime()).toBeGreaterThanOrEqual(window.start.getTime());
    expect(lateSale.getTime()).toBeLessThan(window.endExclusive.getTime());
  });

  it('excludes a sale from the local evening before the window opens', () => {
    const window = toInstantWindow(
      { from: '2026-07-10', to: '2026-07-10' },
      PHARMACY_TIME_ZONE,
    );
    // 23:00 local on the 9th — the same UTC *day* as the window's start, which
    // is exactly the sale a naive UTC range would wrongly include.
    const previousEvening = new Date('2026-07-09T17:00:00Z');

    expect(previousEvening.getTime()).toBeLessThan(window.start.getTime());
  });

  it('rolls the upper bound into the next month correctly', () => {
    const window = toInstantWindow(
      { from: '2026-07-01', to: '2026-07-31' },
      PHARMACY_TIME_ZONE,
    );

    expect(window.endExclusive.toISOString()).toBe('2026-07-31T18:00:00.000Z');
  });
});
