import { useEffect, useState } from 'react';
import axios from 'axios';
// The same file the server seeds its rules from: what's shown until the server answers.
import defaults from '../../../../backend/src/data/seed/game_rules_final.json';

// The game's numbers (deck sizes, copies per rarity, starting VP...) come from the server
// (GET /rules, read from the database), fetched once and shared by every component.
let current = { ...defaults };
let loading = null;
const listeners = new Set();

export const getGameRules = () => current;

export function loadGameRules() {
  if (!loading) {
    loading = axios
      .get(`${import.meta.env.VITE_BACKEND_API_URL}/rules`)
      .then((res) => {
        current = { ...defaults, ...res.data };
        listeners.forEach((notify) => notify(current));
        return current;
      })
      .catch(() => {
        loading = null; // try again next time a component asks
        return current;
      });
  }
  return loading;
}

// The rules, re-rendering the component once the server's values arrive.
export function useGameRules() {
  const [rules, setRules] = useState(current);
  useEffect(() => {
    listeners.add(setRules);
    loadGameRules();
    return () => listeners.delete(setRules);
  }, []);
  return rules;
}

// A card's copy limit: its own banlist value (`state`), or the limit for its rarity.
export const maxCopiesOf = (card, rules = current) => card.state ?? (rules.maxCopiesByRarity || {})[card.rarity] ?? 3;
