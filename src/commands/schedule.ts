import { cancel, isCancel, select, text } from '@clack/prompts';
import type { Command } from 'commander';
import ora from 'ora';
import pc from 'picocolors';

import {
  fetchCalendarByAddress,
  fetchCalendarByCity,
  fetchTimingsByAddress,
  fetchTimingsByCity,
  type PrayerData,
  type PrayerTimings,
} from '../lib/api.js';
import { getConfig, setConfig, type LocationConfig } from '../lib/store.js';

type ScheduleOptions = {
  city?: string;
  country?: string;
  address?: string;
  method?: string;
  school?: string;
  date?: string;
  month?: string;
  save?: boolean;
};

type PrayerName = 'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha';

type PrayerStatus = {
  current?: PrayerName;
  next?: PrayerName;
  nextTime?: string;
  minutesAway?: number;
};

const PRAYER_ORDER: PrayerName[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

const parseDateInput = (value: string): Date => {
  const match = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (!match) {
    throw new Error('Date must be in YYYY-MM-DD format');
  }

  const [year, month, day] = value.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid date');
  }

  return date;
};

const parseMonthInput = (value: string): { year: number; month: number } => {
  const match = /^\d{4}-\d{2}$/.test(value);
  if (!match) {
    throw new Error('Month must be in YYYY-MM format');
  }

  const [year, month] = value.split('-').map((part) => Number(part));
  if (month < 1 || month > 12) {
    throw new Error('Month must be between 01 and 12');
  }

  return { year, month };
};

const parseOptionalNumber = (value?: string): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error('Value must be an integer');
  }
  return parsed;
};

const extractTime = (value: string): string => value.split(' ')[0] ?? value;

const parseTimeToMinutes = (value: string): number | null => {
  const match = /^(\d{1,2}):(\d{2})/.exec(extractTime(value));
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }

  return hour * 60 + minute;
};

const getNowInTimezone = (timezone?: string): { label: string; minutes: number } => {
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
        return {
          label: `${hourPart.padStart(2, '0')}:${minutePart.padStart(2, '0')}`,
          minutes: hour * 60 + minute,
        };
      }
    } catch {
      // Fallback to local time below.
    }
  }

  const hour = date.getHours();
  const minute = date.getMinutes();
  return {
    label: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
    minutes: hour * 60 + minute,
  };
};

const formatDuration = (totalMinutes?: number): string => {
  if (totalMinutes === undefined) {
    return '--';
  }

  const minutes = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${remainder}m`;
  }
  return `${remainder}m`;
};

const computePrayerStatus = (timings: PrayerTimings, nowMinutes: number): PrayerStatus => {
  const minutesByPrayer: Record<PrayerName, number | null> = {
    Fajr: parseTimeToMinutes(timings.Fajr),
    Dhuhr: parseTimeToMinutes(timings.Dhuhr),
    Asr: parseTimeToMinutes(timings.Asr),
    Maghrib: parseTimeToMinutes(timings.Maghrib),
    Isha: parseTimeToMinutes(timings.Isha),
  };

  let next: PrayerName | undefined;
  let nextMinutes: number | undefined;

  for (const prayer of PRAYER_ORDER) {
    const minutes = minutesByPrayer[prayer];
    if (minutes === null) {
      continue;
    }

    if (nowMinutes < minutes) {
      next = prayer;
      nextMinutes = minutes;
      break;
    }
  }

  if (!next) {
    const fajrMinutes = minutesByPrayer.Fajr;
    if (fajrMinutes !== null) {
      next = 'Fajr';
      nextMinutes = fajrMinutes + 24 * 60;
    }
  }

  let current: PrayerName | undefined;
  for (const prayer of PRAYER_ORDER) {
    const minutes = minutesByPrayer[prayer];
    if (minutes === null) {
      continue;
    }

    if (nowMinutes >= minutes) {
      current = prayer;
    }
  }

  const nextTime = next ? extractTime(timings[next]) : undefined;
  const minutesAway = nextMinutes !== undefined ? nextMinutes - nowMinutes : undefined;

  return {
    current,
    next,
    nextTime,
    minutesAway,
  };
};

const formatLocationLabel = (location: LocationConfig): string => {
  if (location.type === 'address') {
    return location.address;
  }

  return `${location.city}, ${location.country}`;
};

const ANSI_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');
const stripAnsi = (value: string): string => value.replace(ANSI_REGEX, '');

const centerAnsi = (value: string, width: number): string => {
  const visible = stripAnsi(value).length;
  if (visible >= width) {
    return value;
  }
  const left = Math.floor((width - visible) / 2);
  const right = width - visible - left;
  return `${' '.repeat(left)}${value}${' '.repeat(right)}`;
};

const padBetween = (left: string, right: string, width: number): string => {
  const leftLen = stripAnsi(left).length;
  const rightLen = stripAnsi(right).length;
  const space = Math.max(1, width - leftLen - rightLen);
  return `${left}${' '.repeat(space)}${right}`;
};

const accent = (value: string): string => `\x1b[38;2;128;240;151m${value}\x1b[0m`;
const nowAccent = (value: string): string => `\x1b[38;2;255;214;102m${value}\x1b[0m`;

const LEFT_PAD = '  ';
const renderLine = (text = ''): void => {
  if (!text) {
    console.log('');
    return;
  }
  console.log(`${LEFT_PAD}${text}`);
};

const renderDailySchedule = (data: PrayerData, location: LocationConfig): void => {
  const config = getConfig();
  const timezoneOverride = config.timezone;
  const timezone = timezoneOverride ?? data.meta.timezone;
  const timezoneLabel =
    timezoneOverride && timezoneOverride !== data.meta.timezone
      ? `${timezoneOverride} (override)`
      : data.meta.timezone;

  const hijri = `${data.date.hijri.date} ${data.date.hijri.month.en} ${data.date.hijri.year}`;
  const locationLabel = formatLocationLabel(location);
  const now = getNowInTimezone(timezone);
  const prayerStatus = computePrayerStatus(data.timings, now.minutes);
  const currentLabel = prayerStatus.current
    ? `${prayerStatus.current} ${extractTime(data.timings[prayerStatus.current])}`
    : 'Night';
  const nextLabel =
    prayerStatus.next && prayerStatus.nextTime
      ? `${prayerStatus.next} at ${prayerStatus.nextTime} (in ${formatDuration(
          prayerStatus.minutesAway,
        )})`
      : '--';

  const rows: Array<[string, string]> = [
    ['Imsak', data.timings.Imsak],
    ['Fajr', data.timings.Fajr],
    ['Sunrise', data.timings.Sunrise],
    ['Dhuhr', data.timings.Dhuhr],
    ['Asr', data.timings.Asr],
    ['Maghrib', data.timings.Maghrib],
    ['Isha', data.timings.Isha],
  ];

  const columns = rows.map(([label, time]) => ({
    label,
    time,
  }));

  const colWidths = columns.map((col) => Math.max(col.label.length, col.time.length));
  const gap = '    ';
  const totalWidth = colWidths.reduce((sum, width) => sum + width, 0) + gap.length * (colWidths.length - 1);

  renderLine();
  renderLine(accent('██████╗  █████╗ ███╗   ███╗ █████╗ ██████╗  █████╗ ███╗   ██╗'));
  renderLine(accent('██╔══██╗██╔══██╗████╗ ████║██╔══██╗██╔══██╗██╔══██╗████╗  ██║'));
  renderLine(accent('██████╔╝███████║██╔████╔██║███████║██║  ██║███████║██╔██╗ ██║'));
  renderLine(accent('██╔══██╗██╔══██║██║╚██╔╝██║██╔══██║██║  ██║██╔══██║██║╚██╗██║'));
  renderLine(accent('██║  ██║██║  ██║██║ ╚═╝ ██║██║  ██║██████╔╝██║  ██║██║ ╚████║'));
  renderLine(accent('╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝╚═╝  ╚═╝╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═══╝'));
  renderLine(
    padBetween(`${pc.bold('Date:')} ${data.date.readable}`, pc.dim(`Hijri: ${hijri}`), totalWidth),
  );
  renderLine();
  renderLine(`${pc.dim('📍 Location:')} ${locationLabel}`);
  renderLine(`${pc.dim('🕒 Timezone:')} ${timezoneLabel}`);
  renderLine(`${pc.dim('🌙 Roza day:')} ${data.date.hijri.day}`);
  renderLine();

  const headerLabels = columns.map((col, idx) => {
    const isNext = prayerStatus.next === col.label;
    const color = isNext ? accent : pc.dim;
    return centerAnsi(color(col.label), colWidths[idx]);
  });
  const timeValues = columns.map((col, idx) => {
    const isNext = prayerStatus.next === col.label;
    const color = isNext ? accent : pc.white;
    return centerAnsi(color(col.time), colWidths[idx]);
  });
  renderLine(headerLabels.join(gap));
  const separatorLine = '─'.repeat(totalWidth);
  renderLine(pc.dim(separatorLine));
  renderLine(timeValues.join(gap));
  renderLine();
  renderLine(`${pc.dim('• Now:')} ${nowAccent(now.label)}`);
  renderLine(`${pc.dim('• Current:')} ${accent(currentLabel)}`);
  renderLine(`${pc.dim('• Upcoming:')} ${accent(nextLabel)}`);
};

const renderMonthlySchedule = (items: ReadonlyArray<PrayerData>): void => {
  if (items.length === 0) {
    console.log(pc.yellow('No schedule data found for this month.'));
    return;
  }

  const { month, year } = items[0].date.gregorian;
  console.log(pc.bold(`Schedule for ${month.en} ${year}`));
  console.log(pc.dim(`Timezone: ${items[0].meta.timezone}`));
  console.log('');

  for (const item of items) {
    const label = item.date.readable;
    const t = item.timings;
    console.log(
      `${pc.cyan(label)}  Fajr ${t.Fajr}  Dhuhr ${t.Dhuhr}  Asr ${t.Asr}  Maghrib ${t.Maghrib}  Isha ${t.Isha}`,
    );
  }
};

const resolveLocation = async (options: ScheduleOptions): Promise<LocationConfig> => {
  if (options.address) {
    return { type: 'address', address: options.address };
  }

  if (options.city || options.country) {
    const city = options.city;
    let country = options.country;

    if (!city) {
      const cityInput = await text({
        message: 'City',
        validate: (value) => (value ? undefined : 'City is required'),
      });

      if (isCancel(cityInput)) {
        cancel('Setup cancelled.');
        process.exit(0);
      }

      if (!country) {
        const countryInput = await text({
          message: 'Country',
          validate: (value) => (value ? undefined : 'Country is required'),
        });

        if (isCancel(countryInput)) {
          cancel('Setup cancelled.');
          process.exit(0);
        }

        country = countryInput;
      }

      return { type: 'city', city: cityInput, country };
    }

    if (!country) {
      const countryInput = await text({
        message: 'Country',
        validate: (value) => (value ? undefined : 'Country is required'),
      });

      if (isCancel(countryInput)) {
        cancel('Setup cancelled.');
        process.exit(0);
      }

      country = countryInput;
    }

    return { type: 'city', city, country };
  }

  const config = getConfig();
  if (config.location) {
    return config.location;
  }

  const locationType = await select({
    message: 'How should we locate prayer times?',
    options: [
      { value: 'city', label: 'City + country' },
      { value: 'address', label: 'Full address' },
    ],
  });

  if (isCancel(locationType)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }

  if (locationType === 'address') {
    const address = await text({
      message: 'Enter your address',
      validate: (value) => (value ? undefined : 'Address is required'),
    });

    if (isCancel(address)) {
      cancel('Setup cancelled.');
      process.exit(0);
    }

    return { type: 'address', address };
  }

  const city = await text({
    message: 'City',
    validate: (value) => (value ? undefined : 'City is required'),
  });

  if (isCancel(city)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }

  const country = await text({
    message: 'Country',
    validate: (value) => (value ? undefined : 'Country is required'),
  });

  if (isCancel(country)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }

  return { type: 'city', city, country };
};

export const registerScheduleCommand = (program: Command): void => {
  program
    .command('schedule')
    .description('Show Ramadan and daily prayer schedules')
    .option('-d, --date <date>', 'Date in YYYY-MM-DD format')
    .option('-m, --month <month>', 'Month in YYYY-MM format')
    .option('--city <city>', 'City for prayer times')
    .option('--country <country>', 'Country for prayer times')
    .option('--address <address>', 'Full address for prayer times')
    .option('--method <id>', 'Calculation method id')
    .option('--school <id>', 'School id (0 = Shafi, 1 = Hanafi)')
    .option('--no-save', 'Do not persist location/method')
    .action(async (options: ScheduleOptions) => {
      try {
        const location = await resolveLocation(options);
        const existing = getConfig();
        const method = parseOptionalNumber(options.method) ?? existing.method;
        const school = parseOptionalNumber(options.school) ?? existing.school;

        const spinner = ora('Fetching schedule...').start();

        if (options.month) {
          const { year, month } = parseMonthInput(options.month);
          const data =
            location.type === 'city'
              ? await fetchCalendarByCity({
                  city: location.city,
                  country: location.country,
                  year,
                  month,
                  method,
                  school,
                })
              : await fetchCalendarByAddress({
                  address: location.address,
                  year,
                  month,
                  method,
                  school,
                });

          spinner.stop();
          renderMonthlySchedule(data);
        } else {
          const date = options.date ? parseDateInput(options.date) : undefined;
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

          spinner.stop();
          renderDailySchedule(data, location);
        }

        if (options.save !== false) {
          setConfig({
            location,
            method,
            school,
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        console.error(pc.red(message));
        process.exitCode = 1;
      }
    });
};
