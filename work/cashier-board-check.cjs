const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../kassa-terminal/index.html'), 'utf8');
const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
assert.equal(inline.length, 1);
new vm.Script(inline[0][1]);
const source = inline[0][1].replace(/\}\)\(\);\s*$/, `
  window.cashierTest = {
    loadOrders, stopBoard, handleAction, changeOrderStatus, loadStopList,
    state: () => ({ orders: ordersCache, active: boardActive, choices: completionChoices, loading: !!loadInFlight })
  };
})();`);
const clone = value => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

class EventTarget {
  constructor() { this.events = new Map(); }
  addEventListener(name, callback) { if (!this.events.has(name)) this.events.set(name, new Set()); this.events.get(name).add(callback); }
  removeEventListener(name, callback) { this.events.get(name)?.delete(callback); }
  async fire(name, event = {}) { for (const cb of [...(this.events.get(name) || [])]) await cb({ preventDefault() {}, ...event }); }
  listenerCount() { return [...this.events.values()].reduce((sum, listeners) => sum + listeners.size, 0); }
}
class Element extends EventTarget {
  constructor(tag) {
    super(); this.tagName = tag; this.children = []; this.dataset = {}; this.style = {}; this.className = '';
    this.value = ''; this.disabled = false; this.checked = false; this._text = '';
    this.classList = {
      contains: name => this.className.split(/\s+/).includes(name),
      add: name => { if (!this.classList.contains(name)) this.className += ' ' + name; },
      remove: name => { this.className = this.className.split(/\s+/).filter(value => value !== name).join(' '); },
      toggle: (name, force) => { const add = force == null ? !this.classList.contains(name) : force; if (add) this.classList.add(name); else this.classList.remove(name); return add; },
    };
  }
  appendChild(child) { this.children.push(child); return child; }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; this._text = ''; }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(' '); }
}

function createHarness(initial = []) {
  const roots = new Map([...html.matchAll(/id="([^"]+)"/g)].map(match => [match[1], new Element('div')]));
  const document = new EventTarget(); document.visibilityState = 'visible'; document.head = new Element('head');
  document.getElementById = id => { assert(roots.has(id), 'Unknown DOM ID: ' + id); return roots.get(id); };
  document.createElement = tag => new Element(tag);
  function descendants(el) { return [el, ...el.children.flatMap(descendants)]; }
  const elements = () => [...roots.values()].flatMap(descendants);
  document.querySelectorAll = selector => elements().filter(el => {
    if (selector.startsWith('.')) return el.classList.contains(selector.slice(1));
    const name = selector.slice(6, -1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    return Object.hasOwn(el.dataset, name);
  });
  document.head.appendChild = script => { queueMicrotask(() => script.onload?.()); return script; };
  const window = new EventTarget(); const navigator = { onLine: true }; const timers = new Map();
  let nextTimer = 0, oscillators = 0, authCallback;
  const state = { orders: clone(initial), products: [{ id: 'coffee', name: 'Кофе', display_name: null, is_available: true, is_modifier: false }, { id: 'syrup', name: 'Сироп', display_name: null, is_available: true, is_visible: false, is_modifier: true }], staff: true,
    reads: 0, activeReads: 0, maxReads: 0, plans: [], rpcCalls: [], rpcPlans: [], invokes: [], channels: [], filters: [], signOuts: 0, notificationsFail: false };
  const db = {
    auth: {
      onAuthStateChange(cb) { authCallback = cb; },
      async signInWithPassword() { return { data: { user: { id: 'staff-user' } } }; },
      async signOut() { state.signOuts++; authCallback?.('SIGNED_OUT'); return {}; },
    },
    from(table) {
      assert(['orders', 'products', 'staff'].includes(table), 'Unexpected table');
      const query = {
        select(fields) { this.fields = fields; return this; },
        eq(key, value) { state.filters.push([table, key, value]); return this; },
        or(filter) { this.filter = filter; return this; },
        async maybeSingle() { return { data: state.staff ? { user_id: 'staff-user' } : null }; },
        order() {
          if (table === 'products') {
            assert(this.fields.includes('is_modifier'));
            assert.equal(this.filter, 'is_visible.eq.true,is_modifier.eq.true', 'Hidden modifier rows must also be manageable');
            return Promise.resolve({ data: clone(state.products) });
          }
          assert.equal(table, 'orders'); assert(this.fields.includes('customer_phone')); assert(this.fields.includes('modifiers')); assert(this.fields.includes('preparation_note'));
          assert(this.filter.includes('manual_sale_recorded_at.is.null'));
          state.reads++; state.activeReads++; state.maxReads = Math.max(state.maxReads, state.activeReads);
          const plan = state.plans.shift();
          return (plan ? plan.promise : Promise.resolve({ data: clone(state.orders) }))
            .finally(() => { state.activeReads--; });
        },
      };
      return query;
    },
    async rpc(name, args) {
      state.rpcCalls.push({ name, args: clone(args) });
      const plan = state.rpcPlans.shift(); if (plan) return plan.promise;
      if (name === 'update_order_status') {
        const order = state.orders.find(order => order.id === args.p_order_id); assert(order);
        order.status = args.p_status;
        if (args.p_payment_confirmed) order.paid_at ||= '2026-10-29T05:00:00Z';
        if (args.p_manual_sale_recorded) order.manual_sale_recorded_at ||= '2026-10-29T05:00:01Z';
        return { data: clone(order) };
      }
      assert.equal(name, 'set_product_availability');
      state.products.find(product => product.id === args.p_product_id).is_available = args.p_available;
      return { data: true };
    },
    functions: { async invoke(name, options) { state.invokes.push({ name, options: clone(options) }); return state.notificationsFail ? { error: new Error('offline notification') } : { data: {} }; } },
    channel(name) {
      const channel = { name, events: [], removed: false,
        on(_name, filter, callback) { this.events.push({ filter, callback }); return this; },
        subscribe(callback) { this.status = callback; return this; } };
      state.channels.push(channel); return channel;
    },
    removeChannel(channel) { channel.removed = true; return Promise.resolve(); },
  };
  window.supabase = { createClient: () => db };
  window.AudioContext = class { constructor() { this.state = 'running'; this.currentTime = 0; }
    createOscillator() { return { frequency: {}, connect() {}, start() { oscillators++; }, stop() {} }; }
    createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }; }
  };
  let confirmValue = true;
  vm.runInNewContext(source, { window, document, navigator, console: { warn() {}, error() {} },
    confirm: () => confirmValue, setInterval(cb, ms) { timers.set(++nextTimer, { cb, ms }); return nextTimer; },
    clearInterval(id) { timers.delete(id); }, queueMicrotask, setTimeout, clearTimeout });
  const test = window.cashierTest;
  const get = id => document.getElementById(id);
  const action = (id, kind) => elements().find(el => el.dataset.orderId === id && el.dataset.orderAction === kind);
  const choice = (id, kind) => elements().find(el => el.dataset.orderId === id && el.dataset.orderChoice === kind);
  async function click(button) { assert(button, 'Missing button'); if (!button.disabled) await button.fire('click'); await flush(); }
  async function setChoice(id, kind, checked) { const el = choice(id, kind); assert(el); assert(!el.disabled); el.checked = checked; await el.fire('change'); }
  async function login() { await flush(); get('emailInput').value = 'cashier@example.test'; get('passwordInput').value = 'not-a-real-password'; await get('loginForm').fire('submit'); await flush(); }
  return { state, test, get, action, choice, click, setChoice, login, window, document, navigator, timers,
    soundCount: () => oscillators / 2, setConfirm: value => { confirmValue = value; } };
}

function order(id, status = 'new', extra = {}) {
  return { id, order_number: id, status, total: 320, bonus_redeemed: 20, created_at: '2026-10-29T05:00:00Z',
    customer_name: 'Анна', customer_phone: '+79001234567', pickup_point: 'Ленина, 72', pickup_at: '2026-10-29T06:00:00Z',
    payment_method: 'on_pickup', comment: 'Без крышки <не HTML>', paid_at: null, manual_sale_recorded_at: null,
    order_items: [{ product_name: 'Капучино', quantity: 2, price: 160, base_unit_price: 100, preparation_note: 'Сироп ваниль <img src=x onerror=alert(1)>',
      modifiers: [{ product_id: 'syrup', name: 'Сироп', quantity: 2, unit_price: 30 }] }], ...extra };
}

(async () => {
  {
    const h = createHarness([order('new'), order('legacy', 'new', { customer_name: null, customer_phone: null, pickup_point: null, pickup_at: null, comment: null, order_items: [{ product_name: 'Старый кофе', quantity: 1 }] })]);
    await h.login();
    const text = h.get('colNew').textContent;
    for (const value of ['Анна', '+79001234567', 'Ленина, 72', '13:00', 'Томск', '<не HTML>', 'Капучино', '× 2', 'всего 4', '300 ₽', 'Пожелание: Сироп ваниль <img src=x onerror=alert(1)>', 'Телефон не сохранён', 'Время не сохранено']) assert(text.includes(value), 'Missing card detail: ' + value);
    const children = el => [el, ...el.children.flatMap(children)];
    const preparation = children(h.get('colNew')).find(el => el.textContent.startsWith('Пожелание: '));
    assert(preparation); assert.equal(preparation.children.length, 0, 'Preparation note must be a text node, not parsed HTML');
    assert.equal(h.soundCount(), 0, 'Existing baseline orders must be silent');
    console.log('PASS: contact/pickup in Tomsk, comments, historical orders, modifier quantities per portion and exact cash due');
  }
  {
    const h = createHarness([order('ready', 'ready')]); h.state.notificationsFail = true; await h.login();
    assert(h.action('ready', 'complete').disabled);
    assert.equal(await h.test.handleAction(h.state.orders[0], 'ready'), false);
    assert.equal(h.state.rpcCalls.length, 0, 'Cannot complete without money confirmation');
    await h.setChoice('ready', 'payment', true);
    assert(!h.action('ready', 'complete').disabled);
    await h.click(h.action('ready', 'complete'));
    assert.deepEqual(h.state.rpcCalls[0], { name: 'update_order_status', args: { p_order_id: 'ready', p_status: 'completed', p_payment_confirmed: true, p_manual_sale_recorded: false } });
    assert.equal(h.get('countAccounting').textContent, '1', 'Unrecorded sale stays in the accounting queue');
    assert.equal(h.get('countReady').textContent, '0');
    assert.equal(h.state.invokes[0].name, 'dispatch-order-notifications');
    assert.equal(h.state.invokes[0].options.body.orderId, 'ready');
    await h.click(h.action('ready', 'accounting'));
    assert.deepEqual(h.state.rpcCalls[1].args, { p_order_id: 'ready', p_status: 'completed', p_payment_confirmed: true, p_manual_sale_recorded: true });
    assert.equal(h.get('countAccounting').textContent, '0');
    assert(h.test.state().active, 'Notification failure cannot block the cashier');
    console.log('PASS: explicit received-money confirmation, optional manual SBIS entry, later accounting confirmation and non-blocking notification failure');
  }
  {
    const h = createHarness([order('ready', 'ready')]); await h.login(); await h.setChoice('ready', 'payment', true);
    h.state.orders[0].total = 420; await h.test.loadOrders(); await flush();
    assert(h.action('ready', 'complete').disabled, 'Changed amount requires a fresh payment confirmation');
    assert.equal(h.choice('ready', 'payment').checked, false);
    h.setConfirm(false); await h.click(h.action('ready', 'cancel')); assert.equal(h.state.rpcCalls.length, 0);
    h.setConfirm(true); await h.click(h.action('ready', 'cancel'));
    assert.deepEqual(h.state.rpcCalls[0].args, { p_order_id: 'ready', p_status: 'cancelled', p_payment_confirmed: false, p_manual_sale_recorded: false });
    console.log('PASS: changed cash amount clears confirmation and cancellation uses the staff RPC');
  }
  {
    const h = createHarness([order('a')]); await h.login(); const gate = deferred(); h.state.rpcPlans.push(gate);
    const first = h.test.handleAction(h.state.orders[0], 'new'); await flush();
    assert(h.action('a', 'new').disabled);
    assert.equal(await h.test.handleAction(h.state.orders[0], 'new'), false);
    assert.equal(h.state.rpcCalls.length, 1);
    h.state.orders[0].status = 'preparing'; gate.resolve({ data: {} }); await first; await flush();
    assert.equal(h.get('countPreparing').textContent, '1');
    console.log('PASS: double clicks cannot submit duplicate status changes');
  }
  {
    const h = createHarness([order('baseline')]); await h.login(); const channel = h.state.channels.at(-1);
    const slow = deferred(); h.state.plans.push(slow); channel.events[0].callback(); await flush();
    assert.equal(h.state.activeReads, 1);
    h.state.orders.push(order('fresh')); channel.events[1].callback(); channel.status('SUBSCRIBED');
    slow.resolve({ data: [order('stale')] }); await flush();
    assert.deepEqual(clone(h.test.state().orders.map(o => o.id)), ['baseline', 'fresh']);
    assert.equal(h.state.maxReads, 1, 'Realtime reloads are single-flight');
    assert.equal(h.soundCount(), 1);
    channel.events[0].callback(); await flush(); [...h.timers.values()].find(t => t.ms === 25000).cb(); await flush();
    assert.equal(h.soundCount(), 1, 'Repeated realtime/poll snapshots must be silent');
    const reads = h.state.reads; channel.status('SUBSCRIBED'); await flush(); assert(h.state.reads > reads);
    h.navigator.onLine = false; await h.window.fire('offline'); assert(h.action('fresh', 'new').disabled);
    assert(h.get('boardStatusText').textContent.includes('Нет связи'));
    h.state.orders.push(order('after-offline')); h.navigator.onLine = true; await h.window.fire('online'); await flush();
    assert(!h.action('after-offline', 'new').disabled); assert.equal(h.soundCount(), 2);
    const afterOnline = h.state.reads; await h.window.fire('focus'); await h.document.fire('visibilitychange'); await flush(); assert(h.state.reads > afterOnline);
    console.log('PASS: queued single-flight reads discard stale snapshots; reconnect, foreground and polling recover missed orders without duplicate sounds');
  }
  {
    const h = createHarness([order('old-session')]); await h.login(); const oldChannel = h.state.channels.at(-1);
    const slow = deferred(); h.state.plans.push(slow); const loading = h.test.loadOrders(); await flush();
    await h.click(h.get('logoutBtn')); assert(!h.test.state().active); assert.equal(h.timers.size, 0); assert(oldChannel.removed);
    assert.equal(h.window.listenerCount(), 0); assert.equal(h.document.listenerCount(), 0); assert.equal(h.get('colNew').textContent, '');
    h.state.orders = [order('new-session')]; await h.login(); slow.resolve({ data: [order('old-session')] }); await loading; await flush();
    assert.deepEqual(clone(h.test.state().orders.map(o => o.id)), ['new-session']);
    assert.equal(h.soundCount(), 0);
    console.log('PASS: logout removes timers/listeners/channel and a late old-session response cannot expose old orders');
  }
  {
    const h = createHarness([]); await h.login(); await h.click(h.get('stopListBtn')); await flush();
    assert(h.get('stopListRows').textContent.includes('Добавка: Сироп'));
    await h.click(h.get('stopListRows').children[0].children[1]);
    assert.deepEqual(h.state.rpcCalls[0], { name: 'set_product_availability', args: { p_product_id: 'coffee', p_available: false, p_expected: true } });
    assert.equal(h.state.products[0].is_available, false);
    await h.click(h.get('stopListRows').children[1].children[1]);
    assert.deepEqual(h.state.rpcCalls[1], { name: 'set_product_availability', args: { p_product_id: 'syrup', p_available: false, p_expected: true } });
    assert.equal(h.state.products[1].is_available, false);
    const outsider = createHarness(); outsider.state.staff = false; await outsider.login();
    assert(!outsider.test.state().active); assert.equal(outsider.state.channels.length, 0); assert(outsider.get('loginError').textContent.includes('только у сотрудников'));
    console.log('PASS: products and hidden modifiers use the expected-state stop-list RPC; a non-staff account cannot open the board');
  }
  console.log('PASS: cashier board behavior and JavaScript syntax');
})().catch(error => { console.error(error); process.exitCode = 1; });
