import { cancel, confirm, intro, isCancel, outro, text } from '@clack/prompts';
import type { Command } from 'commander';
import { access, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pc from 'picocolors';

import { exportStore } from '../lib/store.js';
import { DEFAULT_EXPORT_FILE } from '../utils/export-utils.js';

type ExportOptions = {
  file?: string;
  force?: boolean;
};

const fileExists = async (filePath: string): Promise<boolean> => {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
};

export const registerExportCommand = (program: Command): void => {
  program
    .command('export')
    .description('Export all saved data to a JSON file')
    .option('-f, --file <path>', 'Output file path')
    .option('--force', 'Overwrite file if it exists')
    .action(async (options: ExportOptions) => {
      intro('Export data');

      const fileInput =
        options.file ??
        (await text({
          message: 'Export file path (e.g. /path/to/roza-export.json)',
          initialValue: DEFAULT_EXPORT_FILE,
          validate: (value) => (value ? undefined : 'Path is required'),
        }));

      if (isCancel(fileInput)) {
        cancel('Export cancelled.');
        return;
      }

      const resolvedPath = path.resolve(process.cwd(), fileInput);
      const exists = await fileExists(resolvedPath);

      if (exists && !options.force) {
        const shouldOverwrite = await confirm({
          message: `File already exists at ${fileInput}. Overwrite it?`,
          initialValue: false,
        });

        if (isCancel(shouldOverwrite)) {
          cancel('Export cancelled.');
          return;
        }

        if (!shouldOverwrite) {
          outro(pc.dim('No changes made.'));
          return;
        }
      }

      const data = exportStore();
      const payload = JSON.stringify(data, null, 2);
      await writeFile(resolvedPath, payload, 'utf8');

      const attendanceCount = Object.keys(data.attendance ?? {}).length;
      outro(`Exported ${attendanceCount} days to ${resolvedPath}.`);
    });
};
