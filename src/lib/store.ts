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

const store = new Conf<UserConfig>({
  projectName: 'puasa-cli',
});

const readConfig = (): UserConfig => {
  const parsed = UserConfigSchema.safeParse(store.store);
  if (parsed.success) {
    return parsed.data;
  }

  return {};
};

export const getConfig = (): UserConfig => readConfig();

export const setConfig = (next: Partial<UserConfig>): UserConfig => {
  const current = readConfig();
  const merged: UserConfig = {
    ...current,
    ...next,
    location: next.location ?? current.location,
  };
  store.store = merged;
  return merged;
};

export const clearConfig = (): void => {
  store.clear();
};
