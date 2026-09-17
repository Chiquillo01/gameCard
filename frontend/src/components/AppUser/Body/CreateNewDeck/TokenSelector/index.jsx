import { useEffect, useRef, useState } from 'react';
import { FaChevronDown } from 'react-icons/fa';
import { ATTRIBUTE_COLORS } from '../../../../../lib/utils/cardDisplay';
import styles from './tokenselector.module.css';

// Tokens are conjured by a card's effect during a duel rather than drawn from the deck, so
// instead of adding them to the main deck the player just declares — once, per deck — which of
// their owned token cards they want available to represent those effects in that duel.
const TokenSelector = ({ availableTokens, selectedTokens, onToggleToken }) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (availableTokens.length === 0) return null;

  const selectedIds = new Set(selectedTokens.map((t) => t.id));

  return (
    <div className={styles.tokenSelector} ref={wrapperRef}>
      <button type='button' className={styles.toggleButton} onClick={() => setOpen((prev) => !prev)}>
        Tokens en partida ({selectedTokens.length}/{availableTokens.length})
        <FaChevronDown className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} />
      </button>
      {open && (
        <div className={styles.dropdown}>
          {availableTokens.map((token) => (
            <label key={token.id} className={styles.tokenOption}>
              <input
                type='checkbox'
                checked={selectedIds.has(token.id)}
                onChange={() => onToggleToken(token)}
              />
              <span className={styles.tokenSwatch} style={{ backgroundColor: ATTRIBUTE_COLORS[token.attribute] || '#3d6b4a' }} />
              {token.name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

export default TokenSelector;
