// hooks/useBonusAccount.js
// Баланс + накопленная "деньгами" сумма покупок (lifetime_paid) из
// bonus_accounts, с realtime-подпиской — тот же паттерн, что useOrderStatus
// (см. его комментарий). До первого completed-заказа строки в bonus_accounts
// ещё нет — тогда возвращаем нули, это ожидаемое стартовое состояние, а не
// ошибка загрузки.
//
// Хук используется сразу на нескольких экранах (Главная, Корзина, Товар,
// Профиль), а вкладки остаются смонтированными. Раньше у каждого экземпляра
// был свой канал с одним и тем же именем: второй экземпляр падал на
// `.on()` после `subscribe()`, а размонтирование любого экземпляра убивало
// канал у остальных. Поэтому загрузка и подписка вынесены в один общий
// источник на всё приложение: он стартует с первым подписчиком и
// останавливается, когда подписчиков не осталось.
import { useEffect, useState } from 'react';
import { supabase, getUserOrThrow } from '../lib/supabaseClient';

const EMPTY_ACCOUNT = { balance: 0, lifetimePaid: 0, loaded: false };

function rowToAccount(row) {
  return {
    balance: row?.balance ?? 0,
    lifetimePaid: Number(row?.lifetime_paid ?? 0),
    loaded: true,
  };
}

let current = EMPTY_ACCOUNT;
let channel = null;
let generation = 0; // растёт при каждом старте/остановке, отсекает устаревшие async-ответы
let channelSeq = 0;
const listeners = new Set();

function publish(next) {
  current = next;
  listeners.forEach(listener => listener(next));
}

async function startSource() {
  const myGeneration = ++generation;
  try {
    const user = await getUserOrThrow();
    if (myGeneration !== generation) return;

    const { data, error } = await supabase
      .from('bonus_accounts')
      .select('balance, lifetime_paid')
      .eq('customer_id', user.id)
      .maybeSingle();
    if (error) throw error;
    if (myGeneration !== generation) return;
    publish(rowToAccount(data));

    // Уникальное имя канала: даже если прежний ещё закрывается асинхронно,
    // новый не подхватит его как "существующий топик".
    channelSeq += 1;
    channel = supabase
      .channel(`bonus-account-${user.id}-${channelSeq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bonus_accounts', filter: `customer_id=eq.${user.id}` },
        payload => {
          if (myGeneration !== generation || !payload.new) return;
          publish(rowToAccount(payload.new));
        }
      )
      .subscribe();
  } catch (error) {
    console.warn('[bonus] failed to load bonus account', error);
    if (myGeneration === generation) publish({ ...current, loaded: true });
  }
}

function stopSource() {
  generation += 1;
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }
  current = EMPTY_ACCOUNT;
}

export default function useBonusAccount() {
  const [account, setAccount] = useState(current);

  useEffect(() => {
    listeners.add(setAccount);
    setAccount(current);
    if (listeners.size === 1) startSource();
    return () => {
      listeners.delete(setAccount);
      if (listeners.size === 0) stopSource();
    };
  }, []);

  return account;
}
