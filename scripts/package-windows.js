const { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, copyFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { basename, join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const projectRoot = resolve(__dirname, '..');
const publishMode = process.argv.includes('--publish')
  ? process.argv[process.argv.indexOf('--publish') + 1]
  : 'never';

if (!['never', 'always'].includes(publishMode)) {
  throw new Error(`Unsupported publish mode: ${publishMode}`);
}

const temporaryOutput = mkdtempSync(join(tmpdir(), 'stfd-package-'));
const releaseOutput = join(projectRoot, 'release');
const builderCli = join(projectRoot, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js');

try {
  const result = spawnSync(
    process.execPath,
    [builderCli, '--publish', publishMode, `--config.directories.output=${temporaryOutput}`],
    {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
    },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status || 1;

  if (process.exitCode) return;

  const artifacts = readdirSync(temporaryOutput, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(temporaryOutput, entry.name))
    .filter((file) => /(?:\.exe|\.exe\.blockmap|latest\.yml)$/i.test(file));

  if (!artifacts.some((file) => file.toLowerCase().endsWith('.exe'))) {
    throw new Error('Packaging completed without producing a Windows installer.');
  }

  if (existsSync(releaseOutput)) rmSync(releaseOutput, { recursive: true, force: true });
  mkdirSync(releaseOutput, { recursive: true });

  for (const artifact of artifacts) {
    copyFileSync(artifact, join(releaseOutput, basename(artifact)));
  }

  console.log(`Copied ${artifacts.length} release artifacts to ${releaseOutput}.`);
} finally {
  rmSync(temporaryOutput, { recursive: true, force: true });
}
