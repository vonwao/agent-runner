import picomatch from 'picomatch';
import { RiskLevel, VerificationPolicy, VerificationTier } from '../types/schemas.js';

export interface VerificationContext {
  changed_files: string[];
  risk_level: RiskLevel;
  is_milestone_end: boolean;
  is_run_end: boolean;
}

export function selectTiers(
  policy: VerificationPolicy,
  context: VerificationContext
): VerificationTier[] {
  const tiers = new Set<VerificationTier>();
  tiers.add('tier0');

  const triggered = triggerTiers(policy, context.changed_files);
  if (triggered.some((tier) => tier !== 'tier0')) {
    tiers.add('tier1');
  }

  if (context.is_milestone_end || context.risk_level === 'high') {
    tiers.add('tier1');
  }

  if (context.is_run_end) {
    tiers.add('tier2');
  }

  const ordered: VerificationTier[] = ['tier0', 'tier1', 'tier2'];
  return ordered.filter((tier) => tiers.has(tier));
}

export function triggerTiers(
  policy: VerificationPolicy,
  changedFiles: string[]
): VerificationTier[] {
  const tiers = new Set<VerificationTier>();
  if (!policy.risk_triggers.length) {
    return [];
  }

  const files = changedFiles.map((file) => file.replace(/\\/g, '/'));
  for (const trigger of policy.risk_triggers) {
    const matcher = picomatch(trigger.patterns);
    if (files.some((file) => matcher(file))) {
      const tier = trigger.tier === 'tier2' ? 'tier1' : trigger.tier;
      tiers.add(tier);
    }
  }
  return Array.from(tiers);
}

export function commandsForTier(
  policy: VerificationPolicy,
  tier: VerificationTier
): string[] {
  if (tier === 'tier0') {
    return policy.tier0;
  }
  if (tier === 'tier1') {
    return policy.tier1;
  }
  return policy.tier2;
}
