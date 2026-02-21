import { PRAYERS, type DayAttendance } from './store.js';

export type RecapSummary = {
  totalDays: number;
  completed: number;
  total: number;
  percent: number;
  activeDays: number;
  perfectDays: number;
  averagePerDay: number;
};

export type DailyStat = {
  date: string;
  completed: number;
  total: number;
};

export const calcSummary = (rows: ReadonlyArray<DayAttendance>): RecapSummary => {
  const totalDays = rows.length;
  const total = totalDays * PRAYERS.length;
  const completed = rows.reduce((sum, row) => {
    return sum + PRAYERS.reduce((inner, prayer) => inner + (row.prayers[prayer] ? 1 : 0), 0);
  }, 0);
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const activeDays = rows.reduce((sum, row) => {
    const completedCount = PRAYERS.reduce((inner, prayer) => inner + (row.prayers[prayer] ? 1 : 0), 0);
    return sum + (completedCount > 0 ? 1 : 0);
  }, 0);
  const perfectDays = rows.reduce((sum, row) => {
    const completedCount = PRAYERS.reduce((inner, prayer) => inner + (row.prayers[prayer] ? 1 : 0), 0);
    return sum + (completedCount === PRAYERS.length ? 1 : 0);
  }, 0);
  const averagePerDay = totalDays > 0 ? Number((completed / totalDays).toFixed(2)) : 0;

  return {
    totalDays,
    completed,
    total,
    percent,
    activeDays,
    perfectDays,
    averagePerDay,
  };
};

export const calcDailyStats = (rows: ReadonlyArray<DayAttendance>): ReadonlyArray<DailyStat> => {
  return rows
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => {
      const completed = PRAYERS.reduce((sum, prayer) => sum + (row.prayers[prayer] ? 1 : 0), 0);
      return {
        date: row.date,
        completed,
        total: PRAYERS.length,
      };
    });
};
