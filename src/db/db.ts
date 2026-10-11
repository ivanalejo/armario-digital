// Base de datos local (IndexedDB vía Dexie). Esquema v1 (ARCHITECTURE.md §5).
// Todas las tablas del modelo existen desde v1, aunque algunas se usen en fases
// posteriores, para que las copias de seguridad tengan siempre la misma forma.
import Dexie, { type Table } from 'dexie';
import type { BlobRecord, FeedbackEvent, ImageMeta, Item, Kit, Outfit, WearEntry } from '../domain/schema';

export interface SettingRecord {
  key: string;
  value: unknown;
}
export interface VocabRecord {
  kind: 'category' | 'subcategory' | 'style';
  id: string;
  label: string;
  parentId?: string;
  slots?: string[];
  custom: true;
}

export const DB_NAME = 'armario-digital';

export class ArmarioDB extends Dexie {
  items!: Table<Item, string>;
  images!: Table<ImageMeta, string>;
  blobs!: Table<BlobRecord, [string, string]>;
  outfits!: Table<Outfit, string>;
  wearLog!: Table<WearEntry, string>;
  feedback!: Table<FeedbackEvent, string>;
  kits!: Table<Kit, string>;
  vocab!: Table<VocabRecord, [string, string]>;
  settings!: Table<SettingRecord, string>;

  constructor(name: string = DB_NAME) {
    super(name);
    // Nota: IndexedDB no puede indexar booleanos; favoritos y borradores se filtran en memoria.
    this.version(1).stores({
      items: 'id, categoryId, status, updatedAt',
      images: 'id, itemId, sha256, source.sha256',
      blobs: '[imageId+variant], imageId',
      outfits: 'id, createdAt',
      wearLog: 'id, date, *itemIds',
      feedback: 'id, at, target, *itemIds',
      kits: 'id, createdAt',
      vocab: '[kind+id], kind',
      settings: 'key',
    });
  }
}

export const db = new ArmarioDB();
