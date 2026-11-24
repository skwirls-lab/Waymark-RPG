import { Suspense, lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Logo } from './Logo';
import { SignIn } from './pages/SignIn';

// Signed-in screens carry the rules library and the database code, so they
// load only once someone is signed in. The sign-in screen stays small.
const SignedIn = lazy(() => import('./SignedIn'));

export function App() {
  const { user } = useAuth();

  if (user === undefined) return <Loading />;

  if (!user) {
    return (
      <Routes>
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="*" element={<Navigate to="/sign-in" replace />} />
      </Routes>
    );
  }

  return (
    <Suspense fallback={<Loading />}>
      <SignedIn />
    </Suspense>
  );
}

function Loading() {
  return (
    <main className="screen center" aria-busy="true">
      <Logo size={72} />
      <p className="lede">Loading…</p>
    </main>
  );
}
