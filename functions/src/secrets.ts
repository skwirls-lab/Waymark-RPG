/**
 * Keys are read from Secret Manager when they are needed, not bound at
 * deploy time. So a feature switches itself on as soon as its key is stored,
 * with no new deploy, and a missing key can never make a deploy fail. Until
 * then the feature says plainly that it is not open yet.
 */

type Fetch = typeof fetch;

interface Cached {
  value: string | null;
  until: number;
}
const cache = new Map<string, Cached>();
/** A found key is kept for ten minutes; a missing one is looked for again after one. */
const FOUND_MS = 10 * 60 * 1000;
const MISSING_MS = 60 * 1000;

/** The secret's latest value, or `null` if it does not exist or cannot be read. Never throws. */
export async function readSecret(
  name: string,
  now: number = Date.now(),
  get: Fetch = fetch,
  project: string | undefined = process.env.GCLOUD_PROJECT,
): Promise<string | null> {
  const known = cache.get(name);
  if (known && known.until > now) return known.value;
  let value: string | null = null;
  try {
    // The function's own identity, from the machine it runs on. No key file anywhere.
    const token = await get(
      'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
      { headers: { 'Metadata-Flavor': 'Google' } },
    );
    const access = token.ok
      ? ((await token.json()) as { access_token?: string }).access_token
      : null;
    if (access && project) {
      const found = await get(
        `https://secretmanager.googleapis.com/v1/projects/${project}/secrets/${name}/versions/latest:access`,
        { headers: { Authorization: `Bearer ${access}` } },
      );
      if (found.ok) {
        const data = ((await found.json()) as { payload?: { data?: string } }).payload?.data;
        value = data ? Buffer.from(data, 'base64').toString('utf8').trim() || null : null;
      }
    }
  } catch {
    value = null;
  }
  cache.set(name, { value, until: now + (value ? FOUND_MS : MISSING_MS) });
  return value;
}

/** For tests. */
export const forgetSecrets = (): void => cache.clear();
