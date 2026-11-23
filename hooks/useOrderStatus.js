import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { supabase, pollingOnly } from '../lib/supabaseClient';

const FINAL_STATUSES = ['completed', 'cancelled'];
let channelSequence = 0;

export default function useOrderStatus(orderId, { initialStatus, onFinished } = {}) {
  const emptySnapshot = () => ({ orderId, status: initialStatus || null, orderNumber: null, details: null, error: null, refreshing: false, lastUpdatedAt: null });
  const [snapshot, setSnapshot] = useState(emptySnapshot);
  const refreshRef = useRef(() => Promise.resolve());
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;
  useEffect(() => {
    setSnapshot(emptySnapshot());
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
        return { orderId, status: row.status, orderNumber: row.order_number ?? previous.orderNumber,
          details: { ...(previous.orderId === orderId ? previous.details : null), ...row },
          error: null, refreshing: previous.refreshing, lastUpdatedAt: Date.now() };
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
      setSnapshot(previous => previous.orderId === orderId ? { ...previous, refreshing: true } : previous);
      const startedRevision = revision;
      try {
        let { data, error } = await supabase.from('orders')
          .select('status, order_number, total, bonus_redeemed, pickup_at, pickup_point, customer_name, customer_phone, paid_at, updated_at')
          .eq('id', orderId).single();
        // Read-only compatibility for an older schema; never bypasses checkout.
        if (error && ['42703', 'PGRST204'].includes(error.code) && !stopped && startedRevision === revision) {
          ({ data, error } = await supabase.from('orders').select('status, order_number').eq('id', orderId).single());
        }
        if (stopped || startedRevision !== revision) return;
        if (error) throw error;
        apply(data);
      } catch (error) {
        if (!stopped && startedRevision === revision) setSnapshot(previous => ({ ...previous, error }));
      } finally {
        inFlight = false;
        if (!stopped) setSnapshot(previous => previous.orderId === orderId ? { ...previous, refreshing: false } : previous);
        if (queued && !stopped) { queued = false; void refresh(); }
      }
    }
    refreshRef.current = refresh;
    channelSequence += 1;
    let channel;
    if (!pollingOnly) {
      channel = supabase.channel('order-status-' + orderId + '-' + channelSequence)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: 'id=eq.' + orderId }, payload => {
          revision += 1;
          apply(payload.new);
        }).subscribe(status => {
          if (stopped) return;
          if (status === 'SUBSCRIBED') void refresh();
          if (['CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) {
            setSnapshot(previous => previous.orderId === orderId ? { ...previous, error: new Error('STATUS_CONNECTION_LOST') } : previous);
            void refresh();
          }
        });
    }
    void refresh();
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 15000);
    return () => { stopped = true; if (refreshRef.current === refresh) refreshRef.current = () => Promise.resolve(); clearInterval(timer); foreground.remove(); if (channel) void supabase.removeChannel(channel); };
  }, [orderId]);
  return { ...(snapshot.orderId === orderId ? snapshot : emptySnapshot()), refresh: () => refreshRef.current() };
}
