import type { Command } from 'commander';
import pc from 'picocolors';

import {
  fetchHijriCalendarByAddress,
  fetchHijriCalendarByCity,
  type PrayerData,
} from '../lib/api.js';
import { calcSummary } from '../lib/recap.js';
import {
  PRAYERS,
  getConfig,
  listAttendance,
  type DayAttendance,
} from '../lib/store.js';

type RecapOptions = {
  range?: string;
  ramadan?: boolean;
  ramadanStart?: string;
  ramadanDays?: string;
  ramadanYear?: string;
};

type RamadanDate = {
  dateKey: string;
};

type PrayerGrid = {
  label: string;
  rows: string[];
};

const LEFT_PAD = '  ';
const renderLine = (text = ''): void => {
  if (!text) {
    console.log('');
    return;
  }
  console.log(`${LEFT_PAD}${text}`);
};

const accent = (value: string): string => `\x1b[38;2;128;240;151m${value}\x1b[0m`;

const stripAnsi = (value: string): string =>
  value.replace(new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'), '');

const parseRange = (value?: string): number => {
  if (!value) return 30;
  if (/^\d+d$/.test(value)) {
    return Number(value.replace('d', ''));
  }
  return 30;
};

const parseDateKey = (value: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Date must be in YYYY-MM-DD format');
  }
  return value;
};

const parseDays = (value: string): number => {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    throw new Error('Ramadan days must be an integer between 1 and 30');
  }
  return days;
};

const parseHijriYear = (value: string): number => {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1) {
    throw new Error('Hijri year must be a positive integer');
  }
  return year;
};

const getTodayDateKey = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (dateKey: string, days: number): string => {
  const [year, month, day] = dateKey.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
};

const toDateKeyFromGregorian = (dateValue: string): string => {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dateValue);
  if (!match) {
    throw new Error('Unexpected Gregorian date format');
  }
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
};

const formatDateLabel = (dateKey: string): string => {
  const [year, month, day] = dateKey.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const filterByDays = (
  rows: ReadonlyArray<DayAttendance>,
  days: number,
): ReadonlyArray<DayAttendance> => {
  if (rows.length === 0) return rows;
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const end = sorted[sorted.length - 1].date;
  const start = addDays(end, -(days - 1));
  return sorted.filter((row) => row.date >= start && row.date <= end);
};

const expandAttendance = (rows: ReadonlyArray<DayAttendance>): ReadonlyArray<DayAttendance> => {
  if (rows.length === 0) return rows;
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  const map = new Map(sorted.map((row) => [row.date, row]));
  const start = sorted[0].date;
  const end = sorted[sorted.length - 1].date;
  const expanded: DayAttendance[] = [];

  let cursor = start;
  while (cursor <= end) {
    const existing = map.get(cursor);
    expanded.push(
      existing ?? {
        date: cursor,
        prayers: {},
        updatedAt: '',
      },
    );
    cursor = addDays(cursor, 1);
  }

  return expanded;
};

const buildPrayerGrid = (rows: ReadonlyArray<DayAttendance>): PrayerGrid => {
  const expanded = expandAttendance(rows);
  if (expanded.length === 0) return { label: '', rows: [] };

  const label = `${formatDateLabel(expanded[0].date)} → ${formatDateLabel(expanded[expanded.length - 1].date)}`;
  const gap = ' ';
  const filled = accent('■');
  const empty = pc.dim('□');
  const labelWidth = Math.max(...PRAYERS.map((prayer) => prayer.length));

  const rowsOut = PRAYERS.map((prayer) => {
    const line = expanded.map((row) => (row.prayers[prayer] ? filled : empty)).join(gap);
    return `${pc.dim(prayer.padEnd(labelWidth))} ${line}`;
  });

  return { label, rows: rowsOut };
};

const calcWinRateUntilYesterday = (
  rows: ReadonlyArray<DayAttendance>,
): { percent: number; perfectDays: number } => {
  const todayKey = getTodayDateKey();
  const scoped = rows.filter((row) => row.date < todayKey);
  const totalDays = scoped.length;
  const perfectDays = scoped.reduce((sum, row) => {
    const isPerfect = PRAYERS.every((prayer) => row.prayers[prayer]);
    return sum + (isPerfect ? 1 : 0);
  }, 0);
  const percent = totalDays > 0 ? Math.round((perfectDays / totalDays) * 100) : 0;
  return { percent, perfectDays };
};

const calcPrayerRateUntilYesterday = (
  rows: ReadonlyArray<DayAttendance>,
): { percent: number; completed: number; total: number } => {
  const todayKey = getTodayDateKey();
  const scoped = rows.filter((row) => row.date < todayKey);
  const completed = scoped.reduce((sum, row) => {
    const isPerfect = PRAYERS.every((prayer) => row.prayers[prayer]);
    return sum + (isPerfect ? 1 : 0);
  }, 0);
  const total = scoped.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { percent, completed, total };
};

const calcFastingRateUntilYesterday = (
  rows: ReadonlyArray<DayAttendance>,
): { percent: number; completed: number; total: number } => {
  const todayKey = getTodayDateKey();
  const scoped = rows.filter((row) => row.date < todayKey);
  const completed = scoped.reduce((sum, row) => sum + (row.fasted ? 1 : 0), 0);
  const total = scoped.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { percent, completed, total };
};

const resolveRamadanCalendar = async (
  location: NonNullable<ReturnType<typeof getConfig>['location']>,
  year: number,
  method?: number,
  school?: number,
): Promise<ReadonlyArray<PrayerData>> => {
  if (location.type === 'city') {
    return fetchHijriCalendarByCity({
      city: location.city,
      country: location.country,
      year,
      month: 9,
      method,
      school,
    });
  }

  return fetchHijriCalendarByAddress({
    address: location.address,
    year,
    month: 9,
    method,
    school,
  });
};

const buildRamadanDatesFromCalendar = (
  items: ReadonlyArray<PrayerData>,
): ReadonlyArray<RamadanDate> =>
  items.map((item) => ({
    dateKey: toDateKeyFromGregorian(item.date.gregorian.date),
  }));

const buildRamadanDatesFromStart = (start: string, days: number): ReadonlyArray<RamadanDate> =>
  Array.from({ length: days }, (_, idx) => ({ dateKey: addDays(start, idx) }));

const RECAP_ART = [
  '██████╗ ███████╗ ██████╗ █████╗ ██████╗ ',
  '██╔══██╗██╔════╝██╔════╝██╔══██╗██╔══██╗',
  '██████╔╝█████╗  ██║     ███████║██████╔╝',
  '██╔══██╗██╔══╝  ██║     ██╔══██║██╔═══╝ ',
  '██║  ██║███████╗╚██████╗██║  ██║██║     ',
  '╚═╝  ╚═╝╚══════╝ ╚═════╝╚═╝  ╚═╝╚═╝     ',
];

const renderRecapHeader = (): void => {
  renderLine();
  RECAP_ART.forEach((line) => renderLine(accent(line)));
  renderLine();
};

export const registerRecapCommand = (program: Command): void => {
  program
    .command('recap')
    .description('Recap with prayer consistency visualization')
    .option('-r, --range <range>', 'Range like 7d or 30d')
    .option('--ramadan', 'Full Ramadan recap (Hijri month 9)')
    .option('--ramadan-start <date>', 'Ramadan start date in YYYY-MM-DD (Indonesia: 2026-02-19)')
    .option('--ramadan-days <days>', 'Ramadan length in days (29 or 30)')
    .option('--ramadan-year <year>', 'Hijri year for Ramadan (e.g. 1447)')
    .action(async (options: RecapOptions) => {
      const useRamadan =
        Boolean(options.ramadan || options.ramadanStart || options.ramadanDays) || !options.range;

      if (useRamadan) {
        const config = getConfig();
        if (!config.location) {
          renderLine(pc.red('Location is required for Ramadan recap. Run schedule first.'));
          process.exitCode = 1;
          return;
        }

        const ramadanYear = options.ramadanYear ? parseHijriYear(options.ramadanYear) : 1447;
        const ramadanDays = options.ramadanDays ? parseDays(options.ramadanDays) : 30;
        const ramadanStart = options.ramadanStart ? parseDateKey(options.ramadanStart) : undefined;

        const ramadanDates = ramadanStart
          ? buildRamadanDatesFromStart(ramadanStart, ramadanDays)
          : buildRamadanDatesFromCalendar(
              await resolveRamadanCalendar(
                config.location,
                ramadanYear,
                config.method,
                config.school,
              ),
            );

        const attendance = listAttendance();
        const attendanceMap = new Map(attendance.map((row) => [row.date, row]));

        const rows: DayAttendance[] = ramadanDates.map((date) => {
          const existing = attendanceMap.get(date.dateKey);
          return {
            date: date.dateKey,
            prayers: existing?.prayers ?? {},
            fasted: existing?.fasted,
            updatedAt: existing?.updatedAt ?? '',
          };
        });

        if (rows.length === 0) {
          renderLine(pc.dim('No Ramadan records yet.'));
          return;
        }

        const summary = calcSummary(rows);
        const chart = buildPrayerGrid(rows);

        renderRecapHeader();
        renderLine(
          `${pc.dim('• Period:')} 1 Ramadan ${ramadanYear} → ${rows.length} Ramadan ${ramadanYear}`,
        );
        renderLine(
          `${pc.dim('• Prayers completed:')} ${summary.completed}/${summary.total} (${summary.percent}%)`,
        );
        renderLine(
          `${pc.dim('• Prayer perfect days:')} ${summary.perfectDays}/${summary.totalDays} ${pc.dim('(all 5 prayers)')}`,
        );
        const fastedCount = rows.reduce((sum, row) => sum + (row.fasted ? 1 : 0), 0);
        renderLine(`${pc.dim('• Fasting days:')} ${fastedCount}/${rows.length}`);
        const prayerRate = calcPrayerRateUntilYesterday(rows);
        const prayerCrown = prayerRate.percent === 100 ? ' 👑' : '';
        renderLine(
          `${pc.dim('• Prayer win rate:')} ${accent(`${prayerRate.percent}%`)}${prayerCrown} ${pc.dim(`(${prayerRate.completed}/${prayerRate.total} perfect days)`)}`,
        );
        const fastingRate = calcFastingRateUntilYesterday(rows);
        const fastingCrown = fastingRate.percent === 100 ? ' 👑' : '';
        renderLine(
          `${pc.dim('• Fasting win rate:')} ${accent(`${fastingRate.percent}%`)}${fastingCrown} ${pc.dim(`(${fastingRate.completed}/${fastingRate.total} days)`)}`,
        );
        renderLine();

        renderLine(accent(chart.label));
        renderLine(pc.dim('─'.repeat(stripAnsi(chart.label).length)));
        renderLine();
        chart.rows.forEach((line) => renderLine(line));
        renderLine();
        renderLine(pc.dim('Legend: each column = day, each row = prayer'));
        return;
      }

      const rangeDays = parseRange(options.range);
      const rows = filterByDays(listAttendance(), rangeDays);

      if (rows.length === 0) {
        renderLine(pc.dim('No attendance records yet.'));
        return;
      }

      const summary = calcSummary(rows);
      const chart = buildPrayerGrid(rows);

      renderRecapHeader();
      renderLine(`${pc.dim('• Consistency snapshot')}`);
      renderLine(`${pc.dim('• Period:')} last ${rangeDays} days`);
      renderLine(
        `${pc.dim('• Prayers completed:')} ${summary.completed}/${summary.total} (${summary.percent}%)`,
      );
      renderLine(
        `${pc.dim('• Prayer perfect days:')} ${summary.perfectDays}/${summary.totalDays} ${pc.dim('(all 5 prayers)')}`,
      );
      const winRate = calcWinRateUntilYesterday(rows);
      renderLine(
        `${pc.dim('• Win rate:')} ${accent(`${winRate.percent}%`)} ${pc.dim(`(${winRate.perfectDays} perfect days)`)}`,
      );
      renderLine();

      renderLine(accent(chart.label));
      renderLine(pc.dim('─'.repeat(stripAnsi(chart.label).length)));
      renderLine();
      chart.rows.forEach((line) => renderLine(line));
      renderLine();
      renderLine(pc.dim('Legend: each column = day, each row = prayer'));
    });
};
