const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),babel=require('@babel/core');
const load=require('./load-domain.cjs');
const model=load('lib/productSheetModel.js'),cartDomain=load('lib/cartOptions.js');
const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/product-palettes.json'),'utf8'));
const visualModule=load('lib/productVisuals.js',{'../data/product-palettes.json':manifest});
const source=Object.keys(manifest.photos)[0];
assert.equal(Object.keys(manifest.photos).length,45);
assert(visualModule.getProductVisual({image:{uri:source}}).hue>=0);
assert.equal(visualModule.getProductVisual({image:{uri:source+'?new-version'}}).cutout,null);
assert.equal(visualModule.getProductVisual({image:{uri:source+'?new-version'}}).hue,32,'new photo cannot inherit an old palette');
assert.equal(model.availableProductQuantity(98),1);assert.equal(model.availableProductQuantity(99),0);
assert(model.productSheetHeight(400,30)<=358);assert(model.productSheetHeight(800,44)<800);
let counts={};for(let i=0;i<20;i++)counts=model.changeAdditionCount(counts,'m'+i,1);
assert.equal(model.changeAdditionCount(counts,'extra',1),counts);
assert.equal(model.changeAdditionCount({m:10},'m',1).m,10);
assert.equal(model.changeAdditionCount({m:0},'m',-1).m,0);
const tokens=load('theme/tokens.js'),material=load('theme/productSheet.js',{'./tokens':tokens});
const base={id:'coffee',name:'Кофе',displayName:'Кофе',menuCategory:'Напитки',menuSubcategory:'Кофе',sizeLabel:'200 мл',price:280,isAvailable:true,image:{uri:source}};
const large={...base,id:'large',sizeLabel:'400 мл',price:340};
const syrup={id:'syrup',name:'Сироп',displayName:'Сироп',price:30,isAvailable:true};
const milk={id:'milk',name:'Молоко',price:25,isAvailable:true};
function makeScreen(extra={}){
  let slots=[],cursor=0;const calls=[],backs=[],animations=[],effects=[],keyboardListeners={}; let keyboardDismissed=0;
  const React={createElement:(type,props,...children)=>({type,props:{...props,children}}),Fragment:'Fragment',
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},
    useRef(initial){const i=cursor++;if(!(i in slots))slots[i]={current:initial};return slots[i];},
    useMemo(fn){cursor++;return fn();},useCallback(fn){cursor++;return fn;},useEffect(fn){cursor++;effects.push(fn);}};
  class Value{constructor(n){this.n=n;}setValue(n){this.n=n;}interpolate(){return 0;}stopAnimation(){}}
  const Animated={Value,View:'AnimatedView',timing:(_value,config)=>({start:callback=>animations.push({config,callback}),stop(){}}),spring:()=>({start(){}})};
  const native={Platform:{OS:extra.platform||'ios'},Keyboard:{addListener:(name,callback)=>{keyboardListeners[name]=callback;return{remove:()=>delete keyboardListeners[name]};},dismiss:()=>{keyboardDismissed++;}},View:'View',Text:'Text',TextInput:'TextInput',ScrollView:'ScrollView',Pressable:'Pressable',KeyboardAvoidingView:'KeyboardAvoidingView',Share:{share:async()=>{}},
    StyleSheet:{create:x=>x,absoluteFill:{}},Animated,Easing:{in:x=>x,out:x=>x,cubic:1},useWindowDimensions:()=>({width:390,height:844}),PanResponder:{create:config=>({panHandlers:config})},BackHandler:{addEventListener:()=>({remove(){}})}};
  const mocks={react:React,'react-native':native,'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:44,bottom:34})},'@react-navigation/native':{useFocusEffect(){}},'expo-status-bar':{StatusBar:'StatusBar'},'expo-haptics':{impactAsync:async()=>{},selectionAsync:async()=>{},ImpactFeedbackStyle:{Light:'light'}},'@expo/vector-icons':{Ionicons:'Icon'},'expo-linear-gradient':{LinearGradient:'Gradient'},
    '../theme/tokens':tokens,'../theme/productSheet':material,'../data/products':{cartKey:cartDomain.optionCartKey,formatPrice:n=>`${n} ₽`},'../lib/cartOptions':cartDomain,'../lib/photoComposition':{getPhotoComposition:()=>({fit:'contain',zoom:.9,offsetX:0,offsetY:0})},'../lib/productVisuals':visualModule,'../lib/productSheetModel':model,'../lib/productLinks':{shareProduct:async()=>({copied:true})},'../hooks/useMotionPreference':()=>extra.motionPreference||({reduceMotion:true,ready:true}),'../lib/modifierGroups':load('lib/modifierGroups.js'),'../lib/additionsPresentation':load('lib/additionsPresentation.js')};
  const code=babel.transformSync(fs.readFileSync(path.join(__dirname,'../screens/ProductScreen.js'),'utf8'),{babelrc:false,configFile:false,plugins:['@babel/plugin-transform-react-jsx','@babel/plugin-transform-modules-commonjs']}).code;
  const mod={exports:{}};vm.runInNewContext(code,{module:mod,exports:mod.exports,console,require:n=>{if(n in mocks)return mocks[n];if(n.startsWith('../components/'))return n;throw Error(n);}});
  const props={route:{params:{product:base}},navigation:{goBack:()=>backs.push('back'),navigate(){}},products:[base,large],modifiers:[syrup,milk],onAddToCart:(...args)=>{calls.push(args);return true;},...extra};
  const render=()=>{cursor=0;effects.length=0;return mod.exports.default(props);};
  return{props,render,calls,backs,animations,effects,keyboardListeners,get keyboardDismissed(){return keyboardDismissed;}};
}
function all(node,predicate){if(!node||typeof node!=='object')return[];return [...(predicate(node)?[node]:[]),...(node.props?.children||[]).flat(Infinity).flatMap(n=>all(n,predicate))];}
const label=(tree,text)=>all(tree,n=>n.props?.accessibilityLabel===text)[0];
const add=tree=>all(tree,n=>n.props?.accessibilityLabel?.startsWith('Добавить в корзину '))[0];
const ui=makeScreen();let tree=ui.render();
label(tree,'Сиропы')?.props.onPress();tree=ui.render(); // при одной группе вкладок нет
label(tree,'Добавить добавку Сироп').props.onPress();tree=ui.render();label(tree,'Добавить добавку Сироп').props.onPress();tree=ui.render();
label(tree,'Увеличить количество напитков').props.onPress();tree=ui.render();assert.equal(add(tree).props.accessibilityLabel,'Добавить в корзину 2 шт. за 680 ₽');
label(tree,'Пожелание бариста').props.onPress();tree=ui.render();label(tree,'Пожелание к позиции').props.onChangeText('Без\t трубочки');tree=ui.render();
label(tree,'Пожелание бариста').props.onPress();tree=ui.render();label(tree,'Пожелание бариста').props.onPress();tree=ui.render();assert.equal(label(tree,'Пожелание к позиции').props.value,'Без трубочки');
const submit=add(tree);submit.props.onPress();submit.props.onPress();assert.equal(ui.calls.length,1,'one atomic add on double tap');assert.equal(ui.calls[0][3],2);assert.equal(ui.calls[0][1][0].quantity,2);assert.equal(ui.calls[0][2],'Без трубочки');
assert.equal(ui.animations.at(-1).config.duration,0,'Reduced Motion closes instantly');ui.animations.at(-1).callback({finished:true});assert.equal(ui.backs.length,1);
const changed=makeScreen();tree=changed.render();label(tree,'Объём 400 мл, 340 ₽').props.onPress();tree=changed.render();assert.equal(add(tree).props.accessibilityLabel,'Добавить в корзину 1 шт. за 340 ₽');
changed.props.products=[base,{...large,price:390}];tree=changed.render();assert.equal(add(tree).props.accessibilityLabel,'Добавить в корзину 1 шт. за 390 ₽','live SKU price after refresh');
const stopped=makeScreen();tree=stopped.render();label(tree,'Сиропы')?.props.onPress();tree=stopped.render();label(tree,'Добавить добавку Сироп').props.onPress();stopped.props.modifiers=[milk];tree=stopped.render();assert(label(tree,'Позиция недоступна').props.disabled);label(tree,'Позиция недоступна').props.onPress();assert.equal(stopped.calls.length,0);
const full=makeScreen({cart:{coffee:cartDomain.makeCartItem(base,[],99)}});tree=full.render();assert(label(tree,'В корзине уже 99').props.disabled);
const refused=makeScreen({onAddToCart:()=>false});tree=refused.render();add(tree).props.onPress();assert.equal(refused.animations.length,0,'rejected add never closes as success');
const motionPreference={reduceMotion:true,ready:false};const entrance=makeScreen({motionPreference});entrance.render();entrance.effects[1]();assert.equal(entrance.animations.length,0,'wait for the actual OS preference');
motionPreference.ready=true;motionPreference.reduceMotion=false;entrance.render();entrance.effects[1]();assert.equal(entrance.animations[0].config.duration,340,'normal entrance slides after preference resolves');
entrance.effects[1]();assert.equal(entrance.animations.length,1,'preference updates never replay the entrance');
// Run the actual App callback independently to verify batch merging and current prices.
const app=fs.readFileSync(path.join(__dirname,'../App.js'),'utf8');const start=app.indexOf('  const addToCart = '),end=app.indexOf('  const refreshCheckoutPrices',start);
let merged={},updates=0;const body=app.slice(start,end)+'\nreturn addToCart;';
let loginRoute=null;const navigationRef={current:{navigate:name=>{loginRoute=name;}}};
const makeAppAdd=(account,items=[base])=>new Function('account','navigationRef','products','modifiers','makeCartItem','setCart','additionTitle','presentAdditions',body)(account,navigationRef,items,[{...syrup,price:35}],cartDomain.makeCartItem,fn=>{updates++;merged=fn(merged);},load('lib/additionsPresentation.js').additionTitle,load('lib/additionsPresentation.js').presentAdditions);
const guestAdd=makeAppAdd(null);assert.equal(guestAdd(base,[],'',1),'auth','guest cannot add: login required');assert.equal(loginRoute,'Login');assert.equal(updates,0,'guest add never touches the cart');
const appAdd=makeAppAdd({id:'user',phone:'+79990000000'});
appAdd(base,[{...syrup,quantity:2}], 'Ваниль',3);const line=Object.values(merged)[0];assert.equal(line.qty,3);assert.equal(line.unitPrice,350);assert.equal(updates,1);
appAdd(base,[{...syrup,quantity:2}],'Ваниль',2);assert.equal(Object.values(merged)[0].qty,5);assert.equal(Object.keys(merged).length,1);
assert.equal(appAdd(base,[{id:'missing',quantity:1}],'',1),false);
const toast={...base,id:'toast',menuCategory:'Еда'};assert.equal(makeAppAdd({id:'user'},[toast])(toast,[{...syrup,quantity:1}],'',1),false,'no syrup/milk additions on food');
console.log('PASS: actual product sheet quantities, modifiers, note preservation, double-tap guard, SKU/price refresh, stop-list, capacity, Reduced Motion, rejected add; actual App batch cart merge and current modifier prices');

const android=makeScreen({platform:'android',products:[{...base,nutrition:{calories:0,protein:2,fat:3,carbs:4},nutritionBasis:'portion'}]});
let androidTree=android.render();
assert.equal(all(androidTree,n=>n.type==='KeyboardAvoidingView')[0].props.behavior,'height');
assert.equal(label(androidTree,'Подробнее о позиции'),undefined);
assert.ok(all(androidTree,n=>n.props?.children?.includes('Ккал')).length,'Nutrition is visible before any tap, including zero calories');
label(androidTree,'Пожелание бариста').props.onPress();androidTree=android.render();
const scroll=all(androidTree,n=>n.type==='ScrollView'&&n.props.ref)[0];let scrolls=0;scroll.props.ref.current={scrollToEnd:()=>scrolls++};
label(androidTree,'Пожелание к позиции').props.onFocus();assert.equal(scrolls,1);
const keyboardCleanup=android.effects[4]();android.keyboardListeners.keyboardDidShow();androidTree=android.render();
assert.equal(add(androidTree),undefined,'Keyboard editing frees space occupied by checkout dock');
assert.ok(scrolls>=2,'After keyboard layout the note is brought back into view');
label(androidTree,'Пожелание к позиции').props.onChangeText('Без сахара');
label(androidTree,'Закончить ввод пожелания').props.onPress();assert.equal(android.keyboardDismissed,1);
android.keyboardListeners.keyboardDidHide();androidTree=android.render();
assert.ok(add(androidTree),'Dock returns when the keyboard closes');assert.equal(label(androidTree,'Пожелание к позиции').props.value,'Без сахара');
keyboardCleanup();assert.equal(Object.keys(android.keyboardListeners).length,0);
console.log('PASS: Android keyboard scrolling, Done, dock restoration, note preservation and always-visible nutrition');
