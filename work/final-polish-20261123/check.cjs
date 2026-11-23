const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),babel=require('@babel/core');
const root=path.resolve(__dirname,'../..'),load=require('../load-domain.cjs');
const {preparationEstimate}=load('lib/preparationEstimate.js');
const start='2026-11-23T10:00:00Z',n=Date.parse(start);
assert.equal(preparationEstimate('preparing',start,n).label,'5:00');
assert.equal(preparationEstimate('preparing',start,n+61000).label,'3:59');
assert.equal(preparationEstimate('preparing',start,n+301000).overdue,true);
assert.equal(preparationEstimate('ready',start,n),null);assert.equal(preparationEstimate('new',start,n),null);
assert.equal(preparationEstimate('preparing',null,n),null);
assert.equal(preparationEstimate('preparing',start,n-5000).label,'5:00');
const {cleanProductEdgePixels}=require('../../lib/productEdgeCleanup.cjs');
const pixels=new Uint8Array(20*20*4);
for(let y=3;y<17;y++)for(let x=3;x<17;x++){const i=(y*20+x)*4;pixels.set([250,250,250,253],i);}
pixels.set([180,178,177,90],(10*20+17)*4);
pixels.set([200,60,30,180],(11*20+17)*4);
const cleaned=cleanProductEdgePixels(pixels,20,20);
assert.equal(cleaned.pixels[(10*20+17)*4+3],0,'outside neutral matte removed');
assert.equal(cleaned.pixels[(11*20+17)*4+3],180,'coloured translucent foreground preserved');
for(let y=3;y<17;y++)for(let x=3;x<17;x++)assert.equal(cleaned.pixels[(y*20+x)*4+3],253,'white dish remains opaque');
const svgMocks={};
let states=[],cursor=0,effects=[],deps=[],refs=[],refCursor=0;
const react={createElement:(type,props,...children)=>({type,props:props||{},children}),useState(initial){const i=cursor++;if(!(i in states))states[i]=initial;return[states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v}]},useRef(v){const i=refCursor++;return refs[i]??(refs[i]={current:v})},useEffect(fn,d){const i=cursor++;if(d?.length===2&&(!deps[i]||d.some((v,j)=>v!==deps[i][j]))){deps[i]=d;effects.push(fn)}}};
const code=babel.transformSync(fs.readFileSync(path.join(root,'screens/CartScreen.js'),'utf8'),{babelrc:false,configFile:false,plugins:['@babel/plugin-transform-react-jsx','@babel/plugin-transform-modules-commonjs']}).code;
const phone=load('lib/phoneInput.js'),mod={exports:{}};
const native={Platform:{OS:'web'},useWindowDimensions:()=>({width:420}),StyleSheet:{create:v=>v},Alert:{alert(){}}};
const mocks={react:{__esModule:true,default:react,...react},'react-native':native,'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:0,bottom:0})},'expo-haptics':{},'@expo/vector-icons':{},'../theme/tokens':{colors:{},spacing:{},radius:{},shadow:{},getHorizontalPadding:()=>20},'../data/products':{PICKUP_TIMES:[],PICKUP_POINTS:[],cartKey:x=>x,formatPrice:String},'../lib/phoneInput':phone,'../loyalty/loyaltyService':{getAvailableRewards:()=>[],isRewardApplicable:()=>false,getEligibleCartItemsForReward:()=>[]},'../lib/promoCodes':{},'../lib/supabaseClient':{},'../lib/checkoutQuote':{money:Number},'../lib/orderService':{},'../lib/cartOptions':{formatAdditions:()=>''},'../hooks/useBonusAccount':{__esModule:true,default:()=>({balance:0,lifetimePaid:0})},'../lib/bonusConfig':{getBonusLevel:()=>({rate:0.05}),maxRedeemable:()=>0},'../lib/ordering':{orderingState:()=>({isOpen:true})}};
vm.runInNewContext(code,{module:mod,exports:mod.exports,Date,console,require:name=>{if(name in mocks)return mocks[name];if(name.startsWith('../components/'))return name;throw Error(name)}});
function find(node,label){if(!node||typeof node!=='object')return null;if(node.props?.accessibilityLabel===label)return node;for(const child of (Array.isArray(node)?node:Object.values(node))){const r=find(child,label);if(r)return r}return null}
function render(account){cursor=0;refCursor=0;effects=[];let tree=mod.exports.default({navigation:{},cart:{coffee:{id:'coffee',qty:1,unitPrice:100}},account});const pending=effects;effects=[];pending.forEach(f=>f());cursor=0;refCursor=0;effects=[];return mod.exports.default({navigation:{},cart:{coffee:{id:'coffee',qty:1,unitPrice:100}},account});}
render(null);
let tree=render({id:'a',name:'Анна Петрова'});assert.equal(find(tree,'Ваше имя').props.value,'Анна Петрова');
find(tree,'Ваше имя').props.onChangeText('Другой получатель');
tree=render({id:'a',name:'Анна Новая'});assert.equal(find(tree,'Ваше имя').props.value,'Другой получатель');
tree=render({id:'b',name:'Борис'});assert.equal(find(tree,'Ваше имя').props.value,'Борис');
const result={ok:true,timerFromServerTimestamp:true,doesNotMarkOrderReady:true,whiteForegroundProtected:true,exteriorMatteRemoved:true,cartNameAfterLogin:true,manualRecipientPreserved:true,accountSwitchResetsName:true};fs.writeFileSync(path.join(__dirname,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
