const { Market } = require('../data/Schema/market');
const { Card } = require('../data/Schema/card');
const { User } = require('../data/Schema/user');
const { UserCollection } = require('../data/Schema/userCollection');

const getMarketProducts = async (req, res) => {
  try {
    const filterCard = req.params.id;
    const marketCards = await Market.find({ cardId: filterCard }).populate('userId', 'userName');

    res.status(200).json(marketCards || []);
  } catch (e) {
    res.status(500).json({ e: 'Market' });
  }
};

const createProduct = async (req, res) => {
  try {
    const { cardId, price, foil, amount } = req.body.newCard;
    const { id } = req.jwtPayload;

    const cardExists = await Card.findById(cardId).select('foil');
    if (!cardExists) {
      return res.status(404).json({ error: 'Carta no encontrada' });
    }

    const userExists = await User.findById(id).select('userName');
    if (!userExists) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const userCollection = await UserCollection.findOne({ userId: id }).select('cards');
    if (!userCollection) {
      return res.status(404).json({ error: 'Colección de usuario no encontrada' });
    }

    const userCard = userCollection.cards.find((card) => card.cardId.toString() === cardId.toString());

    if (!userCard) {
      return res.status(400).json({ error: 'No tienes esta carta para poner a la venta' });
    }
    if (userCard.amount < parseInt(amount, 10)) {
      return res.status(400).json({ error: 'No tienes suficientes cartas para poner a la venta' });
    }
    const existingProduct = await Market.findOne({ userId: id, cardId, foil });

    if (existingProduct) {
      return res.status(400).json({ error: 'Carta ya en venta, modifica ese input' });
    }

    const newMarketProduct = new Market({
      cardId,
      foil,
      userId: id,
      price: { pixelcoins: parseFloat(price) },
      amount: parseInt(amount, 10),
    });

    await newMarketProduct.save();

    userCard.amount -= parseInt(amount, 10);
    userCollection.cards = userCollection.cards.filter((card) => card.amount > 0);
    await userCollection.save();

    res.status(201).json(newMarketProduct);
  } catch (e) {
    res.status(500).json({ error: 'Error al crear el producto en el mercado' });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const { id: userId } = req.jwtPayload;

    const product = await Market.findById(productId);

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    if (product.userId.toString() !== userId) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este producto' });
    }

    await Market.findByIdAndDelete(productId);

    res.status(200).json({ message: 'Producto eliminado con éxito' });
  } catch (e) {
    res.status(500).json({ e: 'Market' });
  }
};

module.exports = {
  getMarketProducts,
  createProduct,
  deleteProduct,
};
