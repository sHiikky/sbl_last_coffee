import { useEffect, useState } from 'react';
import { createCustomerDataSource } from '../lib/customerDataSource';
import { fetchCustomerOrders } from '../lib/customerOrders';

const source = createCustomerDataSource({
  name: 'customer-orders', table: 'orders', empty: [], read: fetchCustomerOrders,
});

export default function useCustomerOrders(enabled) {
  const [snapshot, setSnapshot] = useState(source.getSnapshot);
  useEffect(() => enabled ? source.subscribe(setSnapshot) : undefined, [enabled]);
  return { ...snapshot, refresh: source.refresh };
}
