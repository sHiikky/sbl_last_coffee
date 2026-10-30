import { useCallback, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchOrderingConfig } from '../lib/ordering';
import { cafeGreeting, getCafeHours } from '../lib/cafeLocation';

export default function useCafeHours() {
  const [config, setConfig] = useState(null);
  const [now, setNow] = useState(Date.now());
  useFocusEffect(useCallback(() => {
    let active = true;
    let pending = false;
    let lastRefresh = 0;
    async function refresh() {
      if (!active) return;
      setNow(Date.now());
      if (pending) return;
      pending = true;
      lastRefresh = Date.now();
      try {
        const received = await fetchOrderingConfig();
        if (active) { setConfig(received); setNow(Date.now()); }
      } catch (_) { /* The owner's known hours still work in Tomsk time offline. */ }
      finally { pending = false; }
    }
    refresh();
    const interval = setInterval(() => {
      if (AppState.currentState && AppState.currentState !== 'active') return;
      setNow(Date.now());
      if (Date.now() - lastRefresh >= 300000) refresh();
    }, 15000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { active = false; clearInterval(interval); subscription.remove(); };
  }, []));
  return { ...getCafeHours(config, now), greeting: cafeGreeting(config, now) };
}
