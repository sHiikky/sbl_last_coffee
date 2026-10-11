import { AppState } from 'react-native';
import { supabase, getUserOrThrow } from './supabaseClient';

// Shared reads recover missed realtime events on reconnect and foreground.
export function createCustomerDataSource({ read, empty, table, name }) {
  const listeners = new Set();
  const initial = () => ({ data: empty, customerId: null, loaded: false, error: null });
  let snapshot = initial();
  let lifecycle = 0;
  let revision = 0;
  let channel = null;
  let channelSequence = 0;
  let authSubscription = null;
  let foreground = null;
  let timer = null;
  let inFlight = null;
  let queued = false;
  const publish = next => {
    snapshot = next;
    listeners.forEach(listener => listener(snapshot));
  };
  const removeChannel = () => {
    if (channel) void supabase.removeChannel(channel);
    channel = null;
  };
  const switchCustomer = customerId => {
    if (snapshot.customerId === customerId) return;
    revision += 1;
    removeChannel();
    publish({ ...initial(), customerId });
    if (!customerId) return;
    channelSequence += 1;
    channel = supabase.channel(`${name}-${customerId}-${channelSequence}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table, filter: `customer_id=eq.${customerId}`,
      }, () => { void refresh(); })
      .subscribe(status => {
        if (status === 'SUBSCRIBED') void refresh();
      });
  };
  async function refresh() {
    if (!listeners.size) return;
    revision += 1;
    if (inFlight) { queued = true; return inFlight; }
    const startedLifecycle = lifecycle;
    const operation = (async () => {
      let startedRevision = revision;
      try {
        const user = await getUserOrThrow();
        if (startedLifecycle !== lifecycle || startedRevision !== revision || !listeners.size) return;
        switchCustomer(user.id);
        startedRevision = revision;
        const data = await read(user.id);
        if (startedLifecycle !== lifecycle || startedRevision !== revision) return;
        publish({ data, customerId: user.id, loaded: true, error: null });
      } catch (error) {
        if (startedLifecycle !== lifecycle || startedRevision !== revision) return;
        publish({ ...snapshot, loaded: true, error });
      }
    })();
    inFlight = operation;
    try { await operation; }
    finally {
      if (inFlight === operation) {
        inFlight = null;
        if (queued && listeners.size) { queued = false; void refresh(); }
      }
    }
  }
  function start() {
    lifecycle += 1;
    const activeLifecycle = lifecycle;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Supabase auth methods must run outside its auth callback.
      queueMicrotask(() => {
        if (activeLifecycle !== lifecycle || !listeners.size) return;
        switchCustomer(session?.user?.id || null);
        void refresh();
      });
    });
    authSubscription = subscription;
    foreground = AppState.addEventListener('change', state => {
      if (state === 'active') void refresh();
    });
    timer = setInterval(() => {
      if (AppState.currentState === 'active') void refresh();
    }, 30000);
    void refresh();
  }
  function stop() {
    lifecycle += 1;
    revision += 1;
    queued = false;
    inFlight = null;
    clearInterval(timer);
    foreground?.remove();
    authSubscription?.unsubscribe();
    removeChannel();
    snapshot = initial();
  }
  return {
    getSnapshot: () => snapshot,
    refresh,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot);
      if (listeners.size === 1) start();
      return () => { listeners.delete(listener); if (!listeners.size) stop(); };
    },
  };
}
