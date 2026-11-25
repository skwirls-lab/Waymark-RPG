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

/**
 * The most AI requests the whole app will make in one day (UTC). A backstop
 * against a runaway bill if accounts are made in bulk to use the free
 * allowance. At the chosen model's price this is about $2 a day.
 */
export const AI_DAILY_CAP = 5000;

/** The model AI help uses, as OpenRouter names it. Chosen by the evaluation in the build log. */
export const AI_MODEL = 'anthropic/claude-haiku-5.5';
