import type { Command } from 'commander';
import pc from 'picocolors';

import packageJson from '../../package.json' with { type: 'json' };

export const registerAboutCommand = (program: Command): void => {
  program
    .command('about')
    .description('About roza-cli')
    .action(() => {
      console.log('Roza CLI');
      console.log(pc.dim(`Version: ${packageJson.version}`));
      console.log(pc.dim(packageJson.description ?? 'Ramadan and prayer attendance CLI'));
      if (packageJson.repository?.url) {
        console.log('');
        console.log(pc.dim(`⭐ Give it a star: ${packageJson.repository.url}`));
        console.log('');
      }
    });
};
