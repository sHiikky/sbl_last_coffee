import { supabase } from '../lib/supabaseClient';
import { normalizeLoyaltySnapshot } from './loyaltySnapshot';

export async function fetchLoyaltySnapshot(customerId) {
  const { data, error } = await supabase.rpc('get_loyalty_state');
  if (error) throw error;
  return normalizeLoyaltySnapshot(data, customerId);
}
