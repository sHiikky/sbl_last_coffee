import { supabase } from './supabaseClient';

export function toCustomerOrder(row) {
  // A gift splits a SKU into free and paid lines. Repeat needs their total qty.
  const items = new Map();
  for (const line of row.order_items || []) {
    const key = line.product_id || line.id;
    const previous = items.get(key);
    items.set(key, {
      key, id: line.product_id, name: line.product_name,
      qty: (previous?.qty || 0) + Number(line.quantity || 0),
      unitPrice: Math.max(previous?.unitPrice || 0, Number(line.price || 0)),
    });
  }
  const lines = [...items.values()];
  return {
    id: row.id, supabaseOrderId: row.id, orderNumber: `№${row.order_number}`,
    createdAt: row.created_at, status: row.status,
    total: Number(row.total || 0) - Number(row.bonus_redeemed || 0),
    earnedBonuses: Number(row.bonus_earned || 0),
    itemCount: lines.reduce((sum, item) => sum + item.qty, 0), items: lines,
  };
}

export async function fetchCustomerOrders(customerId) {
  const { data, error } = await supabase.from('orders')
    .select('id, order_number, created_at, status, total, bonus_redeemed, bonus_earned, order_items(id, product_id, product_name, quantity, price)')
    .eq('customer_id', customerId).order('created_at', { ascending: false }).limit(100);
  if (error) throw error;
  return (data || []).map(toCustomerOrder);
}
