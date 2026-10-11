import { Component, type ReactNode } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Link, Route, Router, Switch, useLocation } from 'wouter';
import { useHashLocation } from 'wouter/use-hash-location';
import { ItemEditorPage } from '../features/editor/ItemEditorPage';
import { HomePage } from '../features/home/HomePage';
import { OutfitsPage } from '../features/outfits/OutfitsPage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { ItemDetailPage } from '../features/wardrobe/ItemDetailPage';
import { WardrobePage } from '../features/wardrobe/WardrobePage';
import { Icon, type IconName } from '../ui/Icon';

const NAV: { href: string; label: string; icon: IconName; match: (l: string) => boolean }[] = [
  { href: '/', label: 'Inicio', icon: 'home', match: (l) => l === '/' },
  { href: '/armario', label: 'Armario', icon: 'hanger', match: (l) => l.startsWith('/armario') || l.startsWith('/prenda') },
  { href: '/nueva', label: 'Añadir', icon: 'plus', match: (l) => l === '/nueva' },
  { href: '/outfits', label: 'Outfits', icon: 'sparkles', match: (l) => l.startsWith('/outfits') },
  { href: '/ajustes', label: 'Ajustes', icon: 'settings', match: (l) => l.startsWith('/ajustes') },
];

function BottomNav() {
  const [loc] = useLocation();
  return (
    <nav className="bottom-nav" aria-label="Secciones">
      {NAV.map((n) => (
        <Link key={n.href} href={n.href} className={`bottom-nav__item${n.match(loc) ? ' is-active' : ''}${n.href === '/nueva' ? ' bottom-nav__item--add' : ''}`} aria-current={n.match(loc) ? 'page' : undefined}>
          <Icon name={n.icon} size={n.href === '/nueva' ? 26 : 22} />
          <span>{n.label}</span>
        </Link>
      ))}
    </nav>
  );
}

function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh && !offlineReady) return null;
  return (
    <div className="toast" role="status">
      {needRefresh ? (
        <>
          <span>Nueva versión disponible.</span>
          <button type="button" className="btn btn--small" onClick={() => void updateServiceWorker(true)}>Actualizar</button>
          <button type="button" className="btn btn--small btn--ghost" onClick={() => setNeedRefresh(false)}>Luego</button>
        </>
      ) : (
        <>
          <span>Lista para usarse sin conexión.</span>
          <button type="button" className="btn btn--small btn--ghost" onClick={() => setOfflineReady(false)}>OK</button>
        </>
      )}
    </div>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  override state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="page">
        <h1>Algo ha fallado</h1>
        <p>Tus datos siguen guardados en el dispositivo. Recarga la app para continuar.</p>
        <pre className="error-box">{this.state.error.message}</pre>
        <button type="button" className="btn" onClick={() => location.reload()}>Recargar</button>
      </div>
    );
  }
}

export function App() {
  return (
    <ErrorBoundary>
      <Router hook={useHashLocation}>
        <main className="app">
          <Switch>
            <Route path="/" component={HomePage} />
            <Route path="/armario" component={WardrobePage} />
            <Route path="/nueva">{() => <ItemEditorPage />}</Route>
            <Route path="/prenda/:id/editar">{(p) => <ItemEditorPage key={p.id} id={p.id} />}</Route>
            <Route path="/prenda/:id">{(p) => <ItemDetailPage id={p.id} />}</Route>
            <Route path="/outfits" component={OutfitsPage} />
            <Route path="/ajustes" component={SettingsPage} />
            <Route>
              <div className="page"><p>Página no encontrada.</p><Link href="/" className="btn">Ir al inicio</Link></div>
            </Route>
          </Switch>
        </main>
        <BottomNav />
        <UpdatePrompt />
      </Router>
    </ErrorBoundary>
  );
}
