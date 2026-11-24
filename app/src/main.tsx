import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '../../site/src/tokens.css';
import './app.css';
import { App } from './App';
import { AuthProvider } from './auth';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

// The offline cache downloads the whole app. Start it only after the first
// screen has loaded, so it never competes with what the person is waiting for.
window.addEventListener('load', () => {
  setTimeout(() => {
    void import('virtual:pwa-register').then(({ registerSW }) => registerSW({ immediate: true }));
  }, 3000);
});
