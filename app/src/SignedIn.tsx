import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { CharacterStoreProvider } from './data/useCharacters';
import { Account } from './pages/Account';
import { Builder, CampaignBuilder } from './pages/Builder';
import { Campaign } from './pages/Campaign';
import { JoinPage } from './pages/CampaignForms';
import { Home } from './pages/Home';
import { Sheet, WardenSheet } from './pages/Sheet';
import { WorldEditor, Worlds } from './pages/Worlds';

// The rulebook's text is large, so it is fetched only when someone opens it.
const Rules = lazy(() => import('./pages/Rules').then((m) => ({ default: m.Rules })));

/** Where a signed-out visitor was heading, such as a join link. See App.tsx. */
export const NEXT_KEY = 'waymark.next';

/** Everything a signed-in user can reach. Loaded on demand; see App.tsx. */
export default function SignedIn() {
  const navigate = useNavigate();
  useEffect(() => {
    const next = sessionStorage.getItem(NEXT_KEY);
    if (next) {
      sessionStorage.removeItem(NEXT_KEY);
      navigate(next, { replace: true });
    }
  }, [navigate]);

  return (
    <CharacterStoreProvider>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/new" element={<Builder />} />
        <Route path="/account" element={<Account />} />
        <Route
          path="/rules"
          element={
            <Suspense fallback={<p className="lede screen">Loading…</p>}>
              <Rules />
            </Suspense>
          }
        />
        <Route path="/worlds" element={<Worlds />} />
        <Route path="/worlds/:id" element={<WorldEditor />} />
        <Route path="/c/:id" element={<Sheet />} />
        <Route path="/join/:code" element={<JoinPage />} />
        <Route path="/k/:cid" element={<Campaign />} />
        <Route path="/k/:cid/new" element={<CampaignBuilder />} />
        <Route path="/k/:cid/w/:wid" element={<WardenSheet />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </CharacterStoreProvider>
  );
}
