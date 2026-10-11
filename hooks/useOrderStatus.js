import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase } from '../lib/supabaseClient';

const FINAL_STATUSES = ['completed', 'cancelled'];
let channelSequence = 0;

export default function useOrderStatus(orderId, { initialStatus, onFinished } = {}) {
  const [snapshot, setSnapshot] = useState({ orderId, status: initialStatus || null, orderNumber: null, error: null });
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;
  useEffect(() => {
    setSnapshot({ orderId, status: initialStatus || null, orderNumber: null, error: null });
    if (!orderId) return undefined;
    let stopped = false;
    let revision = 0;
    let inFlight = false;
    let queued = false;
    let finalNotified = false;
    const apply = row => {
      if (stopped || !row?.status) return;
      setSnapshot(previous => {
        // Terminal orders cannot reopen, including after a delayed GET.
        if (previous.orderId === orderId && FINAL_STATUSES.includes(previous.status) && !FINAL_STATUSES.includes(row.status)) return previous;
        return { orderId, status: row.status, orderNumber: row.order_number ?? previous.orderNumber, error: null };
      });
      if (FINAL_STATUSES.includes(row.status) && !finalNotified) {
        finalNotified = true;
        finishedRef.current?.(row.status);
      }
    };
    async function refresh() {
      if (stopped) return;
      if (inFlight) { queued = true; return; }
      inFlight = true;
      const startedRevision = revision;
      try {
        const { data, error } = await supabase.from('orders')
          .select('status, order_number').eq('id', orderId).single();
        if (stopped || startedRevision !== revision) return;
        if (error) throw error;
        apply(data);
      } catch (error) {
        if (!stopped && startedRevision === revision) setSnapshot(previous => ({ ...previous, error }));
      } finally {
        inFlight = false;
        if (queued && !stopped) { queued = false; void refresh(); }
      }
    }
    channelSequence += 1;
    const channel = supabase.channel('order-status-' + orderId + '-' + channelSequence)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: 'id=eq.' + orderId }, payload => {
        revision += 1;
        apply(payload.new);
      }).subscribe(status => { if (status === 'SUBSCRIBED') void refresh(); });
    void refresh();
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 15000);
    return () => { stopped = true; clearInterval(timer); foreground.remove(); void supabase.removeChannel(channel); };
  }, [orderId]);
  return snapshot.orderId === orderId ? snapshot : { status: initialStatus || null, orderNumber: null, error: null };
}
