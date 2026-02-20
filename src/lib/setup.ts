import { cancel, intro, isCancel, outro, select, text } from '@clack/prompts';
import ora from 'ora';
import pc from 'picocolors';

import { fetchMethods, type MethodsResponse } from './api.js';
import { guessLocation } from './geo.js';
import { getConfig, setConfig, type LocationConfig, type UserConfig } from './store.js';

type DetectedLocation = {
  city?: string;
  country?: string;
  timezone?: string;
};

const FALLBACK_METHODS: MethodsResponse = {
  '1': { id: 1, name: 'University of Islamic Sciences, Karachi' },
  '2': { id: 2, name: 'Islamic Society of North America (ISNA)' },
  '3': { id: 3, name: 'Muslim World League' },
  '4': { id: 4, name: 'Umm Al-Qura, Makkah' },
  '5': { id: 5, name: 'Egyptian General Authority of Survey' },
  '7': { id: 7, name: 'Institute of Geophysics, University of Tehran' },
  '17': { id: 17, name: 'Indonesia' },
};

const detectLocation = async (): Promise<DetectedLocation | null> => guessLocation();

const hasSetup = (config: UserConfig): boolean => {
  return Boolean(config.location && typeof config.method === 'number' && typeof config.school === 'number');
};

const buildMethodOptions = (methods: MethodsResponse, country?: string) => {
  const list = Object.values(methods).sort((a, b) => a.id - b.id);
  const recommendedId = pickRecommendedMethodId(methods, country);

  if (recommendedId !== undefined) {
    list.sort((a, b) => {
      if (a.id === recommendedId) return -1;
      if (b.id === recommendedId) return 1;
      return 0;
    });
  }

  return list.map((method) => ({
    value: method.id,
    label: method.name + (method.id === recommendedId ? ' (Recommended)' : ''),
    hint: method.id === recommendedId ? 'Based on your country' : undefined,
  }));
};

const pickRecommendedMethodId = (methods: MethodsResponse, country?: string): number | undefined => {
  if (!country) {
    return undefined;
  }

  const countryKey = country.trim().toLowerCase();
  const methodList = Object.values(methods);

  if (countryKey === 'indonesia') {
    const match = methodList.find((method) => method.name.toLowerCase().includes('indonesia'));
    return match?.id;
  }

  return undefined;
};

export const ensureSetup = async (): Promise<UserConfig> => {
  const existing = getConfig();
  if (hasSetup(existing)) {
    return existing;
  }

  intro('Ramadan CLI Setup');

  const spinner = ora('Detecting location...').start();
  const detected = await detectLocation();

  if (detected?.city && detected?.country) {
    spinner.succeed(`Detected: ${detected.city}, ${detected.country}`);
  } else {
    spinner.warn('Unable to detect location automatically.');
  }

  const city = await text({
    message: 'Enter your city',
    initialValue: detected?.city ?? '',
    validate: (value) => (value ? undefined : 'City is required'),
  });

  if (isCancel(city)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }

  const country = await text({
    message: 'Enter your country',
    initialValue: detected?.country ?? '',
    validate: (value) => (value ? undefined : 'Country is required'),
  });

  if (isCancel(country)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }

  if (detected?.timezone) {
    console.log(pc.dim(`Detected timezone: ${detected.timezone}`));
  }

  const methodSpinner = ora('Loading calculation methods...').start();
  let methods: MethodsResponse;
  try {
    methods = await fetchMethods();
    methodSpinner.succeed('Methods loaded.');
  } catch {
    methodSpinner.fail('Failed to load methods. Using fallback list.');
    methods = FALLBACK_METHODS;
  }

  const recommendedMethodId = pickRecommendedMethodId(methods, country);

  const methodChoice = await select({
    message: 'Select calculation method',
    options: buildMethodOptions(methods, country),
    initialValue: recommendedMethodId,
  });

  if (isCancel(methodChoice)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }

  const methodId = Number(methodChoice);

  const schoolChoice = await select({
    message: 'Select Asr school',
    options: [
      { value: 0, label: 'Shafi (Recommended)', hint: 'Standard Asr timing' },
      { value: 1, label: 'Hanafi', hint: 'Later Asr timing' },
    ],
  });

  if (isCancel(schoolChoice)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }

  const school = Number(schoolChoice);

  const timezoneOptions = detected?.timezone
    ? [
        {
          value: 'detected',
          label: `Use detected timezone (${detected.timezone})`,
        },
        { value: 'custom', label: 'Set custom timezone' },
        { value: 'none', label: 'Do not set timezone override' },
      ]
    : [
        { value: 'custom', label: 'Set custom timezone' },
        { value: 'none', label: 'Do not set timezone override' },
      ];

  const timezoneChoice = await select({
    message: 'Timezone preference',
    options: timezoneOptions,
  });

  if (isCancel(timezoneChoice)) {
    cancel('Setup cancelled.');
    process.exit(0);
  }

  let timezone: string | undefined;
  if (timezoneChoice === 'detected') {
    timezone = detected?.timezone;
  }

  if (timezoneChoice === 'custom') {
    const timezoneInput = await text({
      message: 'Enter timezone (e.g. Asia/Jakarta)',
      validate: (value) => (value ? undefined : 'Timezone is required'),
    });

    if (isCancel(timezoneInput)) {
      cancel('Setup cancelled.');
      process.exit(0);
    }

    timezone = timezoneInput;
  }

  const location: LocationConfig = {
    type: 'city',
    city,
    country,
  };

  const updated = setConfig({
    location,
    method: methodId,
    school,
    timezone,
  });

  outro('Setup complete.');
  return updated;
};
