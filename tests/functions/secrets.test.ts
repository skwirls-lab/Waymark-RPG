import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetSecrets, readSecret } from '../../functions/src/secrets';

const json = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;
const b64 = (text: string) => Buffer.from(text).toString('base64');

/** A stand-in for Google's two services: the machine's identity, and Secret Manager. */
function google(secret: string | null) {
  return vi.fn(async (url: string | URL | Request) => {
    if (String(url).includes('metadata.google.internal')) return json({ access_token: 'tok' });
    return secret === null ? json({}, false) : json({ payload: { data: b64(secret) } });
  }) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

beforeEach(forgetSecrets);

describe('reading a key from Secret Manager', () => {
  it('returns the stored key, without a stray newline from pasting', async () => {
    const get = google('sk-test-123\n');
    expect(await readSecret('OPENROUTER_API_KEY', 0, get, 'waymark-rpg')).toBe('sk-test-123');
    expect(String(get.mock.calls[1]![0])).toBe(
      'https://secretmanager.googleapis.com/v1/projects/waymark-rpg/secrets/OPENROUTER_API_KEY/versions/latest:access',
    );
    expect(get.mock.calls[1]![1].headers.Authorization).toBe('Bearer tok');
  });

  it('a key that does not exist yet is simply absent', async () => {
    expect(await readSecret('STRIPE_SECRET_KEY', 0, google(null), 'waymark-rpg')).toBeNull();
    expect(await readSecret('EMPTY', 0, google('  '), 'waymark-rpg')).toBeNull();
  });

  it('never throws, whatever goes wrong', async () => {
    const broken = vi.fn(async () => {
      throw new Error('no network');
    }) as unknown as typeof fetch;
    expect(await readSecret('A', 0, broken, 'waymark-rpg')).toBeNull();
    const noIdentity = vi.fn(async () => json({}, false)) as unknown as typeof fetch;
    expect(await readSecret('B', 0, noIdentity, 'waymark-rpg')).toBeNull();
    expect(await readSecret('C', 0, google('x'), '')).toBeNull();
  });

  it('remembers a found key for ten minutes', async () => {
    const get = google('k1');
    await readSecret('A', 0, get, 'p');
    await readSecret('A', 9 * 60_000, get, 'p');
    expect(get).toHaveBeenCalledTimes(2);
    await readSecret('A', 11 * 60_000, get, 'p');
    expect(get).toHaveBeenCalledTimes(4);
  });

  it('looks again after a minute for a key that was missing, so a new key switches the feature on', async () => {
    expect(await readSecret('A', 0, google(null), 'p')).toBeNull();
    expect(await readSecret('A', 30_000, google('now-here'), 'p')).toBeNull();
    expect(await readSecret('A', 61_000, google('now-here'), 'p')).toBe('now-here');
  });
});
