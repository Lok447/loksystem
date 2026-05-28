import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

type HermesBundledManifest = {
  version?: string;
  generatedAt?: string;
};

function getBundledManifestPath(): string | null {
  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath;
  if (!resourcesPath) return null;
  const runtimeKey = `${process.platform}-${process.arch}`;
  return join(resourcesPath, 'bundled-hermes', runtimeKey, 'manifest.json');
}

export function readBundledHermesVersion(): string | null {
  const manifestPath = getBundledManifestPath();
  if (!manifestPath || !existsSync(manifestPath)) return null;

  try {
    const raw = readFileSync(manifestPath, 'utf-8');
    const parsed = JSON.parse(raw) as HermesBundledManifest;
    return typeof parsed.version === 'string' && parsed.version.trim().length > 0 ? parsed.version.trim() : null;
  } catch {
    return null;
  }
}
