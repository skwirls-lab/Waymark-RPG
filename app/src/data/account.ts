import {
  FREE,
  isActive,
  limitsOf,
  planOf,
  type BillingPeriod,
  type Entitlement,
  type Plan,
  type PlanLimits,
} from '@waymark/rules';
import { useEffect, useState } from 'react';
import { getDb } from '../firebase';
import { call, watchDoc } from './campaigns';

/** What the owner chose to keep in use after a paid plan ended. */
export interface Keep {
  keepCharacters: string[];
  keepCampaigns: string[];
}

export interface Account {
  /** `undefined` while loading. */
  entitlement: Entitlement | undefined;
  plan: Plan;
  limits: PlanLimits;
  keep: Keep;
  /** Whether one of the account's own characters can be changed, or is read-only. */
  characterInUse: (id: string, slot: number) => boolean;
  /** Whether a campaign the account runs can be changed, or is read-only. */
  campaignInUse: (id: string) => boolean;
}

const NO_KEEP: Keep = { keepCharacters: [], keepCampaigns: [] };

/** The slot number at the end of an id such as `uid_3`. */
export const slotOf = (id: string): number => Number(id.slice(id.lastIndexOf('_') + 1)) || 1;

/** The signed-in account's plan, its limits, and what is in use under them. */
export function useAccount(uid: string): Account {
  const [entitlement, setEntitlement] = useState<Entitlement>();
  const [keep, setKeep] = useState<Keep>(NO_KEEP);
  useEffect(
    () => watchDoc<Entitlement>(`entitlements/${uid}`, (found) => setEntitlement(found ?? FREE)),
    [uid],
  );
  useEffect(
    () => watchDoc<Partial<Keep>>(`users/${uid}`, (found) => setKeep({ ...NO_KEEP, ...found })),
    [uid],
  );
  const limits = limitsOf(entitlement);
  return {
    entitlement,
    plan: planOf(entitlement),
    limits,
    keep,
    characterInUse: (id, slot) => isActive(id, slot, limits.characters, keep.keepCharacters),
    campaignInUse: (id) => isActive(id, slotOf(id), limits.campaigns, keep.keepCampaigns),
  };
}

export async function saveKeep(uid: string, keep: Partial<Keep>): Promise<void> {
  const [db, fs] = await Promise.all([getDb(), import('firebase/firestore')]);
  await fs.setDoc(fs.doc(db, 'users', uid), keep, { merge: true });
}

const origin = () => window.location.origin;

/** The address of the payment page for a new subscription. */
export const startCheckout = (period: BillingPeriod) =>
  call<{ url: string }>('createCheckout', { period, origin: origin() });
/** The address of the page for changing a card or cancelling. */
export const openPortal = () => call<{ url: string }>('createPortal', { origin: origin() });
export const exportMyData = () => call<Record<string, unknown>>('exportMyData', {});
export const deleteMyAccount = () => call<void>('deleteMyAccount', {});

/**
 * A standing choice of what to keep blocks making anything new. Once the
 * account is back within its limit the choice has done its job, so it is
 * cleared.
 */
export function useTidyKeep(uid: string, account: Account, characters: number | undefined): void {
  const stale =
    characters !== undefined &&
    account.entitlement !== undefined &&
    account.keep.keepCharacters.length > 0 &&
    characters <= account.limits.characters;
  useEffect(() => {
    if (stale) void saveKeep(uid, { keepCharacters: [] }).catch(() => {});
  }, [stale, uid]);
}
