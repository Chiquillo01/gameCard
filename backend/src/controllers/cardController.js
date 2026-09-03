const { Card } = require('../data/Schema/card');

const getCards = async (req, res) => {
  try {
    const cards = await Card.find();
    res.status(200).json(cards || []);
  } catch (e) {
    res.status(500).send();
  }
};

module.exports = {
  getCards,
};
