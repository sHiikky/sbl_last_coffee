// hooks/useBonusAccount.js
// Баланс + накопленная "деньгами" сумма покупок (lifetime_paid) из
// bonus_accounts, с realtime-подпиской — тот же паттерн, что useOrderStatus
// (см. его комментарий). До первого completed-заказа строки в bonus_accounts
// ещё нет — тогда возвращаем нули, это ожидаемое стартовое состояние, а не
// ошибка загрузки.
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

export default function useBonusAccount() {
  const [account, setAccount] = useState(EMPTY_ACCOUNT);

  useEffect(() => {
    let cancelled = false;
    let channel = null;

    (async () => {
      try {
        const user = await getUserOrThrow();
        if (cancelled) return;

        const { data, error } = await supabase
          .from('bonus_accounts')
          .select('balance, lifetime_paid')
          .eq('customer_id', user.id)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) setAccount(rowToAccount(data));

        channel = supabase
          .channel(`bonus-account-${user.id}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'bonus_accounts', filter: `customer_id=eq.${user.id}` },
            payload => {
              if (cancelled || !payload.new) return;
              setAccount(rowToAccount(payload.new));
            }
          )
          .subscribe();
      } catch (error) {
        console.warn('[bonus] failed to load bonus account', error);
        if (!cancelled) setAccount(prev => ({ ...prev, loaded: true }));
      }
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  return account;
}
