// loyalty/loyaltyStorage.js
// Единственное место, где loyalty-домен трогает AsyncStorage. Если позже
// появится backend, этот файл превращается в LocalLoyaltyRepository и рядом
// заводится ApiLoyaltyRepository с тем же контрактом (load/save/clear) —
// остальной код (loyaltyService.js, useLoyaltyState.js) не меняется.
//
// Хранится под одним versioned-ключом (LOYALTY_STORAGE_KEY), а не россыпью
// разных ключей:
//  - visitedDays   — накопленная история посещённых дней. Источник истины —
//                     orderHistory, но т.к. App.js хранит только последние 12
//                     заказов (see App.js -> placeOrder .slice(0, 12)), сам
//                     orderHistory не может быть единственным хранилищем этой
//                     истории. Здесь дни накапливаются и не исчезают, даже
//                     когда старые заказы "вываливаются" из orderHistory.
//  - rewards            — выданные награды (available/redeemed/expired).
//  - milestonesClaimed  — идемпотентный журнал уже выданных milestone-наград.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LOYALTY_STORAGE_KEY } from './loyaltyConfig.js';

const EMPTY_METADATA = { version: 1, visitedDays: [], milestonesClaimed: [], rewards: [] };

export async function loadLoyaltyMetadata() {
  try {
    const raw = await AsyncStorage.getItem(LOYALTY_STORAGE_KEY);
    if (!raw) return { ...EMPTY_METADATA };

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_METADATA };

    return {
      version: 1,
      visitedDays: Array.isArray(parsed.visitedDays) ? parsed.visitedDays : [],
      milestonesClaimed: Array.isArray(parsed.milestonesClaimed) ? parsed.milestonesClaimed : [],
      rewards: Array.isArray(parsed.rewards) ? parsed.rewards : [],
    };
  } catch (error) {
    console.warn('[loyalty] Failed to load metadata, falling back to empty state', error);
    return { ...EMPTY_METADATA };
  }
}

export async function saveLoyaltyMetadata(metadata) {
  try {
    await AsyncStorage.setItem(LOYALTY_STORAGE_KEY, JSON.stringify({
      version: 1,
      visitedDays: metadata.visitedDays || [],
      milestonesClaimed: metadata.milestonesClaimed || [],
      rewards: metadata.rewards || [],
      updatedAt: new Date().toISOString(),
    }));
  } catch (error) {
    console.warn('[loyalty] Failed to persist metadata', error);
  }
}

export async function clearLoyaltyMetadata() {
  try {
    await AsyncStorage.removeItem(LOYALTY_STORAGE_KEY);
  } catch (error) {
    console.warn('[loyalty] Failed to clear metadata', error);
  }
}
