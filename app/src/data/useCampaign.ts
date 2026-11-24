import { useEffect, useState } from 'react';
import {
  watchCampaign,
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
