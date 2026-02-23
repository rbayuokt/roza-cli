import type { Command } from 'commander';
import pc from 'picocolors';

import {
  fetchHijriByDate,
  fetchHijriCalendarByAddress,
  fetchHijriCalendarByCity,
  type HijriDate,
  type PrayerData,
} from '../lib/api.js';
import {
  PRAYERS,
  getConfig,
  listAttendance,
  type DayAttendance,
  type LocationConfig,
  type PrayerRecord,
} from '../lib/store.js';

type HistoryOptions = {
  from?: string;
  to?: string;
  month?: string;
  ramadan?: boolean;
  ramadanStart?: string;
  ramadanDays?: string;
  ramadanYear?: string;
};

type RamadanDate = {
  dateKey: string;
  gregorianLabel: string;
  hijriLabel: string;
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

const HISTORY_ART = [
  '██╗  ██╗██╗███████╗████████╗ ██████╗ ██████╗██╗   ██╗',
  '██║  ██║██║██╔════╝╚══██╔══╝██╔═══██╗██╔══██╚██╗ ██╔╝',
  '███████║██║███████╗   ██║   ██║   ██║██████╔╝╚████╔╝ ',
  '██╔══██║██║╚════██║   ██║   ██║   ██║██╔══██╗ ╚██╔╝  ',
  '██║  ██║██║███████║   ██║   ╚██████╔╝██║  ██║  ██║   ',
  '╚═╝  ╚═╝╚═╝╚══════╝   ╚═╝    ╚═════╝ ╚═╝  ╚═╝  ╚═╝   ',
];

const renderHistoryHeader = (): void => {
  renderLine();
  HISTORY_ART.forEach((line) => renderLine(accent(line)));
  renderLine();
};

const padAnsi = (value: string, width: number): string => {
  const visible = stripAnsi(value).length;
  if (visible >= width) {
    return value;
  }
  return value + ' '.repeat(width - visible);
};

const parseDateKey = (value: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Date must be in YYYY-MM-DD format');
  }
  return value;
};

const parseMonthKey = (value: string): string => {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    throw new Error('Month must be in YYYY-MM format');
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

const formatGregorianLabel = (dateKey: string): string => {
  const [year, month, day] = dateKey.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

const filterByRange = (items: ReadonlyArray<DayAttendance>, from?: string, to?: string) => {
  if (!from && !to) return items;

  return items.filter((item) => {
    if (from && item.date < from) return false;
    if (to && item.date > to) return false;
    return true;
  });
};

const formatRangeLabel = (from?: string, to?: string, month?: string): string => {
  if (month) return `Month: ${month}`;
  if (from && to) return `${from} → ${to}`;
  if (from) return `${from} → ...`;
  if (to) return `... → ${to}`;
  return 'All time';
};

const formatHijriLabel = (hijri: HijriDate): string =>
  `${hijri.day} ${hijri.month.en} ${hijri.year}`;

const buildRamadanDatesFromCalendar = (items: ReadonlyArray<PrayerData>): ReadonlyArray<RamadanDate> => {
  return items.map((item) => {
    const dateKey = toDateKeyFromGregorian(item.date.gregorian.date);
    return {
      dateKey,
      gregorianLabel: formatGregorianLabel(dateKey),
      hijriLabel: formatHijriLabel(item.date.hijri),
    };
  });
};

const buildRamadanDatesFromStart = async (
  start: string,
  days: number,
): Promise<ReadonlyArray<RamadanDate>> => {
  const dates = Array.from({ length: days }, (_, idx) => addDays(start, idx));
  const conversions = await Promise.all(
    dates.map(async (dateKey) => {
      const converted = await fetchHijriByDate(dateKey);
      return {
        dateKey,
        hijri: converted.hijri,
      };
    }),
  );

  return conversions.map(({ dateKey, hijri }) => ({
    dateKey,
    gregorianLabel: formatGregorianLabel(dateKey),
    hijriLabel: formatHijriLabel(hijri),
  }));
};

const resolveRamadanCalendar = async (
  location: LocationConfig,
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

const getPrayerMap = (rows: ReadonlyArray<DayAttendance>): Map<string, PrayerRecord> => {
  const map = new Map<string, PrayerRecord>();
  for (const row of rows) {
    map.set(row.date, row.prayers);
  }
  return map;
};

export const registerHistoryCommand = (program: Command): void => {
  program
    .command('history')
    .description('View prayer attendance history')
    .option('-f, --from <date>', 'From date YYYY-MM-DD')
    .option('-t, --to <date>', 'To date YYYY-MM-DD')
    .option('-m, --month <month>', 'Month in YYYY-MM (e.g. Ramadan month)')
    .option('--ramadan', 'Show only Ramadan dates (Hijri month 9)')
    .option('--ramadan-start <date>', 'Ramadan start date in YYYY-MM-DD (Indonesia: 2026-02-19)')
    .option('--ramadan-days <days>', 'Ramadan length in days (29 or 30)')
    .option('--ramadan-year <year>', 'Hijri year for Ramadan (e.g. 1447)')
    .action(async (options: HistoryOptions) => {
      try {
        const from = options.from ? parseDateKey(options.from) : undefined;
        const to = options.to ? parseDateKey(options.to) : undefined;
        const month = options.month ? parseMonthKey(options.month) : undefined;
        const ramadanStart = options.ramadanStart ? parseDateKey(options.ramadanStart) : undefined;
        const ramadanDays = options.ramadanDays ? parseDays(options.ramadanDays) : undefined;
        const ramadanYear = options.ramadanYear ? parseHijriYear(options.ramadanYear) : 1447;
        const useRamadan = Boolean(options.ramadan || ramadanStart || ramadanDays);

        const attendance = listAttendance();
        let rows = filterByRange(attendance, from, to);
        if (month) {
          rows = rows.filter((row) => row.date.startsWith(`${month}-`));
        }

        let ramadanDates: ReadonlyArray<RamadanDate> | undefined;
        let ramadanRangeLabel: string | undefined;
        if (useRamadan) {
          const config = getConfig();
          if (!config.location) {
            throw new Error('Location is required to resolve Ramadan dates. Run schedule first.');
          }

          if (ramadanStart) {
            const days = ramadanDays ?? 30;
            ramadanDates = await buildRamadanDatesFromStart(ramadanStart, days);
            ramadanRangeLabel = `1 Ramadan ${ramadanYear} → ${days} Ramadan ${ramadanYear}`;
          } else {
            const calendar = await resolveRamadanCalendar(
              config.location,
              ramadanYear,
              config.method,
              config.school,
            );
            ramadanDates = buildRamadanDatesFromCalendar(calendar);
            ramadanRangeLabel = `1 Ramadan ${ramadanYear} → ${calendar.length} Ramadan ${ramadanYear}`;
          }
        }

        if (useRamadan && ramadanDates) {
          const prayerMap = getPrayerMap(attendance);
          const rowsForTable = ramadanDates.map((date) => ({
            date,
            prayers: prayerMap.get(date.dateKey) ?? {},
          }));

          const totalDays = rowsForTable.length;
          const totalPrayers = totalDays * PRAYERS.length;
          const completed = rowsForTable.reduce((sum, row) => {
            return (
              sum +
              PRAYERS.reduce((inner, prayer) => inner + (row.prayers[prayer] ? 1 : 0), 0)
            );
          }, 0);
          const percent = totalPrayers > 0 ? Math.round((completed / totalPrayers) * 100) : 0;

          renderHistoryHeader();
          renderLine(`${pc.dim('• Range:')} Ramadan`);
          if (ramadanRangeLabel) {
            renderLine(`${pc.dim('• Hijri:')} ${ramadanRangeLabel}`);
          }
          renderLine(
            `${pc.dim('• Total:')} ${totalDays} days • ${completed}/${totalPrayers} prayers (${percent}%)`,
          );
          renderLine();

          const headers = ['Date', 'Hijri', ...PRAYERS];
          const colWidths = headers.map((header, idx) => {
            if (idx === 0) {
              return Math.max(header.length, ...rowsForTable.map((row) => row.date.gregorianLabel.length));
            }
            if (idx === 1) {
              return Math.max(header.length, ...rowsForTable.map((row) => row.date.hijriLabel.length));
            }
            return Math.max(header.length, 3);
          });
          const gap = '   ';
          const center = (value: string, width: number): string => {
            const visible = stripAnsi(value).length;
            if (visible >= width) return value;
            const left = Math.floor((width - visible) / 2);
            const right = width - visible - left;
            return `${' '.repeat(left)}${value}${' '.repeat(right)}`;
          };
          const line = headers
            .map((header, idx) => center(pc.dim(header), colWidths[idx]))
            .join(gap);

          renderLine(line);
          renderLine(pc.dim('─'.repeat(stripAnsi(line).length)));

          for (const row of rowsForTable) {
            const values = [
              row.date.gregorianLabel,
              row.date.hijriLabel,
              ...PRAYERS.map((prayer) => (row.prayers[prayer] ? accent('✓') : pc.dim('·'))),
            ];
            const formatted = values
              .map((value, idx) =>
                idx < 2 ? padAnsi(value, colWidths[idx]) : center(value, colWidths[idx]),
              )
              .join(gap);
            renderLine(formatted);
          }

          renderLine();
          renderLine(pc.dim('Legend: ✓ completed   · missed'));
          return;
        }

        if (rows.length === 0) {
          renderLine(pc.dim(useRamadan ? 'No Ramadan records yet.' : 'No attendance records yet.'));
          return;
        }

        const totalDays = rows.length;
        const totalPrayers = rows.length * PRAYERS.length;
        const completed = rows.reduce((sum, row) => {
          return sum + PRAYERS.reduce((inner, prayer) => inner + (row.prayers[prayer] ? 1 : 0), 0);
        }, 0);
        const percent = totalPrayers > 0 ? Math.round((completed / totalPrayers) * 100) : 0;

        renderHistoryHeader();
        renderLine(`${pc.dim('• Range:')} ${formatRangeLabel(from, to, month)}`);
        renderLine(`${pc.dim('• Total:')} ${totalDays} days • ${completed}/${totalPrayers} prayers (${percent}%)`);
        renderLine();

        const headers = ['Date', ...PRAYERS];
        const formattedRows = rows.map((row) => ({
          ...row,
          displayDate: formatGregorianLabel(row.date),
        }));
        const colWidths = headers.map((header, idx) => {
          if (idx === 0) {
            return Math.max(header.length, ...formattedRows.map((row) => row.displayDate.length));
          }
          return Math.max(header.length, 3);
        });
        const gap = '   ';
        const center = (value: string, width: number): string => {
          const visible = stripAnsi(value).length;
          if (visible >= width) return value;
          const left = Math.floor((width - visible) / 2);
          const right = width - visible - left;
          return `${' '.repeat(left)}${value}${' '.repeat(right)}`;
        };
        const line = headers
          .map((header, idx) => (idx === 0 ? padAnsi(pc.dim(header), colWidths[idx]) : center(pc.dim(header), colWidths[idx])))
          .join(gap);

        renderLine(line);
        renderLine(pc.dim('─'.repeat(stripAnsi(line).length)));

        for (const row of formattedRows) {
          const values = [
            row.displayDate,
            ...PRAYERS.map((prayer) => (row.prayers[prayer] ? accent('✓') : pc.dim('·'))),
          ];
          const formatted = values
            .map((value, idx) =>
              idx === 0 ? padAnsi(value, colWidths[idx]) : center(value, colWidths[idx]),
            )
            .join(gap);
          renderLine(formatted);
        }

        renderLine();
        renderLine(pc.dim('Legend: ✓ completed   · missed'));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        renderLine(pc.red(message));
        process.exitCode = 1;
      }
    });
};
