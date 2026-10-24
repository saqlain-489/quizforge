import type { DimVerdict, Draft, QuizRun, Role } from '../../../src/schema';

export type { DimVerdict, Draft, Item, ItemType, Passage, QuizRun, Role } from '../../../src/schema';

export interface PlanAttempt {
  accepted: boolean;
  issues: string[];
}

export interface WriteEvent {
  kind: 'write';
  role: Role;
  rewrite: boolean;
  draft: Draft | null;
  defects: { code: string; message: string }[];
  error?: string;
}

export interface DiscardedComplaint {
  dim: string;
  score: number;
  issues: string[];
  evidence: string | null;
}

export interface JudgeEvent {
  kind: 'judge';
  role: Role;
  rewrite: boolean;
  dims: Record<string, DimVerdict>;
  blockers: string[];
  escalates: boolean;
  discarded: DiscardedComplaint[];
  error?: string;
}

export type TraceEvent = WriteEvent | JudgeEvent;

export interface DimInfo {
  name: string;
  blocking: boolean;
  threshold: number;
}

export interface DemoRun {
  name: string;
  run: QuizRun;
  plan: PlanAttempt[];
  traces: Record<string, TraceEvent[]>;
  checks: Record<string, string>;
  dims: Record<string, DimInfo>;
  models: Partial<Record<Role, string>>;
}
