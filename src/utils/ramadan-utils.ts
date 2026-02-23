import {
  fetchHijriByDate,
  fetchHijriCalendarByAddress,
  fetchHijriCalendarByCity,
  type PrayerData,
} from '../lib/api.js';
import type { LocationConfig } from '../lib/store.js';

export const parseDateKey = (value: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error('Date must be in YYYY-MM-DD format');
  }
  return value;
};

export const parseDays = (value: string): number => {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    throw new Error('Ramadan days must be an integer between 1 and 30');
  }
  return days;
};

export const parseHijriYear = (value: string): number => {
  const year = Number(value);
  if (!Number.isInteger(year) || year < 1) {
    throw new Error('Hijri year must be a positive integer');
  }
  return year;
};

export const addDays = (dateKey: string, days: number): string => {
  const [year, month, day] = dateKey.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + days);
  const nextYear = date.getFullYear();
  const nextMonth = String(date.getMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
};

export const toDateKeyFromGregorian = (dateValue: string): string => {
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dateValue);
  if (!match) {
    throw new Error('Unexpected Gregorian date format');
  }
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
};

export const formatDateLabel = (dateKey: string): string => {
  const [year, month, day] = dateKey.split('-').map((part) => Number(part));
  const date = new Date(year, month - 1, day);
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
};

export const resolveRamadanCalendar = async (
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

export const isRamadanDate = async (dateKey: string): Promise<boolean> => {
  try {
    const converted = await fetchHijriByDate(dateKey);
    return converted.hijri.month.number === 9;
  } catch {
    return false;
  }
};
