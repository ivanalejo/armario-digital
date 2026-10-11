import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function PageHeader({ title, onBack, actions }: { title: ReactNode; onBack?: () => void; actions?: ReactNode }) {
  return (
    <header className="page-header">
      {onBack && (
        <button type="button" className="icon-btn" onClick={onBack} aria-label="Volver">
          <Icon name="back" />
        </button>
      )}
      <h1>{title}</h1>
      <div className="page-header__actions">{actions}</div>
    </header>
  );
}
