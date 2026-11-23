import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase, pollingOnly } from '../lib/supabaseClient';
import { fetchLoyaltySnapshot } from './loyaltyApi';
import { getCycleProgress } from './loyaltyService';

const EMPTY = {
  visitedDays: [], rewards: [], milestonesClaimed: [], currentStreak: 0,
  longestStreak: 0, lastQualifiedDay: null, currentStreakStartDay: null,
  today: '1970-01-01', todayStatus: 'new', cycleProgress: getCycleProgress(0),
};

// orderHistory is a refresh signal only; it never proves a visit or earns a gift.
export default function useLoyaltyState(orderHistory) {
  const [customerId, setCustomerId] = useState(null);
  const [authRevision, setAuthRevision] = useState(0);
  const [snapshot, setSnapshot] = useState(EMPTY);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(null);
  const [celebrationQueue, setCelebrationQueue] = useState([]);
  const generation = useRef(0);
  const observed = useRef(null);
  const mounted = useRef(false);
  const identity = useRef(null);

  useEffect(() => {
    mounted.current = true;
    let authChanged = false;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      authChanged = true;
      generation.current += 1;
      const nextId = session?.user?.id || null;
      if (identity.current !== nextId) {
        identity.current = nextId;
        setSnapshot(EMPTY);
        setReady(false);
        setCelebrationQueue([]);
        setError(null);
      }
      setCustomerId(nextId);
      setAuthRevision(prev => prev + 1);
    });
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!mounted.current || authChanged) return;
      if (sessionError) setError(sessionError);
      identity.current = data?.session?.user?.id || null;
      setCustomerId(identity.current);
    });
    return () => {
      mounted.current = false;
      generation.current += 1;
      subscription.unsubscribe();
    };
  }, []);

  const refresh = useCallback(async () => {
    const request = ++generation.current;
    if (!customerId) return;
    try {
      const next = await fetchLoyaltySnapshot(customerId);
      if (!mounted.current || request !== generation.current) return;
      if (observed.current?.customerId === customerId) {
        const newRewards = next.rewards.filter(r =>
          r.status === 'available' && !observed.current.ids.has(r.id));
        if (newRewards.length) setCelebrationQueue(prev => [...prev, ...newRewards]);
      }
      observed.current = { customerId, ids: new Set(next.rewards.map(r => r.id)) };
      setSnapshot(next);
      setReady(true);
      setError(null);
    } catch (refreshError) {
      if (!mounted.current || request !== generation.current) return;
      setError(refreshError);
      // Never present stale cached gifts as currently available after a failed read.
      setSnapshot(prev => ({ ...prev, rewards: [] }));
      setCelebrationQueue([]);
      setReady(true);
    }
  }, [customerId]);

  useEffect(() => {
    observed.current = null;
    setSnapshot(EMPTY);
    setReady(false);
    setCelebrationQueue([]);
    if (!customerId) return;
    void refresh();
    let channel;
    if (!pollingOnly) {
      channel = supabase.channel(`loyalty-orders-${customerId}`)
        .on('postgres_changes', {
          event: '*', schema: 'public', table: 'orders', filter: `customer_id=eq.${customerId}`,
        }, () => { void refresh(); })
        .subscribe();
    }
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh();
    });
    // Covers expiry, Tomsk midnight, recovery, and missed realtime notifications.
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 30000);
    return () => {
      generation.current += 1;
      clearInterval(timer);
      subscription.remove();
      if (channel) void supabase.removeChannel(channel);
    };
  }, [customerId, refresh]);

  useEffect(() => { void refresh(); }, [orderHistory, refresh, authRevision]);

  return {
    ...snapshot, ready, error, refresh,
    celebratingReward: celebrationQueue[0] || null,
    dismissCelebration: () => setCelebrationQueue(prev => prev.slice(1)),
    // Compatibility with CartScreen: consumption is already committed on the server.
    redeemReward: refresh,
    devReset: refresh,
  };
}
