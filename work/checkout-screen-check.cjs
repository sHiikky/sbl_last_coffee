const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('node:assert/strict'), babel = require('@babel/core');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'screens/CartScreen.js'), 'utf8');
const code = babel.transformSync(source, { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-modules-commonjs', '@babel/plugin-transform-react-jsx'] }).code;
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
function makeScreen({ rpcError = null, storageError = null, saveError = null } = {}) {
  const alerts = [], calls = [], orders = [];
  let stateIndex = 0;
  const React = {
    createElement(type, props, ...children) { return { type, props: props || {}, children }; },
    useState(initial) { const index=stateIndex++; let value = index===4?'Test':index===5?'+79990000001':initial; return [value, next => { value = typeof next === 'function' ? next(value) : next; }]; },
    useRef(value) { return { current: value }; },
    useEffect() {},
  };
  const native = {
    Platform: { OS: 'web' }, useWindowDimensions: () => ({ width: 390 }),
    StyleSheet: { create: x => x }, Alert: { alert: (...args) => alerts.push(args) },
  };
  for (const name of ['View','Text','TextInput','TouchableOpacity','FlatList','ScrollView','KeyboardAvoidingView']) native[name] = name;
  const service = {
    async getPendingCheckoutAttempt() { return null; },
    async savePendingCheckoutAttempt(payload) { if (saveError) throw saveError; calls.push(['save',payload]); },
    async clearPendingCheckoutAttempt() { if (storageError) throw storageError; },
    async markPendingCheckoutAttemptState() {},
    generateIdempotencyKey: () => 'key', buildRequestFingerprint: payload => JSON.stringify(payload),
    async createOrder(payload) { calls.push(['rpc',payload]); await flush(); if (rpcError) throw rpcError; return { id:'order', order_number:15, total:100, bonus_redeemed:0, status:'ready', created_at:'2026-10-12T00:00:00Z' }; },
    classifyOrderError: error => error.message.startsWith('PRICE_CHANGED') ? { type:'deterministic', code:'PRICE_CHANGED' } : { type:'unknown', code:null },
    CHECKOUT_ATTEMPT_STATE: { SUBMITTING:'submitting', UNKNOWN:'unknown' }, CHECKOUT_RECOVERY_OUTCOME: {},
  };
  const mocks = {
    react: { __esModule:true, default:React, ...React }, 'react-native': native,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top:0,bottom:0 }) },
    'expo-haptics': { notificationAsync:async()=>{}, selectionAsync:async()=>{}, NotificationFeedbackType:{Success:'success',Error:'error'} },
    '@expo/vector-icons': { Ionicons:'Icon' },
    '../theme/tokens': { colors:{}, spacing:{}, radius:{}, shadow:{}, getHorizontalPadding:()=>16 },
    '../data/products': { PICKUP_TIMES:['10','15'], PICKUP_POINTS:['SBL'], formatPrice:String, cartKey:String },
    '../loyalty/loyaltyService': { getAvailableRewards:()=>[], isRewardApplicable:()=>false, getEligibleCartItemsForReward:()=>[] },
    '../lib/supabaseClient': { getUserOrThrow:async()=>({id:'guest'}) },
    '../lib/checkoutQuote': { money:n=>Math.round(n*100)/100, buildCheckoutQuote:(_items,payable)=>({items:[['coffee',1,100]],payable}) },
    '../lib/orderService': service,
    '../lib/cartOptions':{formatAdditions:()=>''},
    '../lib/phoneInput':require('./load-domain.cjs')('lib/phoneInput.js'),
    '../lib/ordering':{CAFE:{pointId:'lenina-72'},validateContact:x=>x,orderingState:()=>({isOpen:true}),fetchOrderingConfig:async()=>({}),formatPickupTime:()=> '12:00'},
    '../hooks/useBonusAccount': { __esModule:true, default:()=>({balance:0,lifetimePaid:0,refresh:async()=>{}}) },
    '../lib/bonusConfig': { getBonusLevel:()=>({rate:0.05}), maxRedeemable:()=>0 },
  };
  const moduleObject = { exports:{} };
  vm.runInNewContext(code, { module:moduleObject,exports:moduleObject.exports,console:{warn(){}},globalThis:{alert:msg=>alerts.push(msg)},require:n=>{
    if(n in mocks)return mocks[n];
    if(n.startsWith('../components/'))return {__esModule:true,default:n};
    throw Error(n);
  } });
  let refreshed=0;
  const tree=moduleObject.exports.default({ navigation:{},cart:{coffee:{id:'coffee',qty:1,unitPrice:100}},products:[],onOrder:x=>orders.push(x),onRefreshCheckout:async()=>{refreshed++;},loyaltyState:{rewards:[],refresh:async()=>{} } });
  function find(node) {
    if (!node || typeof node !== 'object') return null;
    if(node.props?.fullWidth && node.props?.haptic==='success')return node;
    for(const child of (Array.isArray(node)?node:Object.values(node))){ const result=find(child);if(result)return result; }
  }
  const button=find(tree);assert(button,'checkout button exists');
  return { click:button.props.onPress,calls,orders,alerts,getRefreshed:()=>refreshed };
}
(async()=>{
  const accepted=makeScreen({storageError:new Error('disk unavailable')});
  await Promise.all([accepted.click(),accepted.click()]);
  assert.equal(accepted.calls.filter(c=>c[0]==='rpc').length,1);
  assert.equal(accepted.orders.length,1);assert.equal(accepted.orders[0].serverStatus,'ready');
  assert.equal(accepted.orders[0].orderedItems[0].qty,1);assert.equal(accepted.alerts.length,0);
  console.log('PASS: double tap creates one request; successful server order survives local cleanup failure and keeps authoritative status/items');
  const beforeSend=makeScreen({saveError:new Error('storage unavailable')});
  await beforeSend.click(); await beforeSend.click();
  assert.equal(beforeSend.calls.filter(c=>c[0]==='rpc').length,0);assert.equal(beforeSend.alerts.length,2);
  console.log('PASS: failed pre-submit persistence sends no order and releases the button');
  const changed=makeScreen({rpcError:new Error('PRICE_CHANGED: review')});await changed.click();
  assert.equal(changed.orders.length,0);assert.equal(changed.getRefreshed(),1);
  assert.equal(changed.calls.filter(c=>c[0]==='rpc').length,1);
  assert.equal(changed.alerts.length,1);
  console.log('PASS: changed price refreshes cart, reports failure and never retries checkout automatically');
})().catch(error=>{console.error(error);process.exitCode=1;});
