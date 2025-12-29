import fs from 'node:fs';
import path from 'node:path';
import { AgentConfig, agentConfigSchema, SCOPE_PRESETS } from './schema.js';

export function resolveConfigPath(repoPath: string, configPath?: string): string {
  if (configPath) {
    return path.resolve(configPath);
  }
  // Default: look for config in .agent/ directory
  return path.resolve(repoPath, '.agent', 'agent.config.json');
}

/**
 * Expand scope presets into allowlist patterns.
 * Unknown presets are warned but not fatal.
 */
function expandPresets(config: AgentConfig): AgentConfig {
  const presets = config.scope.presets ?? [];
  if (presets.length === 0) {
    return config;
  }

  const expandedPatterns: string[] = [];
  const unknownPresets: string[] = [];

  for (const preset of presets) {
    const patterns = SCOPE_PRESETS[preset];
    if (patterns) {
      expandedPatterns.push(...patterns);
    } else {
      unknownPresets.push(preset);
    }
  }

  if (unknownPresets.length > 0) {
    console.warn(`[config] Unknown scope presets (ignored): ${unknownPresets.join(', ')}`);
    console.warn(`[config] Valid presets: ${Object.keys(SCOPE_PRESETS).join(', ')}`);
  }

  // Merge expanded patterns with existing allowlist (deduplicated)
  const mergedAllowlist = [...new Set([...config.scope.allowlist, ...expandedPatterns])];

  return {
    ...config,
    scope: {
      ...config.scope,
      allowlist: mergedAllowlist
    }
  };
}

export function loadConfig(configPath: string): AgentConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Config not found: ${configPath}`);
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw) as unknown;
  const config = agentConfigSchema.parse(parsed);

  // Expand presets into allowlist
  return expandPresets(config);
}
