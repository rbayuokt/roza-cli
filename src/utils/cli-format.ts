const ANSI_REGEX = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g');

export const stripAnsi = (value: string): string => value.replace(ANSI_REGEX, '');

export const padAnsi = (value: string, width: number): string => {
  const visible = stripAnsi(value).length;
  if (visible >= width) {
    return value;
  }
  return value + ' '.repeat(width - visible);
};
