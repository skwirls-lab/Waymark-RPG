import { useEffect, useState } from 'react';
import { call, watchCollection, watchDoc } from './campaigns';

/** One line of an AI-run campaign's story. */
export interface Turn {
  id: string;
  at: number;
  order: number;
  kind: 'player' | 'narration' | 'result';
  who: string;
  uid?: string;
  text: string;
}

/** A roll the game is waiting on a player for. */
export interface PendingRoll {
  kind: 'save' | 'strength-save' | 'damage';
  characterId: string;
  sides: 4 | 6 | 8 | 10 | 12 | 20;
  label: string;
}

export interface PlayState {
  pending: PendingRoll | null;
  suggestions: string[];
}
const IDLE: PlayState = { pending: null, suggestions: [] };

/** The story so far, oldest first. */
export function useTurns(campaignId: string): Turn[] {
  const [turns, setTurns] = useState<Turn[]>([]);
  useEffect(
    () =>
      watchCollection<Turn>(
        `campaigns/${campaignId}/turns`,
        (id, d) => ({ ...(d as Omit<Turn, 'id'>), id }),
        (items) => setTurns(items.sort((a, b) => a.at - b.at || a.order - b.order)),
        (fs) => [fs.orderBy('at', 'desc'), fs.limit(80)],
      ),
    [campaignId],
  );
  return turns;
}

export function usePlayState(campaignId: string): PlayState {
  const [state, setState] = useState<PlayState>(IDLE);
  useEffect(
    () =>
      watchDoc<Partial<PlayState>>(`campaigns/${campaignId}/shared/play`, (found) =>
        setState({ ...IDLE, ...found }),
      ),
    [campaignId],
  );
  return state;
}

export const sayToWarden = (campaignId: string, text: string) =>
  call<{ ok: true }>('wardenTurn', { campaignId, text });
export const rollForWarden = (campaignId: string, roll: number) =>
  call<{ ok: true }>('wardenTurn', { campaignId, roll });
export const setAiWarden = (campaignId: string, on: boolean) =>
  call<{ aiWarden: boolean }>('setAiWarden', { campaignId, on });
