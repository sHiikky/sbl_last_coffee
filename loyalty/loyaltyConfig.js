// loyalty/loyaltyConfig.js
// Единый источник конфигурации программы "Серия SBL" (visit streak).
// Бизнес-правила (сколько дней, какая награда, часовой пояс) не должны
// дублироваться в UI-компонентах — они обязаны читать значения отсюда.

// Кофейня сети — Томск (см. data/products.js -> PICKUP_POINTS). Business day
// заказа всегда считается в этом часовом поясе, а не в часовом поясе телефона
// пользователя — иначе поездка в другой регион могла бы задвоить/съесть день.
export const LOYALTY_TIMEZONE = 'Asia/Tomsk';

// Один ключ в AsyncStorage под всю loyalty-метадату (rewards, milestonesClaimed,
// накопленные visitedDays). Версионируется, чтобы позже можно было делать миграции.
export const LOYALTY_STORAGE_KEY = 'sbl_loyalty_v1';

export const LOYALTY_CONFIG = {
  enabled: true,

  qualification: {
    maxMarksPerDay: 1,
    minimumOrderAmount: 0,
    // В проекте пока нет реальных статусов оплаты/заказа — единственное,
    // что попадает в orderHistory, это уже успешно оформленный заказ
    // (см. App.js -> placeOrder). Поле оставлено для будущего backend,
    // где появятся промежуточные статусы (draft/failed/cancelled).
    requiredOrderStatus: 'completed',
  },

  streak: {
    timezone: LOYALTY_TIMEZONE,
    graceDays: 0,
  },

  // Длина одного "этапа" карты (10-дневная карта). currentStreak может расти
  // бесконечно, cycleLength — только про то, как он режется на этапы для UI.
  cycleLength: 10,

  // Конфигурируемые milestone'ы. Чтобы добавить награду за 3/5/7/20/30 дней —
  // достаточно дописать объект сюда, менять логику не требуется.
  milestones: [
    {
      streakDays: 10,
      rewardType: 'free_dessert',
      rewardValue: 1,
      title: 'Десерт в подарок',
      description: 'За 10 дней подряд',
    },
  ],

  reward: {
    expiresInDays: 30,
  },

  // Стратегия применения free_dessert-награды в корзине: покрывает самый
  // дешёвый товар категории "dessert" (см. data/products.js) — награда не
  // применяется, если в корзине нет ни одного десерта.
  rewardEligibilityStrategy: 'cheapest_dessert',
};
