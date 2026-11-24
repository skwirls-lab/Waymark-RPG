import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { CharacterStoreProvider } from './data/useCharacters';
import { Logo } from './Logo';
import { Builder } from './pages/Builder';
import { Home } from './pages/Home';
import { Sheet } from './pages/Sheet';
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

  if (!user) {
    return (
      <Routes>
        <Route path="/sign-in" element={<SignIn />} />
        <Route path="*" element={<Navigate to="/sign-in" replace />} />
      </Routes>
    );
  }

  return (
    <CharacterStoreProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new" element={<Builder />} />
        <Route path="/c/:id" element={<Sheet />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </CharacterStoreProvider>
  );
}
