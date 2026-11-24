import { Navigate, Route, Routes } from 'react-router-dom';
import { CharacterStoreProvider } from './data/useCharacters';
import { Builder } from './pages/Builder';
import { Home } from './pages/Home';
import { Sheet } from './pages/Sheet';

/** Everything a signed-in user can reach. Loaded on demand; see App.tsx. */
export default function SignedIn() {
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
