import { z } from 'zod';

type GeoLocation = {
  city?: string;
  country?: string;
  timezone?: string;
};

const IpApiSchema = z.object({
  city: z.string(),
  country: z.string(),
  timezone: z.string().optional(),
});

const IpapiCoSchema = z.object({
  city: z.string(),
  country_name: z.string(),
  timezone: z.string().optional(),
});

const IpWhoisSchema = z.object({
  success: z.boolean(),
  city: z.string(),
  country: z.string(),
  timezone: z
    .object({
      id: z.string().optional(),
    })
    .optional(),
});

const fetchJson = async (url: string, timeoutMs = 3000): Promise<unknown> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error('Bad response');
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
};

const tryIpApi = async (): Promise<GeoLocation | null> => {
  try {
    const json = await fetchJson('http://ip-api.com/json/?fields=city,country,timezone');
    const parsed = IpApiSchema.safeParse(json);
    if (!parsed.success) {
      return null;
    }
    return {
      city: parsed.data.city,
      country: parsed.data.country,
      timezone: parsed.data.timezone ?? undefined,
    };
  } catch {
    return null;
  }
};

const tryIpapiCo = async (): Promise<GeoLocation | null> => {
  try {
    const json = await fetchJson('https://ipapi.co/json/');
    const parsed = IpapiCoSchema.safeParse(json);
    if (!parsed.success) {
      return null;
    }
    return {
      city: parsed.data.city,
      country: parsed.data.country_name,
      timezone: parsed.data.timezone ?? undefined,
    };
  } catch {
    return null;
  }
};

const tryIpWhois = async (): Promise<GeoLocation | null> => {
  try {
    const json = await fetchJson('https://ipwho.is/');
    const parsed = IpWhoisSchema.safeParse(json);
    if (!parsed.success || !parsed.data.success) {
      return null;
    }

    return {
      city: parsed.data.city,
      country: parsed.data.country,
      timezone: parsed.data.timezone?.id ?? undefined,
    };
  } catch {
    return null;
  }
};

export const guessLocation = async (): Promise<GeoLocation | null> => {
  const fromIpApi = await tryIpApi();
  if (fromIpApi) {
    return fromIpApi;
  }

  const fromIpapi = await tryIpapiCo();
  if (fromIpapi) {
    return fromIpapi;
  }

  return tryIpWhois();
};
