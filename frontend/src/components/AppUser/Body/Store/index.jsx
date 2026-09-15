import styles from '../Store/store.module.css';
import ProductList from '../Store/ProductList';
import BalanceBar from '../Store/BalanceBar';
import ChestRewardModal from './ChestRewardModal';
import StoreFilter from './StoreFilter';
import { useState, useEffect } from 'react';
import { useUser } from '../../../../context/userContext';
import { getProducts, buyChest, buyStructureDeck, buyCurrency } from '../../../../lib/utils/apiStore';
import { successToast, errorToast } from '../../../../lib/toastify/toast';
import { BULK_QUANTITY } from '../../../../lib/utils/storeConstants';

const productTranslations = {
  all: 'Todos los productos',
  chest: 'Cofres',
  structure: 'Mazos de Estructura',
  pixelgems: 'Packs de Pixelgems',
};

// Temporary: hide products that don't have real art yet (they still use the generic card
// placeholder) instead of showing an empty/placeholder image in the store. Remove this filter
// once every product in the catalog has its own imageUrl.
const hasRealImage = (product) => !!product.imageUrl && !product.imageUrl.includes('cardplaceholdertcg');

const Store = () => {
  const { data, updateUser } = useUser();
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isRewardModalOpen, setIsRewardModalOpen] = useState(false);
  const [obtainedCards, setObtainedCards] = useState([]);
  const [openedProductImage, setOpenedProductImage] = useState(null);

  // Fetch the catalog once on mount — GET /store/products is public and doesn't need the user
  // to be loaded first. Gating this behind the user query (as before) meant that on a fresh
  // login, if the store page rendered before the user query resolved, the fetch never ran and
  // the page stayed empty until a manual refresh remounted everything from scratch.
  useEffect(() => {
    const fetchStoreData = async () => {
      const fetchedProducts = await getProducts();
      setProducts(fetchedProducts.filter(hasRealImage));
    };

    fetchStoreData();
  }, []);

  // Affordability (and category filtering) is recomputed whenever the product list or the
  // user's balance changes, instead of being baked into the fetch above.
  useEffect(() => {
    const withAffordability = products.map((product) => ({
      ...product,
      canAffordPixelcoins: product.price.pixelcoins != null && data?.pixelcoins >= product.price.pixelcoins,
      canAffordPixelgems: product.price.pixelgems != null && data?.pixelgems >= product.price.pixelgems,
      canAffordPixelcoinsBulk:
        product.price.pixelcoins != null && data?.pixelcoins >= product.price.pixelcoins * BULK_QUANTITY,
      canAffordPixelgemsBulk:
        product.price.pixelgems != null && data?.pixelgems >= product.price.pixelgems * BULK_QUANTITY,
    }));

    if (selectedCategory === 'all') {
      setFilteredProducts(withAffordability);
    } else {
      setFilteredProducts(withAffordability.filter((product) => product.category === selectedCategory));
    }
  }, [selectedCategory, products, data]);

  const handleBuyProduct = async (product, paymentMethod, quantity, buyFunction, closeModal) => {
    try {
      const response = await buyFunction(product._id, paymentMethod, quantity);

      if (response) {
        closeModal();
        if (response.obtainedCards) {
          setObtainedCards(response.obtainedCards);
          setOpenedProductImage(product.imageUrl);
          setTimeout(() => setIsRewardModalOpen(true), 300);
        }

        if (response.newBalance) {
          updateUser(response.newBalance);
        }
      }

      successToast(quantity > 1 ? `Compra de ${quantity} realizada con éxito` : 'Compra realizada con éxito');
    } catch (e) {
      if (e.status === 400) {
        errorToast('Solicitud incorrecta');
      } else if (e.status === 404) {
        errorToast('Algun recurso no se ha encontrado o no está disponible');
      } else if (e.status === 410) {
        errorToast('Saldo insuficiente');
      } else {
        errorToast('Error interno del servidor');
      }
    }

  };

  const getBuyFunction = (category) => {
    if (category === 'chest' || category === 'spEdition') return buyChest;
    if (category === 'structure') return buyStructureDeck;
    return buyCurrency;
  };

  const translatedProduct = productTranslations[selectedCategory] || selectedCategory;

  return (
    <div className={styles.storePage}>
      <BalanceBar balance={{ pixelcoins: data?.pixelcoins, pixelgems: data?.pixelgems }} />

      <div className={styles.titleBanner}>
        <div className={styles.titlePlaque}>
          <div className={styles.titleText}>{translatedProduct.toUpperCase()}</div>
        </div>
      </div>

      <div className={styles.storeContainer}>
        <div className={styles.productsSection}>
          <div className={styles.filterWrapper}>
            <StoreFilter selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory} />
          </div>

          <div className={styles.productsContainer}>
            <ProductList
              products={filteredProducts}
              onBuy={(product, paymentMethod, quantity, closeModal) =>
                handleBuyProduct(product, paymentMethod, quantity, getBuyFunction(product.category), closeModal)
              }
            />
          </div>
        </div>
      </div>

      <ChestRewardModal
        isOpen={isRewardModalOpen}
        onClose={() => setIsRewardModalOpen(false)}
        obtainedCards={obtainedCards}
        productImage={openedProductImage}
      />
    </div>
  );
};

export default Store;
