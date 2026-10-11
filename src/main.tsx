import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { getSetting, setSetting } from './db/settings';
import { requestPersistence } from './platform/storage';
import './styles/global.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Pide almacenamiento persistente una vez por arranque y guarda lo que responda el navegador.
void (async () => {
  const granted = await requestPersistence();
  if (granted !== (await getSetting<boolean | null>('persistGranted', null))) await setSetting('persistGranted', granted);
})();
