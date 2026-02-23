import type { Command } from 'commander';
import pc from 'picocolors';

import {
  fetchTimingsByAddress,
  fetchTimingsByCity,
  type PrayerData,
  type PrayerTimings,
} from '../lib/api.js';
import { calcSummary } from '../lib/recap.js';
import {
  addDays,
  formatDateLabel,
  parseDateKey,
  parseDays,
  parseHijriYear,
  resolveRamadanCalendar,
  toDateKeyFromGregorian,
} from '../utils/ramadan-utils.js';
import {
  PRAYERS,
  getConfig,
  listAttendance,
  type DayAttendance,
  type LocationConfig,
} from '../lib/store.js';
import { stripAnsi } from '../utils/cli-format.js';
import { formatDateKey } from '../utils/date-utils.js';
import { parseTimeToMinutes } from '../utils/time-utils.js';

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

const parseRange = (value?: string): number => {
  if (!value) return 30;
  if (/^\d+d$/.test(value)) {
    return Number(value.replace('d', ''));
  }
  return 30;
};

const getTodayDateKey = (timezone?: string): string => formatDateKey(new Date(), timezone);

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

const getNowMinutes = (timezone?: string): number => {
  const date = new Date();
  if (timezone) {
    try {
      const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      const parts = formatter.formatToParts(date);
      const hourPart = parts.find((part) => part.type === 'hour')?.value;
      const minutePart = parts.find((part) => part.type === 'minute')?.value;

      if (hourPart && minutePart) {
        const hour = Number(hourPart);
        const minute = Number(minutePart);
        return hour * 60 + minute;
      }
    } catch {
      // fallback to local time below
    }
  }

  const hour = date.getHours();
  const minute = date.getMinutes();
  return hour * 60 + minute;
};

const resolveTodayTimings = async (
  location: LocationConfig,
  dateKey: string,
  method?: number,
  school?: number,
): Promise<{ timings: PrayerTimings; timezone: string } | null> => {
  const [year, month, day] = dateKey.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  try {
    const data =
      location.type === 'city'
        ? await fetchTimingsByCity({
            city: location.city,
            country: location.country,
            method,
            school,
            date,
          })
        : await fetchTimingsByAddress({
            address: location.address,
            method,
            school,
            date,
          });
    return { timings: data.timings, timezone: data.meta.timezone };
  } catch {
    return null;
  }
};

const resolveWinRateCutoffDateKey = async (config: ReturnType<typeof getConfig>): Promise<string> => {
  const todayKey = getTodayDateKey(config.timezone);
  const yesterdayKey = addDays(todayKey, -1);

  if (!config.location) {
    return yesterdayKey;
  }

  const timing = await resolveTodayTimings(
    config.location,
    todayKey,
    config.method,
    config.school,
  );
  if (!timing) {
    return yesterdayKey;
  }

  const nowMinutes = getNowMinutes(config.timezone ?? timing.timezone);
  const ishaMinutes = parseTimeToMinutes(timing.timings.Isha);
  if (ishaMinutes === null) {
    return yesterdayKey;
  }

  return nowMinutes >= ishaMinutes ? todayKey : yesterdayKey;
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

const filterRowsUntil = (
  rows: ReadonlyArray<DayAttendance>,
  cutoffDateKey: string,
): ReadonlyArray<DayAttendance> => rows.filter((row) => row.date <= cutoffDateKey);

const calcPrayerRate = (
  rows: ReadonlyArray<DayAttendance>,
  cutoffDateKey: string,
): { percent: number; completed: number; total: number } => {
  const scoped = filterRowsUntil(rows, cutoffDateKey);
  const completed = scoped.reduce((sum, row) => {
    const isPerfect = PRAYERS.every((prayer) => row.prayers[prayer]);
    return sum + (isPerfect ? 1 : 0);
  }, 0);
  const total = scoped.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { percent, completed, total };
};

const calcFastingRate = (
  rows: ReadonlyArray<DayAttendance>,
  cutoffDateKey: string,
): { percent: number; completed: number; total: number } => {
  const scoped = filterRowsUntil(rows, cutoffDateKey);
  const completed = scoped.reduce((sum, row) => sum + (row.fasted ? 1 : 0), 0);
  const total = scoped.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { percent, completed, total };
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
        const winRateCutoff = await resolveWinRateCutoffDateKey(config);

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
        const prayerRate = calcPrayerRate(rows, winRateCutoff);
        const prayerCrown = prayerRate.percent === 100 ? ' 👑' : '';
        renderLine(
          `${pc.dim('• Prayer win rate:')} ${accent(`${prayerRate.percent}%`)}${prayerCrown} ${pc.dim(`(${prayerRate.completed}/${prayerRate.total} perfect days)`)}`,
        );
        const fastingRate = calcFastingRate(rows, winRateCutoff);
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
      const winRateCutoff = await resolveWinRateCutoffDateKey(getConfig());

      renderRecapHeader();
      renderLine(`${pc.dim('• Consistency snapshot')}`);
      renderLine(`${pc.dim('• Period:')} last ${rangeDays} days`);
      renderLine(
        `${pc.dim('• Prayers completed:')} ${summary.completed}/${summary.total} (${summary.percent}%)`,
      );
      renderLine(
        `${pc.dim('• Prayer perfect days:')} ${summary.perfectDays}/${summary.totalDays} ${pc.dim('(all 5 prayers)')}`,
      );
      const winRate = calcPrayerRate(rows, winRateCutoff);
      const winRateCrown = winRate.percent === 100 ? ' 👑' : '';
      renderLine(
        `${pc.dim('• Prayer win rate:')} ${accent(`${winRate.percent}%`)}${winRateCrown} ${pc.dim(`(${winRate.completed}/${winRate.total} perfect days)`)}`,
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
