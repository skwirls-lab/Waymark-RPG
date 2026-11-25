import { useEffect, useState } from 'react';
import type { CharacterDoc } from './characters';
import {
  markPresent,
  watchCampaign,
  watchCampaignCharacters,
  watchLog,
  watchPresence,
  watchRequests,
  type CampaignRequest,
  type LogEntry,
  type Presence,
  watchMembers,
  watchMemberships,
  watchSummaries,
  watchWardenCharacters,
  type Campaign,
  type Member,
  type Membership,
  type Summary,
  type WardenCharacter,
} from './campaigns';

export function useMemberships(uid: string): Membership[] | undefined {
  const [memberships, setMemberships] = useState<Membership[]>();
  useEffect(() => watchMemberships(uid, setMemberships), [uid]);
  return memberships;
}

export interface CampaignView {
  /** `undefined` while loading; `null` if it is gone or you are not in it. */
  campaign: Campaign | null | undefined;
  /** `undefined` until the member list has arrived. */
  members: Member[] | undefined;
  summaries: Summary[];
  /** Filled only for the Warden. */
  wardenCharacters: WardenCharacter[];
  isWarden: boolean;
}

/** Everything one person may see of a campaign, kept up to date. */
export function useCampaign(campaignId: string, uid: string): CampaignView {
  const [campaign, setCampaign] = useState<Campaign | null>();
  const [members, setMembers] = useState<Member[]>();
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [wardenCharacters, setWardenCharacters] = useState<WardenCharacter[]>([]);
  const isWarden = campaign?.wardenUid === uid;

  useEffect(() => {
    const stops = [
      watchCampaign(campaignId, setCampaign),
      watchMembers(campaignId, setMembers),
      watchSummaries(campaignId, setSummaries),
    ];
    return () => stops.forEach((stop) => stop());
  }, [campaignId]);

  useEffect(() => {
    if (!isWarden) {
      setWardenCharacters([]);
      return;
    }
    return watchWardenCharacters(campaignId, (items) =>
      setWardenCharacters(items.sort((a, b) => a.id.localeCompare(b.id))),
    );
  }, [campaignId, isWarden]);

  return { campaign, members, summaries, wardenCharacters, isWarden };
}

/** For the Warden: every player's full sheet in the campaign. Empty for anyone else. */
export function useCampaignCharacters(campaignId: string, enabled: boolean): CharacterDoc[] {
  const [characters, setCharacters] = useState<CharacterDoc[]>([]);
  useEffect(() => {
    if (!enabled) {
      setCharacters([]);
      return;
    }
    return watchCampaignCharacters(campaignId, setCharacters);
  }, [campaignId, enabled]);
  return characters;
}

/** Requests in a campaign: all of them for the Warden, or those addressed to one player. */
export function useRequests(
  campaignId: string | null | undefined,
  toUid: string | null,
): CampaignRequest[] {
  const [requests, setRequests] = useState<CampaignRequest[]>([]);
  useEffect(() => {
    if (!campaignId) {
      setRequests([]);
      return;
    }
    return watchRequests(campaignId, toUid, setRequests);
  }, [campaignId, toUid]);
  return requests;
}

export function useLog(campaignId: string): LogEntry[] {
  const [log, setLog] = useState<LogEntry[]>([]);
  useEffect(() => watchLog(campaignId, setLog), [campaignId]);
  return log;
}

/** How long after a sign of life someone still counts as here. */
export const PRESENT_FOR_MS = 75_000;

/** Says "I am here" every half minute, and reports who else is. */
export function usePresence(
  campaignId: string | null | undefined,
  uid: string,
  displayName: string,
): Set<string> {
  const [present, setPresent] = useState<Presence[]>([]);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!campaignId) return;
    void markPresent(campaignId, uid, displayName);
    const beat = setInterval(() => {
      void markPresent(campaignId, uid, displayName);
      setNow(Date.now());
    }, 30_000);
    const stop = watchPresence(campaignId, (items) => {
      setPresent(items);
      setNow(Date.now());
    });
    return () => {
      clearInterval(beat);
      stop();
    };
  }, [campaignId, uid, displayName]);
  return new Set(present.filter((p) => now - p.at < PRESENT_FOR_MS).map((p) => p.uid));
}
