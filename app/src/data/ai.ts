import type { AiAction, AiResult } from '@waymark/rules';
import { useEffect, useState } from 'react';
import { call, watchDoc } from './campaigns';

export interface AiAnswer<A extends AiAction> {
  action: A;
  proposal: AiResult<A>;
  /** Requests used this month, counting this one, and the month's allowance. */
  used: number;
  allowance: number;
}

/** A rules answer also carries where in the rulebook it came from. */
export type RulesAnswer = AiResult<'rules'> & { sectionTitle: string | null; link: string | null };

/**
 * Asks the AI for one proposal. Nothing is saved: the proposal comes back
 * for a person to check, change and accept.
 */
export const askAi = <A extends AiAction>(
  action: A,
  input: { campaignId?: string; hint?: string; question?: string },
) => call<AiAnswer<A>>('aiHelp', { action, ...input });

/** How many AI requests the account has used this calendar month. */
export function useAiUsed(uid: string): number {
  const [usage, setUsage] = useState<{ month?: string; ai?: number } | null>(null);
  useEffect(() => watchDoc<{ month?: string; ai?: number }>(`usage/${uid}`, setUsage), [uid]);
  return usage?.month === new Date().toISOString().slice(0, 7) ? (usage.ai ?? 0) : 0;
}
