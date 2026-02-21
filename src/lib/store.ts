import Conf from 'conf';
import { z } from 'zod';

const CityLocationSchema = z.object({
  type: z.literal('city'),
  city: z.string().min(1),
  country: z.string().min(1),
});

const AddressLocationSchema = z.object({
  type: z.literal('address'),
  address: z.string().min(1),
});

const LocationSchema = z.union([CityLocationSchema, AddressLocationSchema]);

const UserConfigSchema = z.object({
  location: LocationSchema.optional(),
  method: z.number().int().optional(),
  school: z.number().int().optional(),
  timezone: z.string().optional(),
});

export type UserConfig = z.infer<typeof UserConfigSchema>;
export type LocationConfig = z.infer<typeof LocationSchema>;

export const PRAYERS = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const;
export type PrayerName = (typeof PRAYERS)[number];

const PrayerRecordSchema = z.object({
  Fajr: z.boolean().optional(),
  Dhuhr: z.boolean().optional(),
  Asr: z.boolean().optional(),
  Maghrib: z.boolean().optional(),
  Isha: z.boolean().optional(),
});

const DayAttendanceSchema = z.object({
  date: z.string(),
  prayers: PrayerRecordSchema,
  updatedAt: z.string(),
});

const StoreSchema = UserConfigSchema.extend({
  attendance: z.record(z.string(), DayAttendanceSchema).optional(),
});

export type PrayerRecord = z.infer<typeof PrayerRecordSchema>;
export type DayAttendance = z.infer<typeof DayAttendanceSchema>;
export type StoreState = z.infer<typeof StoreSchema>;

const store = new Conf<StoreState>({
  projectName: 'roza-cli',
});

const readState = (): StoreState => {
  const parsed = StoreSchema.safeParse(store.store);
  if (parsed.success) {
    return parsed.data;
  }

  return {};
};

export const getConfig = (): UserConfig => {
  const state = readState();
  const { location, method, school, timezone } = state;
  return { location, method, school, timezone };
};

export const setConfig = (next: Partial<UserConfig>): UserConfig => {
  const current = readState();
  const merged: StoreState = {
    ...current,
    ...next,
    location: next.location ?? current.location,
  };
  store.store = merged;
  const { location, method, school, timezone } = merged;
  return { location, method, school, timezone };
};

export const clearConfig = (): void => {
  store.clear();
};

export const getAttendance = (dateKey: string): DayAttendance | undefined => {
  const state = readState();
  return state.attendance?.[dateKey];
};

export const listAttendance = (): ReadonlyArray<DayAttendance> => {
  const state = readState();
  const entries = Object.values(state.attendance ?? {});
  return entries.sort((a, b) => a.date.localeCompare(b.date));
};

export const setAttendance = (dateKey: string, prayers: PrayerRecord): DayAttendance => {
  const state = readState();
  const existing = state.attendance?.[dateKey];
  const nextRecord: DayAttendance = {
    date: dateKey,
    prayers: {
      ...existing?.prayers,
      ...prayers,
    },
    updatedAt: new Date().toISOString(),
  };

  const nextAttendance = {
    ...(state.attendance ?? {}),
    [dateKey]: nextRecord,
  };

  store.store = {
    ...state,
    attendance: nextAttendance,
  };

  return nextRecord;
};
