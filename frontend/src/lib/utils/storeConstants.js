// How many units the "comprar x5" bulk option buys at once. Kept in one place so the frontend
// offer and the backend's own bulk cap (MAX_BULK_QUANTITY in storeProductController.js) can be
// tuned independently.
export const BULK_QUANTITY = 5;
