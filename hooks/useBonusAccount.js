import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { createCustomerDataSource } from '../lib/customerDataSource';

const source = createCustomerDataSource({
  name: 'bonus-account', table: 'bonus_accounts', empty: { balance: 0, lifetimePaid: 0 },
  async read(customerId) {
    const { data, error } = await supabase.from('bonus_accounts')
      .select('balance, lifetime_paid').eq('customer_id', customerId).maybeSingle();
    if (error) throw error;
    return { balance: Number(data?.balance ?? 0), lifetimePaid: Number(data?.lifetime_paid ?? 0) };
  },
});

export default function useBonusAccount() {
  const [snapshot, setSnapshot] = useState(source.getSnapshot);
  useEffect(() => source.subscribe(setSnapshot), []);
  return { ...snapshot.data, loaded: snapshot.loaded, error: snapshot.error, refresh: source.refresh };
}
