/**
 * Prepare Hermes runtime for Electron packaging.
 *
 * Unlike aionrs, Hermes is currently distributed as a Python virtualenv-based
 * runtime instead of a single self-contained native binary. For packaged app
 * usage we therefore bundle the whole runtime directory that contains:
 *   - pyvenv.cfg
 *   - Scripts/hermes.exe (Windows) or bin/hermes (Unix)
 *   - site-packages / runtime dependencies
 *
 * Resolution order:
 *  1. HERMES_RUNTIME_DIR (explicit runtime root)
 *  2. Infer runtime root from HERMES_CLI_PATH
 *  3. Infer runtime root from PATH-resolved hermes executable
 *  4. Historical local venv location
 *
 * Output: resources/bundled-hermes/{platform}-{arch}/...
 */

const { execFileSync, execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function removeDirectorySafe(dirPath) {
  fs.rmSync(dirPath, { recursive: true, force: true });
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2) + '\n', 'utf-8');
}

function commandExists(command) {
  const checker = process.platform === 'win32' ? 'where' : 'which';
  try {
    execFileSync(checker, [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getBinaryName(platform) {
  return platform === 'win32' ? 'hermes.exe' : 'hermes';
}

function getRuntimeBinRelativePath(platform) {
  return platform === 'win32' ? path.join('Scripts', 'hermes.exe') : path.join('bin', 'hermes');
}

function copyDirectorySafe(sourceDir, targetDir) {
  ensureDirectory(path.dirname(targetDir));
  fs.cpSync(sourceDir, targetDir, { recursive: true, force: true });
}

function ensureExecutableModeRecursive(rootDir) {
  if (process.platform === 'win32' || !fs.existsSync(rootDir)) return;
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      ensureExecutableModeRecursive(fullPath);
      continue;
    }
    if (entry.isFile()) {
      try {
        fs.chmodSync(fullPath, 0o755);
      } catch {}
    }
  }
}

function resolvePathBinary() {
  try {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const output = execSync(`${cmd} hermes`, { encoding: 'utf-8', timeout: 5000 }).trim();
    const firstLine = output.split(/\r?\n/).find(Boolean);
    return firstLine && fs.existsSync(firstLine) ? firstLine : null;
  } catch {
    return null;
  }
}

function inferRuntimeRootFromBinary(binaryPath) {
  if (!binaryPath || !fs.existsSync(binaryPath)) return null;

  const binDir = path.dirname(binaryPath);
  const candidates = [
    path.resolve(binDir, '..'),
    path.resolve(binDir, '..', '..'),
  ];

  for (const candidate of candidates) {
    const pyvenv = path.join(candidate, 'pyvenv.cfg');
    const runtimeBinary = path.join(candidate, getRuntimeBinRelativePath(process.platform));
    if (fs.existsSync(pyvenv) && fs.existsSync(runtimeBinary)) {
      return candidate;
    }
  }

  return null;
}

function resolveHistoricalRuntimeRoot() {
  const candidate = path.join(os.homedir(), 'hermes-agent-main', '.venv');
  const pyvenv = path.join(candidate, 'pyvenv.cfg');
  const runtimeBinary = path.join(candidate, getRuntimeBinRelativePath(process.platform));
  if (fs.existsSync(pyvenv) && fs.existsSync(runtimeBinary)) {
    return candidate;
  }
  return null;
}

function resolveHermesRuntimeRoot() {
  const explicitRuntimeDir = process.env.HERMES_RUNTIME_DIR;
  if (explicitRuntimeDir) {
    const runtimeBinary = path.join(explicitRuntimeDir, getRuntimeBinRelativePath(process.platform));
    const pyvenv = path.join(explicitRuntimeDir, 'pyvenv.cfg');
    if (fs.existsSync(runtimeBinary) && fs.existsSync(pyvenv)) {
      return { root: explicitRuntimeDir, sourceType: 'runtime_dir', source: { path: explicitRuntimeDir } };
    }
  }

  const explicitBinary = process.env.HERMES_CLI_PATH;
  const fromExplicitBinary = inferRuntimeRootFromBinary(explicitBinary);
  if (fromExplicitBinary) {
    return { root: fromExplicitBinary, sourceType: 'cli_path', source: { path: explicitBinary } };
  }

  const pathBinary = resolvePathBinary();
  const fromPathBinary = inferRuntimeRootFromBinary(pathBinary);
  if (fromPathBinary) {
    return { root: fromPathBinary, sourceType: 'path', source: { path: pathBinary } };
  }

  const historical = resolveHistoricalRuntimeRoot();
  if (historical) {
    return { root: historical, sourceType: 'legacy_local', source: { path: historical } };
  }

  return null;
}

function prepareHermes() {
  const projectRoot = path.resolve(__dirname, '..');
  const platform = process.platform;
  const arch = process.env.HERMES_ARCH || process.env.npm_config_target_arch || process.arch;
  const runtimeKey = `${platform}-${arch}`;
  const targetDir = path.join(projectRoot, 'resources', 'bundled-hermes', runtimeKey);
  const runtimeRelativeBinary = getRuntimeBinRelativePath(platform);

  console.log(`Preparing Hermes runtime for ${runtimeKey}`);

  removeDirectorySafe(targetDir);
  ensureDirectory(targetDir);

  const resolved = resolveHermesRuntimeRoot();
  if (!resolved) {
    writeJson(path.join(targetDir, 'manifest.json'), {
      platform,
      arch,
      generatedAt: new Date().toISOString(),
      sourceType: 'none',
      source: {},
      files: [],
      skipped: true,
      reason: 'hermes runtime root not found',
    });
    console.warn('  Hermes runtime not found - skipping bundled Hermes');
    return { prepared: false, reason: 'not_found' };
  }

  copyDirectorySafe(resolved.root, targetDir);
  ensureExecutableModeRecursive(targetDir);

  const bundledBinary = path.join(targetDir, runtimeRelativeBinary);
  let version = 'unknown';
  try {
    if (fs.existsSync(bundledBinary)) {
      version = execSync(`"${bundledBinary}" --version`, { encoding: 'utf-8', timeout: 8000 }).trim() || version;
    }
  } catch {}

  writeJson(path.join(targetDir, 'manifest.json'), {
    platform,
    arch,
    version,
    generatedAt: new Date().toISOString(),
    sourceType: resolved.sourceType,
    source: resolved.source,
    files: [runtimeRelativeBinary.replace(/\\/g, '/')],
    skipped: false,
  });

  console.log(`  Bundled Hermes prepared: resources/bundled-hermes/${runtimeKey}/${runtimeRelativeBinary}`);
  return { prepared: true, dir: targetDir, sourceType: resolved.sourceType };
}

if (require.main === module) {
  prepareHermes();
}

module.exports = prepareHermes;
