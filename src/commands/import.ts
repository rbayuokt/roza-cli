import { cancel, confirm, intro, isCancel, outro, text } from '@clack/prompts';
import type { Command } from 'commander';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import pc from 'picocolors';

import { exportStore, importStore } from '../lib/store.js';

type ImportOptions = {
  file?: string;
};

const DEFAULT_EXPORT_FILE = 'roza-export.json';

export const registerImportCommand = (program: Command): void => {
  program
    .command('import')
    .description('Import data from a JSON file (overwrites current data)')
    .option('-f, --file <path>', 'Import file path')
    .action(async (options: ImportOptions) => {
      intro('Import data');

      const fileInput =
        options.file ??
        (await text({
          message: 'Import file path (e.g. /path/to/roza-export.json)',
          initialValue: DEFAULT_EXPORT_FILE,
          validate: (value) => (value ? undefined : 'Path is required'),
        }));

      if (isCancel(fileInput)) {
        cancel('Import cancelled.');
        return;
      }

      const resolvedPath = path.resolve(process.cwd(), fileInput);
      let parsed: unknown;

      try {
        const raw = await readFile(resolvedPath, 'utf8');
        parsed = JSON.parse(raw);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to read import file.';
        console.error(pc.red(message));
        return;
      }

      const shouldImport = await confirm({
        message: 'This will overwrite your current data. Continue?',
        initialValue: false,
      });

      if (isCancel(shouldImport)) {
        cancel('Import cancelled.');
        return;
      }

      if (!shouldImport) {
        outro(pc.dim('No changes made.'));
        return;
      }

      try {
        importStore(parsed as Parameters<typeof importStore>[0]);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Invalid import data.';
        console.error(pc.red(message));
        return;
      }

      const data = exportStore();
      const attendanceCount = Object.keys(data.attendance ?? {}).length;
      outro(`Imported ${attendanceCount} days from ${fileInput}.`);
    });
};
