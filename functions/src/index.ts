import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { defineSecret } from 'firebase-functions/params';
import { HttpsError, onCall, onRequest, type CallableRequest } from 'firebase-functions/v2/https';
import * as ai from './ai';
import * as billing from './billing';
import * as campaigns from './campaigns';
import { AI_LIVE, AI_MODEL, PAYMENTS_LIVE } from './config';

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

// ---- Plans and payments ------------------------------------------------------

// The secrets are only named once payments are connected, so that a deploy
// never depends on secrets that do not exist yet.
const secrets = PAYMENTS_LIVE
  ? { key: defineSecret('STRIPE_SECRET_KEY'), webhook: defineSecret('STRIPE_WEBHOOK_SECRET') }
  : null;
const paying = secrets ? { ...options, secrets: [secrets.key] } : options;
const stripe = () => (secrets ? billing.stripeCaller(secrets.key.value()) : null);

/** Paying needs an account that can be signed in to again: not a guest. */
function accountOf(request: CallableRequest): string {
  const uid = uidOf(request);
  if (request.auth?.token.firebase?.sign_in_provider === 'anonymous') {
    throw new HttpsError(
      'failed-precondition',
      'Create an account first. A guest cannot hold a paid plan.',
    );
  }
  return uid;
}

export const createCheckout = onCall(paying, (request) =>
  billing.createCheckout(db, accountOf(request), request.data ?? {}, stripe()),
);
export const createPortal = onCall(paying, (request) =>
  billing.createPortal(db, accountOf(request), request.data ?? {}, stripe()),
);
export const exportMyData = onCall(options, (request) => billing.exportAccount(db, uidOf(request)));
export const deleteMyAccount = onCall(paying, (request) =>
  billing.deleteAccount(db, uidOf(request), {
    stripe: stripe(),
    deleteSignIn: (uid) => getAuth().deleteUser(uid),
  }),
);

/** Where the payment provider tells us what happened. Deployed only once payments are connected. */
export const stripeWebhook = secrets
  ? onRequest({ ...options, secrets: [secrets.webhook] }, async (request, response) => {
      const body = request.rawBody.toString('utf8');
      const signed = billing.verifyStripeSignature(
        body,
        request.header('stripe-signature'),
        secrets.webhook.value(),
        Date.now() / 1000,
      );
      if (!signed) {
        response.status(400).send('Bad signature');
        return;
      }
      const event = billing.fromStripe(JSON.parse(body));
      response.status(200).send(event ? await billing.recordBillingEvent(db, event) : 'ignored');
    })
  : undefined;

// ---- AI help -------------------------------------------------------------------

const aiKey = AI_LIVE ? defineSecret('OPENROUTER_API_KEY') : null;
/** The real model when connected; fixed replies in the local emulator; otherwise none. */
const model = (): ai.ModelCall | null =>
  aiKey
    ? ai.openRouterCaller(aiKey.value(), AI_MODEL)
    : process.env.FUNCTIONS_EMULATOR === 'true'
      ? ai.fixtureModel
      : null;

export const aiHelp = onCall(
  aiKey ? { ...options, secrets: [aiKey], timeoutSeconds: 60 } : options,
  (request) => ai.aiHelp(db, uidOf(request), request.data ?? {}, model()),
);
