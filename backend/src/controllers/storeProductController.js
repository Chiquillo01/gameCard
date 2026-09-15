const { StoreProduct } = require('../data/Schema/storeProducts');
const { User } = require('../data/Schema/user');
const { Order } = require('../data/Schema/order');
const { Card } = require('../data/Schema/card');
const { UserCollection } = require('../data/Schema/userCollection');
const { cardsObtainedFromChests } = require('./userCollectionController');

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

// Charges `product.price[paymentMethod] * quantity` to `user[paymentMethod]`, mutating `user` in
// place. Only call once `canAfford` has already confirmed the purchase is valid.
const chargeUser = (user, product, paymentMethod, quantity = 1) => {
  user[paymentMethod] -= product.price[paymentMethod] * quantity;
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

const buyChest = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const { productId, paymentMethod } = req.body;
    const quantity = parseQuantity(req.body.quantity);
    if (quantity === null) return res.status(400).send();

    const user = await User.findById(userId);
    if (!user) return res.status(404).send();

    const chestData = await StoreProduct.findOne({ _id: productId });
    if (!chestData) return res.status(404).send();

    if (!canAfford(user, chestData, paymentMethod, quantity)) return res.status(410).send();

    const previousBalance = { pixelcoins: user.pixelcoins, pixelgems: user.pixelgems };

    // Each chest is drawn and saved to the collection independently, in sequence, so a card
    // pulled by one chest is already reflected before the next chest's own draw. The user isn't
    // charged until every chest in the batch has drawn successfully.
    let obtainedCards = [];
    for (let i = 0; i < quantity; i++) {
      // eslint-disable-next-line no-await-in-loop
      const cardsFromOneChest = await cardsObtainedFromChests(userId, chestData);
      if (cardsFromOneChest.length !== chestData.reward.cards) return res.status(404).send();
      obtainedCards = obtainedCards.concat(cardsFromOneChest);
    }

    chargeUser(user, chestData, paymentMethod, quantity);
    await user.save();

    const newBalance = {
      pixelcoins: user.pixelcoins,
      pixelgems: user.pixelgems,
    };

    const newOrder = new Order({
      userId: user._id,
      products: Array(quantity).fill({
        productId: chestData._id,
        name: chestData.name,
        price: chestData.price,
        reward: chestData.reward,
      }),
      totalPrice: {
        pixelcoins: (chestData.price.pixelcoins || 0) * quantity,
        pixelgems: (chestData.price.pixelgems || 0) * quantity,
        euros: (chestData.price.euros || 0) * quantity,
      },
      previousBalance,
      newBalance,
      status: 'completada',
    });

    await newOrder.save();
    res.status(200).json({
      obtainedCards,
      newBalance,
    });
  } catch (e) {
    res.status(500).send();
  }
};

const buyStructureDeck = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const { productId, paymentMethod } = req.body;
    const quantity = parseQuantity(req.body.quantity);
    if (quantity === null) return res.status(400).send();

    const user = await User.findById(userId);
    if (!user) return res.status(404).send();

    const product = await StoreProduct.findOne({ _id: productId, category: 'structure' });
    if (!product) return res.status(404).send();

    const cardNames = product.structureCards.map((sc) => sc.name);
    const cardDocsByName = new Map(
      (await Card.find({ name: { $in: cardNames } })).map((c) => [c.name, c]),
    );
    if (cardDocsByName.size !== cardNames.length) return res.status(404).send();

    if (!canAfford(user, product, paymentMethod, quantity)) return res.status(410).send();

    const previousBalance = { pixelcoins: user.pixelcoins, pixelgems: user.pixelgems };
    chargeUser(user, product, paymentMethod, quantity);
    await user.save();

    let userCollection = await UserCollection.findOne({ userId });
    if (!userCollection) {
      userCollection = new UserCollection({ userId, cards: [] });
    }

    // Expand each { name, amount } entry into that many individual copies, times how many decks
    // were bought, so the response (and the collection update below) reflect exactly the cards
    // the purchase promises.
    const obtainedCards = product.structureCards.flatMap(({ name, amount }) => {
      const card = cardDocsByName.get(name);
      return Array(amount * quantity).fill({ cardId: card._id, name: card.name });
    });
    obtainedCards.forEach(({ cardId }) => {
      const existingCard = userCollection.cards.find((card) => card.cardId.toString() === cardId.toString());
      if (existingCard) {
        existingCard.amount += 1;
      } else {
        userCollection.cards.push({ cardId, amount: 1 });
      }
    });

    userCollection.markModified('cards');
    await userCollection.save();

    const newBalance = {
      pixelcoins: user.pixelcoins,
      pixelgems: user.pixelgems,
    };

    const newOrder = new Order({
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
      previousBalance,
      newBalance,
      status: 'completada',
    });

    await newOrder.save();
    res.status(200).json({
      obtainedCards,
      newBalance,
    });
  } catch (e) {
    res.status(500).send();
  }
};

const buyCurrency = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const { productId } = req.params;
    const quantity = parseQuantity(req.body.quantity);
    if (quantity === null) return res.status(400).json({ error: 'Cantidad inválida.' });

    const product = await StoreProduct.findById(productId);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

    if (!product.reward.pixelgems || product.reward.pixelgems <= 0) {
      return res.status(400).json({ error: 'Este producto no es un pack de pixelgems válido.' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const previousBalance = { pixelcoins: user.pixelcoins, pixelgems: user.pixelgems };

    user.pixelgems += product.reward.pixelgems * quantity;

    await user.save();

    const newOrder = new Order({
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
      previousBalance,
      newBalance: { pixelcoins: user.pixelcoins, pixelgems: user.pixelgems },
      status: 'completada',
    });

    await newOrder.save();

    res.status(200).json({
      message: 'Compra de pixelgems realizada con éxito',
      newBalance: { pixelcoins: user.pixelcoins, pixelgems: user.pixelgems },
      order: newOrder,
    });
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
