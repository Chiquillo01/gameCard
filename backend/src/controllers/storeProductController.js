const { StoreProduct } = require('../data/Schema/storeProducts');
const { User } = require('../data/Schema/user');
const { Order } = require('../data/Schema/order');
const { cardsObtainedFromChests } = require('./userCollectionController');

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
    const productId = req.body.productId;

    const user = await User.findById(userId);
    if (!user) return res.status(404).send();

    const chestData = await StoreProduct.findOne({ _id: productId });
    if (!chestData) return res.status(404).send();

    const obtainedCards = await cardsObtainedFromChests(userId, chestData);
    if (obtainedCards.length !== chestData.reward.cards) return res.status(404).send();

    const { pixelcoins, pixelgems } = chestData.price;
    const canAffordWithPixelcoins = pixelcoins != null && user.pixelcoins >= pixelcoins;
    const canAffordWithPixelgems = pixelgems != null && user.pixelgems >= pixelgems;
    if (!canAffordWithPixelcoins && !canAffordWithPixelgems) return res.status(410).send();

    const previousBalance = { pixelcoins: user.pixelcoins, pixelgems: user.pixelgems };

    if (canAffordWithPixelcoins) {
      user.pixelcoins -= pixelcoins;
    } else {
      user.pixelgems -= pixelgems;
    }

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

const buyCurrency = async (req, res) => {
  try {
    const userId = req.jwtPayload.id;
    const { productId } = req.params;

    const product = await StoreProduct.findById(productId);
    if (!product) return res.status(404).json({ error: 'Producto no encontrado' });

    if (!product.reward.pixelcoins || product.reward.pixelcoins <= 0) {
      return res.status(400).json({ error: 'Este producto no es un pack de pixelgems válido.' });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const previousBalance = { pixelcoins: user.pixelcoins, pixelgems: user.pixelgems };

    user.pixelcoins += product.reward.pixelcoins;

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

    res.status(200).json({ message: 'Compra de pixelcoins realizada con éxito', order: newOrder });
  } catch (error) {
    res.status(500).json({ error: 'Error al procesar la compra de pixelcoins' });
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
  buyCurrency,
  deleteProduct,
};
