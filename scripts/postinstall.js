/**
 * Postinstall script for LokSystem
 * Handles native module installation for different environments
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function quoteShellArg(value) {
  const stringValue = String(value);
  if (process.platform === 'win32') {
    if (!/[\s"]/u.test(stringValue)) return stringValue;
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  if (!/[\s'"\\$`]/u.test(stringValue)) return stringValue;
  return `'${stringValue.replace(/'/g, `'\\''`)}'`;
}

function commandExists(command) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  return spawnSync(checker, [command], { stdio: 'ignore' }).status === 0;
}

function getLocalToolPath(tool) {
  const binDir = path.resolve(__dirname, '..', 'node_modules', '.bin');
  const candidates = process.platform === 'win32' ? [`${tool}.cmd`, `${tool}.exe`, tool] : [tool];

  for (const candidate of candidates) {
    const fullPath = path.join(binDir, candidate);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }

  return null;
}

function buildPackageToolCommand(tool, args = []) {
  const localToolPath = getLocalToolPath(tool);
  if (localToolPath) {
    return [quoteShellArg(localToolPath), ...args.map(quoteShellArg)].join(' ');
  }
  if (commandExists('bunx')) {
    return ['bunx', tool, ...args].map(quoteShellArg).join(' ');
  }
  if (commandExists('npx')) {
    return ['npx', '--yes', tool, ...args].map(quoteShellArg).join(' ');
  }
  if (commandExists('npm')) {
    return ['npm', 'exec', '--yes', tool, '--', ...args].map(quoteShellArg).join(' ');
  }
  throw new Error(`Unable to find a runner for "${tool}".`);
}

// Note: web-tree-sitter is now a direct dependency in package.json
// No need for symlinks or copying - npm will install it directly to node_modules

function runPostInstall() {
  try {
    // Check if we're in a CI environment
    const isCI = process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true';
    const electronVersion = require('../package.json').devDependencies.electron.replace(/^[~^]/, '');

    console.log(`Environment: CI=${isCI}, Electron=${electronVersion}`);

    if (isCI) {
      // In CI, skip rebuilding to use prebuilt binaries for better compatibility
      // 在 CI 中跳过重建，使用预编译的二进制文件以获得更好的兼容性
      console.log('CI environment detected, skipping rebuild to use prebuilt binaries');
      console.log('Native modules will be handled by electron-forge during packaging');
    } else {
      // In local environment, use electron-builder to install dependencies
      console.log('Local environment, installing app deps');
      execSync(buildPackageToolCommand('electron-builder', ['install-app-deps']), {
        stdio: 'inherit',
        shell: true,
        env: {
          ...process.env,
          npm_config_build_from_source: 'true',
        },
      });
    }
  } catch (e) {
    console.error('Postinstall failed:', e.message);
    // Don't exit with error code to avoid breaking installation
  }
}

// Only run if this script is executed directly
if (require.main === module) {
  runPostInstall();
}

module.exports = runPostInstall;
