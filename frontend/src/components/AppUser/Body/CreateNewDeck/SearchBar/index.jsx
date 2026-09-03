import React from 'react';
import { FaSearch } from 'react-icons/fa';
import styles from './searchbar.module.css';

const SearchBar = ({ onSearch }) => {
  return (
    <div className={styles.searchBar}>
      <FaSearch className={styles.icon} />
      <input type='text' placeholder='Buscar carta...' onChange={(event) => onSearch(event.target.value)} />
    </div>
  );
};

export default SearchBar;
