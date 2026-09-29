const { StoreProduct } = require('../data/Schema/storeProducts');
const { User } = require('../data/Schema/user');
const { Order } = require('../data/Schema/order');
const { Card } = require('../data/Schema/card');
const { drawChest, addCardsToCollection, charge, refund } = require('../services/storeRewards');

const PAYMENT_METHODS = ['pixelcoins', 'pixelgems'];
// Upper bound on a single bulk purchase, so a crafted request can't ask for an absurd quantity.
const MAX_BULK_QUANTITY = 10;

// Reads and validates `quantity` from a request body: defaults to 1, must be a positive integer
// no greater than MAX_BULK_QUANTITY. Returns null when invalid so the caller can 400 out.
const parseQuantity = (raw) => {
  if (raw === undefined) return 1;
  const quantity = Number(raw);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_BULK_QUANTITY) return null;
  return quantity;
};

// true when `paymentMethod` is valid, the product offers it, and `user` can afford
// `quantity` of it — never mutates `user`, so it's safe to call before doing any real work.
const canAfford = (user, product, paymentMethod, quantity = 1) => {
  if (!PAYMENT_METHODS.includes(paymentMethod)) return false;
  const unitCost = product.price[paymentMethod];
  if (!unitCost) return false;
  return user[paymentMethod] >= unitCost * quantity;
};

const getProducts = async (req, res) => {
  try {
    const products = await StoreProduct.find();
    res.status(200).json(products);
  } catch (error) {
    res.status(500).send();
  }
};

const getUserOrders = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const orders = await Order.find({ userId }).sort({ createdAt: -1 });

    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener el historial de compras' });
  }
};

const createProduct = async (req, res) => {
  try {
    const { name, description, price, reward, imageUrl, category, expansion } = req.body;

    if (!name || !description || !price || !reward || !imageUrl || !category) {
      return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    const newProduct = new StoreProduct({
      name,
      description,
      price,
      reward,
      imageUrl,
      category,
      expansion,
    });

    const savedProduct = await newProduct.save();
    res.status(201).json({ message: 'Producto creado con éxito', product: savedProduct });
  } catch (error) {
    res.status(500).json({ error: 'Error al crear el producto' });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, reward, imageUrl } = req.body;

    if (!name && !description && !price && !reward && !imageUrl) {
      return res.status(400).json({ error: 'Debe enviar al menos un campo para actualizar.' });
    }

    const updatedProduct = await StoreProduct.findByIdAndUpdate(id, req.body, { new: true });

    if (!updatedProduct) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.status(200).json({ message: 'Producto actualizado con éxito', product: updatedProduct });
  } catch (error) {
    res.status(500).json({ error: 'Error al actualizar el producto' });
  }
};

// Every purchase: checks first (product, category, payment method, balance), then the atomic
// charge, then handing out what was bought — refunded if that part fails, so nothing is ever
// given without being paid or paid without being given.

const orderFor = (user, product, quantity, balanceBefore) =>
  new Order({
    userId: user._id,
    products: Array(quantity).fill({
      productId: product._id,
      name: product.name,
      price: product.price,
      reward: product.reward,
    }),
    totalPrice: {
      pixelcoins: (product.price.pixelcoins || 0) * quantity,
      pixelgems: (product.price.pixelgems || 0) * quantity,
      euros: (product.price.euros || 0) * quantity,
    },
    previousBalance: balanceBefore,
    newBalance: { pixelcoins: user.pixelcoins, pixelgems: user.pixelgems },
    status: 'completada',
  });

const balanceOf = (user) => ({ pixelcoins: user.pixelcoins, pixelgems: user.pixelgems });

// The balance before a charge, from the updated user and what the charge changed.
const balanceBefore = (user, paymentMethod, cost, credit = {}) => {
  const before = balanceOf(user);
  before[paymentMethod] += cost;
  Object.entries(credit).forEach(([k, v]) => { before[k] -= v; });
  return before;
};

// The product for a purchase route, only if it is of one of `categories`.
const productFor = async (req, categories) => {
  const product = await StoreProduct.findById(req.params.productId);
  if (!product) return { status: 404, error: 'Producto no encontrado' };
  if (!categories.includes(product.category)) return { status: 400, error: 'Este producto no se compra así.' };
  return { product };
};

const CHEST_CATEGORIES = ['chest', 'spEdition'];

const buyChest = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const { paymentMethod } = req.body;
    const quantity = parseQuantity(req.body.quantity);
    if (quantity === null) return res.status(400).json({ error: 'Cantidad inválida.' });

    const { product, status, error } = await productFor(req, CHEST_CATEGORIES);
    if (!product) return res.status(status).json({ error });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (!canAfford(user, product, paymentMethod, quantity)) return res.status(410).json({ error: 'Saldo insuficiente' });

    // Every chest is drawn before anything is charged or handed out.
    let obtainedCards = [];
    for (let i = 0; i < quantity; i++) {
      // eslint-disable-next-line no-await-in-loop
      const cards = await drawChest(product);
      if (!cards) return res.status(404).json({ error: 'Este cofre aún no tiene cartas.' });
      obtainedCards = obtainedCards.concat(cards);
    }

    const cost = product.price[paymentMethod] * quantity;
    const charged = await charge(userId, paymentMethod, cost);
    if (!charged) return res.status(410).json({ error: 'Saldo insuficiente' });
    try {
      await addCardsToCollection(userId, obtainedCards);
    } catch (e) {
      await refund(userId, paymentMethod, cost);
      throw e;
    }

    await orderFor(charged, product, quantity, balanceBefore(charged, paymentMethod, cost)).save();
    res.status(200).json({ obtainedCards, newBalance: balanceOf(charged) });
  } catch (e) {
    res.status(500).json({ error: 'Error al comprar el cofre' });
  }
};

const buyStructureDeck = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const { paymentMethod } = req.body;
    const quantity = parseQuantity(req.body.quantity);
    if (quantity === null) return res.status(400).json({ error: 'Cantidad inválida.' });

    const { product, status, error } = await productFor(req, ['structure']);
    if (!product) return res.status(status).json({ error });

    const cardNames = product.structureCards.map((sc) => sc.name);
    const cardDocsByName = new Map((await Card.find({ name: { $in: cardNames } })).map((c) => [c.name, c]));
    if (cardDocsByName.size !== cardNames.length) return res.status(404).json({ error: 'Este mazo tiene cartas que ya no existen.' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (!canAfford(user, product, paymentMethod, quantity)) return res.status(410).json({ error: 'Saldo insuficiente' });

    // Each { name, amount } entry as that many copies, times how many decks were bought.
    const obtainedCards = product.structureCards.flatMap(({ name, amount }) => {
      const card = cardDocsByName.get(name);
      return Array(amount * quantity).fill({ ...card.toObject(), cardId: card._id });
    });

    const cost = product.price[paymentMethod] * quantity;
    const charged = await charge(userId, paymentMethod, cost);
    if (!charged) return res.status(410).json({ error: 'Saldo insuficiente' });
    try {
      await addCardsToCollection(userId, obtainedCards);
    } catch (e) {
      await refund(userId, paymentMethod, cost);
      throw e;
    }

    await orderFor(charged, product, quantity, balanceBefore(charged, paymentMethod, cost)).save();
    res.status(200).json({ obtainedCards, newBalance: balanceOf(charged) });
  } catch (e) {
    res.status(500).json({ error: 'Error al comprar el mazo' });
  }
};

const buyCurrency = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const { paymentMethod } = req.body;
    const quantity = parseQuantity(req.body.quantity);
    if (quantity === null) return res.status(400).json({ error: 'Cantidad inválida.' });

    const { product, status, error } = await productFor(req, ['pixelgems']);
    if (!product) return res.status(status).json({ error });
    if (!product.reward.pixelgems || product.reward.pixelgems <= 0) {
      return res.status(400).json({ error: 'Este producto no es un pack de pixelgems válido.' });
    }

    // A pack is only handed out once it's actually been paid for. Packs priced in in-game currency
    // are charged like any other product; packs priced in euros need a real payment provider that
    // confirms the charge server-side, and there isn't one yet — so they can't be bought at all.
    if (!PAYMENT_METHODS.includes(paymentMethod) || !product.price[paymentMethod]) {
      return res.status(402).json({ error: 'Los pagos con dinero real aún no están disponibles.' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });
    if (!canAfford(user, product, paymentMethod, quantity)) return res.status(410).json({ error: 'Saldo insuficiente' });

    const cost = product.price[paymentMethod] * quantity;
    const credit = { pixelgems: product.reward.pixelgems * quantity };
    const charged = await charge(userId, paymentMethod, cost, credit);
    if (!charged) return res.status(410).json({ error: 'Saldo insuficiente' });

    const order = orderFor(charged, product, quantity, balanceBefore(charged, paymentMethod, cost, credit));
    await order.save();
    res.status(200).json({ message: 'Compra de pixelgems realizada con éxito', newBalance: balanceOf(charged), order });
  } catch (error) {
    res.status(500).json({ error: 'Error al procesar la compra de pixelgems' });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedProduct = await StoreProduct.findByIdAndDelete(id);

    if (!deletedProduct) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.status(200).json({ message: 'Producto eliminado con éxito', product: deletedProduct });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar el producto' });
  }
};

module.exports = {
  getProducts,
  getUserOrders,
  createProduct,
  updateProduct,
  buyChest,
  buyStructureDeck,
  buyCurrency,
  deleteProduct,
};
