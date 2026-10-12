// Copia v1 CONGELADA (sintética) generada con Armario Digital 0.1.2. No la modifiques:
// sirve para garantizar que las versiones futuras siguen restaurando copias v1.
// Si cambia el formato, añade un fixture nuevo en lugar de editar este.
export const BACKUP_V1_MANIFEST = {
 "format": "armario-digital",
 "formatVersion": 1,
 "schemaVersion": 1,
 "kind": "backup",
 "createdAt": "2026-10-12T18:00:00.000Z",
 "generator": {
  "name": "armario-app",
  "version": "0.1.2"
 },
 "counts": {
  "items": 3,
  "images": 3,
  "outfits": 1,
  "wearLog": 1,
  "feedback": 0,
  "kits": 0,
  "vocab": 0
 },
 "items": [
  {
   "id": "itm_fixv10001",
   "name": "Camiseta blanca",
   "categoryId": "top",
   "subcategoryId": "tshirt",
   "status": "available",
   "isDraft": false,
   "favorite": true,
   "createdAt": "2026-10-12T10:00:00.000Z",
   "updatedAt": "2026-10-12T10:00:00.000Z",
   "colors": {
    "primary": "white",
    "secondary": []
   },
   "imageIds": [
    "img_fixv10001"
   ]
  },
  {
   "id": "itm_fixv10002",
   "name": "Vaqueros oscuros",
   "categoryId": "bottom",
   "subcategoryId": "jeans",
   "status": "available",
   "isDraft": false,
   "favorite": false,
   "createdAt": "2026-10-12T10:00:00.000Z",
   "updatedAt": "2026-10-12T10:00:00.000Z",
   "colors": {
    "primary": "navy",
    "secondary": []
   },
   "imageIds": [
    "img_fixv10002"
   ]
  },
  {
   "id": "itm_fixv10003",
   "name": "Zapatillas blancas",
   "categoryId": "footwear",
   "subcategoryId": "sneakers",
   "status": "available",
   "isDraft": false,
   "favorite": false,
   "createdAt": "2026-10-12T10:00:00.000Z",
   "updatedAt": "2026-10-12T10:00:00.000Z",
   "colors": {
    "primary": "white",
    "secondary": []
   },
   "imageIds": [
    "img_fixv10003"
   ]
  }
 ],
 "images": [
  {
   "id": "img_fixv10001",
   "itemId": "itm_fixv10001",
   "mime": "image/webp",
   "width": 600,
   "height": 800,
   "bytes": 21,
   "sha256": "15e7626ac7635916464bf360a04e6e7620872e7baae678e7378acdb166687c5c",
   "createdAt": "2026-10-12T10:00:00.000Z",
   "path": "images/img_fixv10001.webp",
   "displaySha256": "15e7626ac7635916464bf360a04e6e7620872e7baae678e7378acdb166687c5c",
   "thumbPath": "thumbs/img_fixv10001.webp",
   "thumbSha256": "9d9f3d26cd476d3f1da9d60682ecfa1890730976bf0b86bd28be20fc1fcd77e7"
  },
  {
   "id": "img_fixv10002",
   "itemId": "itm_fixv10002",
   "mime": "image/webp",
   "width": 600,
   "height": 800,
   "bytes": 21,
   "sha256": "6dabde3de8c91ec3848c38e6724069eb4daf61b74ca34eec1d7f9695a8c842ed",
   "createdAt": "2026-10-12T10:00:00.000Z",
   "path": "images/img_fixv10002.webp",
   "displaySha256": "6dabde3de8c91ec3848c38e6724069eb4daf61b74ca34eec1d7f9695a8c842ed",
   "thumbPath": "thumbs/img_fixv10002.webp",
   "thumbSha256": "5b3af077e675bc362aa0ff9b62548359b55d137ad1af6db06e558745844132db"
  },
  {
   "id": "img_fixv10003",
   "itemId": "itm_fixv10003",
   "mime": "image/webp",
   "width": 600,
   "height": 800,
   "bytes": 21,
   "sha256": "3fb4482df9d53e9adef5be1f8703ad6dcadf336e0f98a5f8733fafa1ac5623e6",
   "createdAt": "2026-10-12T10:00:00.000Z",
   "path": "images/img_fixv10003.webp",
   "displaySha256": "3fb4482df9d53e9adef5be1f8703ad6dcadf336e0f98a5f8733fafa1ac5623e6",
   "thumbPath": "thumbs/img_fixv10003.webp",
   "thumbSha256": "df8c516b36e9c50dfa497f4d060e60e4d6245df2916ccb31699e2fd0ccd9196d"
  }
 ],
 "outfits": [
  {
   "id": "out_fixv10001",
   "slots": {
    "base": "itm_fixv10001",
    "bottom": "itm_fixv10002",
    "footwear": "itm_fixv10003"
   },
   "origin": "manual",
   "favorite": true,
   "createdAt": "2026-10-12T11:00:00.000Z"
  }
 ],
 "wearLog": [
  {
   "id": "wear_fixv10001",
   "date": "2026-10-12",
   "itemIds": [
    "itm_fixv10001",
    "itm_fixv10002",
    "itm_fixv10003"
   ]
  }
 ],
 "feedback": [],
 "kits": [],
 "vocab": []
} as const;

/** Archivos del ZIP en base64. */
export const BACKUP_V1_FILES: Record<string, string> = {
 "images/img_fixv10001.webp": "UklGRgAAAABXRUJQZGlzcGxheS0x",
 "thumbs/img_fixv10001.webp": "UklGRgAAAABXRUJQdGh1bWItMQ==",
 "images/img_fixv10002.webp": "UklGRgAAAABXRUJQZGlzcGxheS0y",
 "thumbs/img_fixv10002.webp": "UklGRgAAAABXRUJQdGh1bWItMg==",
 "images/img_fixv10003.webp": "UklGRgAAAABXRUJQZGlzcGxheS0z",
 "thumbs/img_fixv10003.webp": "UklGRgAAAABXRUJQdGh1bWItMw=="
};
