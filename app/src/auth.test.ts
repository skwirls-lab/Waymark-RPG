import { explainSignInFailure } from './auth';

describe('explaining a failed sign-in', () => {
  it('says when a sign-in method is not switched on, and keeps the code', () => {
    expect(explainSignInFailure('auth/operation-not-allowed')).toBe(
      'This way of signing in is not switched on for Waymark yet. (auth/operation-not-allowed)',
    );
    expect(explainSignInFailure('auth/admin-restricted-operation')).toMatch(/not switched on/);
  });

  it('names an unapproved address and a lost connection', () => {
    expect(explainSignInFailure('auth/unauthorized-domain')).toMatch(/not approved/);
    expect(explainSignInFailure('auth/network-request-failed')).toMatch(/connection/);
  });

  it('falls back to a general message, with the code when there is one', () => {
    expect(explainSignInFailure('auth/something-new')).toBe(
      'Sign-in did not work. Please try again. (auth/something-new)',
    );
    expect(explainSignInFailure('')).toBe('Sign-in did not work. Please try again.');
  });
});
