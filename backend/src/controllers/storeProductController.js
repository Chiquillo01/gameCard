const { StoreProduct } = require('../data/Schema/storeProducts');
const { User } = require('../data/Schema/user');
const { Order } = require('../data/Schema/order');
const { Card } = require('../data/Schema/card');
const { UserCollection } = require('../data/Schema/userCollection');
const { cardsObtainedFromChests } = require('./userCollectionController');

const PAYMENT_METHODS = ['pixelcoins', 'pixelgems'];

// charges `product.price[paymentMethod]` to `user[paymentMethod]`, mutating `user` in place.
// returns false (nothing charged) when the method is invalid, the product doesn't offer it,
// or the user can't afford it — callers decide the right status code for each case.
const chargeUser = (user, product, paymentMethod) => {
  if (!PAYMENT_METHODS.includes(paymentMethod)) return false;
  const cost = product.price[paymentMethod];
  if (!cost || user[paymentMethod] < cost) return false;
  user[paymentMethod] -= cost;
  return true;
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

    const user = await User.findById(userId);
    if (!user) return res.status(404).send();

    const chestData = await StoreProduct.findOne({ _id: productId });
    if (!chestData) return res.status(404).send();

    const obtainedCards = await cardsObtainedFromChests(userId, chestData);
    if (obtainedCards.length !== chestData.reward.cards) return res.status(404).send();

    const previousBalance = { pixelcoins: user.pixelcoins, pixelgems: user.pixelgems };
    if (!chargeUser(user, chestData, paymentMethod)) return res.status(410).send();

    await user.save();

    const newBalance = {
      pixelcoins: user.pixelcoins,
      pixelgems: user.pixelgems,
    };

    const newOrder = new Order({
      userId: user._id,
      products: [
        {
          productId: chestData._id,
          name: chestData.name,
          price: chestData.price,
          reward: chestData.reward,
        },
      ],
      totalPrice: chestData.price,
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

    const user = await User.findById(userId);
    if (!user) return res.status(404).send();

    const product = await StoreProduct.findOne({ _id: productId, category: 'structure' });
    if (!product) return res.status(404).send();

    const deckCards = await Card.find({ name: { $in: product.structureCards } });
    if (deckCards.length !== product.structureCards.length) return res.status(404).send();

    const previousBalance = { pixelcoins: user.pixelcoins, pixelgems: user.pixelgems };
    if (!chargeUser(user, product, paymentMethod)) return res.status(410).send();

    await user.save();

    let userCollection = await UserCollection.findOne({ userId });
    if (!userCollection) {
      userCollection = new UserCollection({ userId, cards: [] });
    }

    const obtainedCards = deckCards.map((card) => ({ cardId: card._id, name: card.name }));
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
      products: [
        {
          productId: product._id,
          name: product.name,
          price: product.price,
          reward: product.reward,
        },
      ],
      totalPrice: product.price,
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

    const product = await StoreProduct.findById(productId);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

    if (!product.reward.pixelgems || product.reward.pixelgems <= 0) {
      return res.status(400).json({ error: 'Este producto no es un pack de pixelgems válido.' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const previousBalance = { pixelcoins: user.pixelcoins, pixelgems: user.pixelgems };

    user.pixelgems += product.reward.pixelgems;

    await user.save();

    const newOrder = new Order({
      userId: user._id,
      products: [
        {
          productId: product._id,
          name: product.name,
          price: product.price,
          reward: product.reward,
        },
      ],
      totalPrice: product.price,
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
