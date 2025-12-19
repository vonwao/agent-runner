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
  status: z.enum(['approve', 'request_changes']),
  changes: z.array(z.string()).default([])
});

export const implementerOutputSchema = z.object({
  status: z.enum(['ok', 'blocked', 'failed']),
  handoff_memo: z.string().min(1),
  commands_run: z.array(z.string()).default([]),
  observations: z.array(z.string()).default([])
});

export type PlanOutput = z.infer<typeof planOutputSchema>;
export type ReviewOutput = z.infer<typeof reviewOutputSchema>;
export type ImplementerOutput = z.infer<typeof implementerOutputSchema>;
