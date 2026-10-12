import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { loadItems } from '../../db/health';
import { useDbQuery } from '../../db/useDbQuery';
import { LoadState } from '../../ui/LoadState';
import { catalogStats } from '../../domain/catalog';
import { getStorageStatus, type StorageStatus } from '../../platform/storage';
import { Icon } from '../../ui/Icon';
import { ItemCard } from '../wardrobe/WardrobePage';
import { setCatalogFilter } from '../wardrobe/filterStore';
import { BackupReminder } from '../backup/BackupPanel';

export function HomePage() {
  const q = useDbQuery(() => loadItems(), [], 'cargar Inicio');
  const [storage, setStorage] = useState<StorageStatus>();
  useEffect(() => void getStorageStatus().then(setStorage).catch(() => undefined), []);
  if (q.status !== 'ready' || !q.data) {
    return (
      <div className="page">
        <header className="hero"><h1>Tu armario</h1></header>
        <LoadState q={q} what="tus prendas" />
      </div>
    );
  }
  const { items, invalid } = q.data;

  const s = catalogStats(items);
  const recent = [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);
  const tiles = [
    { label: 'Prendas', value: s.total, filter: {} },
    { label: 'Disponibles', value: s.available, filter: { statuses: ['available' as const], drafts: 'exclude' as const } },
    { label: 'Borradores', value: s.drafts, filter: { drafts: 'only' as const } },
    { label: 'Por revisar', value: s.pendingReview, filter: { pendingReview: true } },
  ];

  return (
    <div className="page">
      <header className="hero">
        <h1>Tu armario</h1>
        <p className="muted">Todo se guarda solo en este dispositivo.</p>
      </header>

      {invalid.length > 0 && (
        <Link href="/diagnostico" className="notice notice--warn">
          {invalid.length} ficha{invalid.length > 1 ? 's' : ''} con datos no válidos no se muestra{invalid.length > 1 ? 'n' : ''}. No se ha borrado nada: ver diagnóstico.
        </Link>
      )}

      <div className="tiles">
        {tiles.map((t) => (
          <Link key={t.label} href="/armario" className="tile" onClick={() => setCatalogFilter(t.filter)}>
            <span className="tile__value">{t.value}</span>
            <span className="tile__label">{t.label}</span>
          </Link>
        ))}
      </div>

      <BackupReminder />
      {storage?.persisted === false && <p className="hint">El navegador no ha concedido almacenamiento persistente (ver Ajustes).</p>}

      <Link href="/nueva" className="btn btn--wide"><Icon name="plus" size={18} /> Añadir prenda</Link>

      {recent.length > 0 && (
        <>
          <h2 className="h2">Añadidas recientemente</h2>
          <div className="grid">{recent.map((it) => <ItemCard key={it.id} item={it} />)}</div>
        </>
      )}
    </div>
  );
}
