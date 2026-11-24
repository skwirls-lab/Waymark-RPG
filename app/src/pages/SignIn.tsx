import { useAuth } from '../auth';
import { Logo } from '../Logo';

export function SignIn() {
  const { signInWithGoogle, signInAsGuest, error } = useAuth();
  return (
    <main className="screen center">
      <Logo size={96} />
      <h1>Waymark</h1>
      <p className="lede">Character sheets and campaigns for your table.</p>
      <div className="stack">
        <button className="button primary" onClick={signInWithGoogle}>
          Continue with Google
        </button>
        <button className="button" onClick={signInAsGuest}>
          Continue as a guest
        </button>
      </div>
      <p className="fineprint">
        Guests need no account and give no personal details. You can create an account later and
        keep everything.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <p className="fineprint">
        New to the game? <a href="https://waymark-rpg.web.app/">Read the rules</a>
      </p>
    </main>
  );
}
