import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { getOrderIdFromNotification, getOrderNotificationSupport, refreshPushRegistration, describeNotificationError } from '../lib/notificationService';

// Permission is requested only by the user's Enable action in the profile.
// This hook refreshes an already approved registration and routes safe order IDs.
export default function useOrderNotifications({ userId = null, onOpenOrder } = {}) {
  const callback = useRef(onOpenOrder);
  callback.current = onOpenOrder;
  const currentUser = useRef(userId);
  currentUser.current = userId;
  const seen = useRef(new Set());
  const [error, setError] = useState(null);

  useEffect(() => {
    if (Platform.OS === 'web' || !getOrderNotificationSupport().supported) return undefined;
    Notifications.setNotificationHandler({ handleNotification: async notification => {
      const data = notification?.request?.content?.data;
      const own = !!currentUser.current && data?.customerId === currentUser.current && data?.type === 'order_status';
      return { shouldShowBanner: own, shouldShowList: own, shouldPlaySound: own, shouldSetBadge: false };
    } });
    return () => Notifications.setNotificationHandler(null);
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web' || !userId || !getOrderNotificationSupport().supported) return undefined;
    let active = true;
    const refresh = () => refreshPushRegistration({ userId }).then(() => { if (active) setError(null); }).catch(cause => {
      if (active) setError(describeNotificationError(cause));
    });
    void refresh();
    const foreground = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    const tokens = Notifications.addPushTokenListener(() => { void refresh(); });
    return () => { active = false; foreground.remove(); tokens.remove(); };
  }, [userId]);

  useEffect(() => {
    if (Platform.OS === 'web' || !userId || !getOrderNotificationSupport().supported) return undefined;
    let active = true;
    seen.current.clear();
    const respond = response => {
      if (!active) return;
      const id = response?.notification?.request?.identifier;
      const orderId = getOrderIdFromNotification(response);
      const recipientId = response?.notification?.request?.content?.data?.customerId;
      if (!orderId || !id || recipientId !== userId || seen.current.has(id)) return;
      seen.current.add(id);
      if (seen.current.size > 100) seen.current.delete(seen.current.values().next().value);
      // Root must resolve this ID against the signed-in user's server orders.
      callback.current?.(orderId);
    };
    const listener = Notifications.addNotificationResponseReceivedListener(respond);
    Notifications.getLastNotificationResponseAsync().then(respond).catch(() => {});
    return () => { active = false; listener.remove(); };
  }, [userId]);

  return { error };
}
