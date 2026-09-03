import styles from '../Store/store.module.css';
import ProductList from '../Store/ProductList';
import BalanceBar from '../Store/BalanceBar';
import ChestRewardModal from './ChestRewardModal';
import StoreFilter from './StoreFilter';
import PageTitle from '../Generic/PageTitle';
import { useState, useEffect } from 'react';
import { useUser } from '../../../../context/userContext';
import { getProducts, buyChest, buyCurrency } from '../../../../lib/utils/apiStore';
import { successToast, errorToast } from '../../../../lib/toastify/toast';

const productTranslations = {
  all: 'Todos los productos',
  chest: 'Cofres',
  structure: 'Mazos de Estructura',
  pixelgems: 'Packs de Pixelgems',
};

const Store = () => {
  const { data, updateUser } = useUser();
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [isRewardModalOpen, setIsRewardModalOpen] = useState(false);
  const [obtainedCards, setObtainedCards] = useState([]);

  useEffect(() => {
    const fetchStoreData = async () => {
      const fetchedProducts = await getProducts();
      const updatedProducts = fetchedProducts.map((product) => ({
        ...product,
        canAfford:
          (product.price.pixelcoins && data?.pixelcoins >= product.price.pixelcoins) ||
          (product.price.pixelgems && data?.pixelgems >= product.price.pixelgems),
      }));

      setProducts(updatedProducts);
    };

    if (data) fetchStoreData();
  }, [data]);

  useEffect(() => {
    if (selectedCategory === 'all') {
      setFilteredProducts(products);
    } else {
      setFilteredProducts(products.filter((product) => product.category === selectedCategory));
    }
  }, [selectedCategory, products]);

  const handleBuyProduct = async (product, closeModal) => {
    try {
      const response = await buyChest(product._id);

      if (response) {
        setObtainedCards(response.obtainedCards);
        closeModal();
        setTimeout(() => setIsRewardModalOpen(true), 300);
      }

      if (response.newBalance) {
        updateUser(response.newBalance);
      }

      successToast('Compra realizada con éxito');
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
    if (category === 'chest') return buyChest;
    if (category === 'pixelgems') return buyCurrency;
    return buyCurrency;
  };

  const translatedProduct = productTranslations[selectedCategory] || selectedCategory;

  return (
    <>
      <BalanceBar balance={{ pixelcoins: data?.pixelcoins, pixelgems: data?.pixelgems }} />

      <div className={styles.storeContainer}>
        <PageTitle title={`Productos: ${translatedProduct}`} />

        <div className={styles.productsSection}>
          <div className={styles.filterWrapper}>
            <StoreFilter selectedCategory={selectedCategory} setSelectedCategory={setSelectedCategory} />
          </div>

          <div className={styles.productsContainer}>
            <ProductList
              products={filteredProducts}
              onBuy={(product, closeModal) => handleBuyProduct(product, getBuyFunction(selectedCategory), closeModal)}
            />
          </div>
        </div>
      </div>

      <ChestRewardModal
        isOpen={isRewardModalOpen}
        onClose={() => setIsRewardModalOpen(false)}
        obtainedCards={obtainedCards}
      />
    </>
  );
};

export default Store;
