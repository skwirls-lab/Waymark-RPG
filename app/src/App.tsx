import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Logo } from './Logo';
import { Home } from './pages/Home';
import { SignIn } from './pages/SignIn';

export function App() {
  const { user } = useAuth();

  if (user === undefined) {
    return (
      <main className="screen center" aria-busy="true">
        <Logo size={72} />
        <p className="lede">Loading…</p>
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/sign-in" element={user ? <Navigate to="/" replace /> : <SignIn />} />
      <Route path="/" element={user ? <Home /> : <Navigate to="/sign-in" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
