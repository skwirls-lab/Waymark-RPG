/** Settings that are not secret. Keys live in Secret Manager; see secrets.ts. */

/**
 * The most AI requests the whole app will make in one day (UTC). A backstop
 * against a runaway bill if accounts are made in bulk to use the free
 * allowance. At the chosen model's price this is about $2 a day.
 */
export const AI_DAILY_CAP = 5000;

/** The model AI help uses, as OpenRouter names it. Chosen by the evaluation in the build log. */
export const AI_MODEL = 'anthropic/claude-haiku-5.5';
