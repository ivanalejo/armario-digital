import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { db } from '../../db/db';
import { catalogStats } from '../../domain/catalog';
import { getStorageStatus, type StorageStatus } from '../../platform/storage';
import { Icon } from '../../ui/Icon';
import { ItemCard } from '../wardrobe/WardrobePage';
import { setCatalogFilter } from '../wardrobe/filterStore';

export function HomePage() {
  const items = useLiveQuery(() => db.items.toArray(), []);
  const [storage, setStorage] = useState<StorageStatus>();
  useEffect(() => void getStorageStatus().then(setStorage), []);
  if (!items) return <div className="page"><p className="muted">Cargando…</p></div>;

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

      <div className="tiles">
        {tiles.map((t) => (
          <Link key={t.label} href="/armario" className="tile" onClick={() => setCatalogFilter(t.filter)}>
            <span className="tile__value">{t.value}</span>
            <span className="tile__label">{t.label}</span>
          </Link>
        ))}
      </div>

      <div className="notice notice--backup">
        <Icon name="shield" size={20} />
        <div>
          <strong>Aún no hay copia de seguridad.</strong> Tus prendas solo existen en este navegador. La exportación llegará en la siguiente fase; no borres los datos de Chrome mientras tanto.
          {storage?.persisted === false && <> El navegador no ha concedido almacenamiento persistente (ver Ajustes).</>}
        </div>
      </div>

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
