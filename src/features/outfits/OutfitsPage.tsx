import { Icon } from '../../ui/Icon';
import { PageHeader } from '../../ui/PageHeader';

export function OutfitsPage() {
  return (
    <div className="page">
      <PageHeader title="Outfits" />
      <div className="empty">
        <Icon name="sparkles" size={48} />
        <p>El generador de outfits llegará en la Fase 3.</p>
        <p className="muted small">Mientras tanto, cataloga tus prendas con corte, colores, estilo y formalidad: el recomendador los usará.</p>
      </div>
    </div>
  );
}
