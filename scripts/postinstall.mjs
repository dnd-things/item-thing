import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(__dirname);

async function main() {
  try {
    console.log(
      'Starting postinstall: pack Sparticuz chromium for public/chromium-pack.tar',
    );

    const chromiumResolvedPath = import.meta.resolve('@sparticuz/chromium');
    const chromiumPath = chromiumResolvedPath.replace(/^file:\/\//, '');
    const chromiumDir = dirname(dirname(dirname(chromiumPath)));
    const binDir = join(chromiumDir, 'bin');

    if (!existsSync(binDir)) {
      console.warn(
        'Chromium bin directory not found; skip chromium-pack.tar (OK for environments without @sparticuz/chromium)',
      );
      return;
    }

    const publicDir = join(projectRoot, 'public');
    const outputPath = join(publicDir, 'chromium-pack.tar');

    execSync(
      `mkdir -p "${publicDir}" && tar -cf "${outputPath}" -C "${binDir}" .`,
      {
        stdio: 'inherit',
        cwd: projectRoot,
      },
    );

    console.log('Created', outputPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('postinstall chromium pack failed:', message);
    console.warn(
      'Continuing install (local dev can use puppeteer or PUPPETEER_EXECUTABLE_PATH)',
    );
    process.exit(0);
  }
}

await main();
