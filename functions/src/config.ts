/**
 * Whether the payment provider is connected. While this is false, nobody can
 * be charged: the app says paid plans are not open yet, and the webhook is
 * not deployed. Turning it on requires the two secrets named in index.ts to
 * exist in Secret Manager first, or the deploy fails.
 */
export const PAYMENTS_LIVE = false;

/**
 * Whether AI help is connected. While this is false the buttons say that AI
 * help is not switched on yet. Turning it on requires `OPENROUTER_API_KEY`
 * to exist in Secret Manager first, or the deploy fails.
 */
export const AI_LIVE = false;

/** The model AI help uses, as OpenRouter names it. Chosen by the evaluation in the build log. */
export const AI_MODEL = 'anthropic/claude-haiku-5.5';
