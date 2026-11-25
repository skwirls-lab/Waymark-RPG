/**
 * Whether the payment provider is connected. While this is false, nobody can
 * be charged: the app says paid plans are not open yet, and the webhook is
 * not deployed. Turning it on requires the two secrets named in index.ts to
 * exist in Secret Manager first, or the deploy fails.
 */
export const PAYMENTS_LIVE = false;
