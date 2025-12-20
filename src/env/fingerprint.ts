import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execa } from 'execa';
import { AgentConfig } from '../config/schema.js';

export interface EnvFingerprint {
  node_version: string;
  package_manager: string | null;
  lockfile_hash: string | null;
  worker_versions: Record<string, string | null>;
  created_at: string;
}

export interface FingerprintDiff {
  field: string;
  original: string | null;
  current: string | null;
}

async function getNodeVersion(): Promise<string> {
  return process.version;
}

async function detectPackageManager(repoPath: string): Promise<string | null> {
  const lockFiles = [
    { file: 'pnpm-lock.yaml', pm: 'pnpm' },
    { file: 'yarn.lock', pm: 'yarn' },
    { file: 'package-lock.json', pm: 'npm' },
    { file: 'bun.lockb', pm: 'bun' }
  ];
  for (const { file, pm } of lockFiles) {
    if (fs.existsSync(path.join(repoPath, file))) {
      return pm;
    }
  }
  return null;
}

async function getLockfileHash(repoPath: string): Promise<string | null> {
  const lockFiles = [
    'pnpm-lock.yaml',
    'yarn.lock',
    'package-lock.json',
    'bun.lockb'
  ];
  for (const file of lockFiles) {
    const lockPath = path.join(repoPath, file);
    if (fs.existsSync(lockPath)) {
      const content = fs.readFileSync(lockPath);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      return hash.slice(0, 16);
    }
  }
  return null;
}

async function getWorkerVersion(bin: string): Promise<string | null> {
  try {
    const result = await execa(bin, ['--version'], {
      timeout: 5000,
      reject: false
    });
    if (result.exitCode === 0) {
      return result.stdout.trim().split('\n')[0];
    }
  } catch {
    // Worker not found
  }
  return null;
}

async function getWorkerVersions(
  config: AgentConfig
): Promise<Record<string, string | null>> {
  const versions: Record<string, string | null> = {};
  for (const [name, workerConfig] of Object.entries(config.workers)) {
    versions[name] = await getWorkerVersion(workerConfig.bin);
  }
  return versions;
}

export async function captureFingerprint(
  config: AgentConfig,
  repoPath: string
): Promise<EnvFingerprint> {
  const [nodeVersion, packageManager, lockfileHash, workerVersions] =
    await Promise.all([
      getNodeVersion(),
      detectPackageManager(repoPath),
      getLockfileHash(repoPath),
      getWorkerVersions(config)
    ]);

  return {
    node_version: nodeVersion,
    package_manager: packageManager,
    lockfile_hash: lockfileHash,
    worker_versions: workerVersions,
    created_at: new Date().toISOString()
  };
}

export function compareFingerprints(
  original: EnvFingerprint,
  current: EnvFingerprint
): FingerprintDiff[] {
  const diffs: FingerprintDiff[] = [];

  if (original.node_version !== current.node_version) {
    diffs.push({
      field: 'node_version',
      original: original.node_version,
      current: current.node_version
    });
  }

  if (original.package_manager !== current.package_manager) {
    diffs.push({
      field: 'package_manager',
      original: original.package_manager,
      current: current.package_manager
    });
  }

  if (original.lockfile_hash !== current.lockfile_hash) {
    diffs.push({
      field: 'lockfile_hash',
      original: original.lockfile_hash,
      current: current.lockfile_hash
    });
  }

  for (const workerName of Object.keys(original.worker_versions)) {
    const origVersion = original.worker_versions[workerName];
    const currVersion = current.worker_versions[workerName];
    if (origVersion !== currVersion) {
      diffs.push({
        field: `worker:${workerName}`,
        original: origVersion,
        current: currVersion
      });
    }
  }

  return diffs;
}
