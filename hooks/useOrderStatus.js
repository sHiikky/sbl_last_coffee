// hooks/useOrderStatus.js
// Общая логика "текущий статус заказа + realtime-подписка", используется и
// полноэкранным OrderSuccessScreen (сразу после оформления), и
// ActiveOrderBanner на Главной (при возврате в уже открытое приложение или
// после его перезапуска) — обе точки входа должны видеть один и тот же
// статус без расхождений, поэтому логика не продублирована в двух местах.
import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const FINAL_STATUSES = ['completed', 'cancelled'];

export default function useOrderStatus(orderId, { initialStatus, onFinished } = {}) {
  const [status, setStatus] = useState(initialStatus || null);
  const [orderNumber, setOrderNumber] = useState(null);
  const onFinishedRef = useRef(onFinished);
  onFinishedRef.current = onFinished;

  useEffect(() => {
    if (!orderId) return undefined;

    let cancelled = false;
    // Realtime UPDATE events can arrive before the initial GET resolves (slow
    // connection); once that happens the GET's snapshot is stale and must not
    // overwrite the newer status.
    let realtimeUpdateReceived = false;

    supabase
      .from('orders')
      .select('status, order_number')
      .eq('id', orderId)
      .single()
      .then(({ data, error }) => {
        if (cancelled || error || !data || realtimeUpdateReceived) return;
        setStatus(data.status);
        if (data.order_number != null) setOrderNumber(data.order_number);
        if (FINAL_STATUSES.includes(data.status)) onFinishedRef.current?.(data.status);
      });

    const channel = supabase
      .channel(`order-status-${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        payload => {
          if (cancelled) return;
          const nextStatus = payload.new?.status;
          if (!nextStatus) return;
          realtimeUpdateReceived = true;
          setStatus(nextStatus);
          if (FINAL_STATUSES.includes(nextStatus)) onFinishedRef.current?.(nextStatus);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [orderId]);

  return { status, orderNumber };
}
