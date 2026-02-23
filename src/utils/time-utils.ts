export const extractTime = (value: string): string => value.split(' ')[0] ?? value;

export const parseTimeToMinutes = (value: string): number | null => {
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
