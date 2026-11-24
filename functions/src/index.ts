import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import * as campaigns from './campaigns';

initializeApp();
const db = getFirestore();

/** Every callable needs a signed-in caller, guest or account holder. */
function uidOf(request: CallableRequest): string {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  return request.auth.uid;
}

const options = { region: 'us-central1', maxInstances: 5 } as const;

export const createCampaign = onCall(options, (request) =>
  campaigns.createCampaign(db, uidOf(request), request.data ?? {}),
);
export const joinCampaign = onCall(options, (request) =>
  campaigns.joinCampaign(db, uidOf(request), request.data ?? {}),
);
export const leaveCampaign = onCall(options, (request) =>
  campaigns.leaveCampaign(db, uidOf(request), request.data ?? {}),
);
export const removeMember = onCall(options, (request) =>
  campaigns.removeMember(db, uidOf(request), request.data ?? {}),
);
export const deleteCampaign = onCall(options, (request) =>
  campaigns.deleteCampaign(db, uidOf(request), request.data ?? {}),
);
export const createHandover = onCall(options, (request) =>
  campaigns.createHandover(db, uidOf(request), request.data ?? {}),
);
export const redeemHandover = onCall(options, (request) =>
  campaigns.redeemHandover(db, uidOf(request), request.data ?? {}),
);

export const onCharacterWritten = onDocumentWritten(
  { ...options, document: 'characters/{characterId}' },
  (event) =>
    campaigns.syncOwnedSummary(db, event.params.characterId, event.data?.before.data()?.campaignId),
);

export const onWardenCharacterWritten = onDocumentWritten(
  { ...options, document: 'campaigns/{campaignId}/characters/{characterId}' },
  (event) => campaigns.syncWardenSummary(db, event.params.campaignId, event.params.characterId),
);
