// How many units the "comprar x5" bulk option buys at once. Kept in one place so the frontend
// offer and the backend's own bulk cap (MAX_BULK_QUANTITY in storeProductController.js) can be
// tuned independently.
export const BULK_QUANTITY = 5;

// The store's filters, in order; `id` is the product category ('all' shows everything).
export const STORE_CATEGORIES = [
  { id: 'all', label: 'Todos los productos' },
  { id: 'chest', label: 'Cofres' },
  { id: 'spEdition', label: 'Ediciones Especiales' },
  { id: 'structure', label: 'Mazos de Estructura' },
  { id: 'pixelgems', label: 'Packs de Pixelgems' },
];
