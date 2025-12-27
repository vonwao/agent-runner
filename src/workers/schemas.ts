import { z } from 'zod';

export const milestoneSchema = z.object({
  goal: z.string().min(1),
  files_expected: z.array(z.string()).optional(),
  done_checks: z.array(z.string()).min(1),
  risk_level: z.enum(['low', 'medium', 'high'])
});

export const planOutputSchema = z.object({
  milestones: z.array(milestoneSchema).min(1),
  risk_map: z.array(z.string()).optional(),
  do_not_touch: z.array(z.string()).optional()
});

export const reviewOutputSchema = z.object({
  status: z.enum(['approve', 'request_changes', 'reject']),
  changes: z
    .array(z.union([z.string(), z.object({}).passthrough()]))
    .default([])
    .transform((arr) =>
      arr.map((item) => (typeof item === 'string' ? item : JSON.stringify(item)))
    )
});

/**
 * Evidence required when implementer claims "no_changes_needed".
 * At least one of files_checked, grep_output, or commands_run must be populated.
 */
export const noChangesEvidenceSchema = z.object({
  files_checked: z.array(z.string()).optional(),
  grep_output: z.string().max(8192).optional(),
  reason: z.string().optional(),
  commands_run: z.array(z.object({
    command: z.string(),
    exit_code: z.number()
  })).optional()
});

export const implementerOutputSchema = z.object({
  status: z.enum(['ok', 'blocked', 'failed', 'no_changes_needed']),
  handoff_memo: z.string().min(1),
  commands_run: z.array(z.string()).default([]),
  observations: z.array(z.string()).default([]),
  evidence: noChangesEvidenceSchema.optional()
});

export type PlanOutput = z.infer<typeof planOutputSchema>;
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;
export type ImplementerOutput = z.infer<typeof implementerOutputSchema>;
export type NoChangesEvidence = z.infer<typeof noChangesEvidenceSchema>;
