import { supabase } from './supabaseClient';
import { cartKey } from '../data/products';
export function promoItems(items) { return items.map(item => ({product_id:item.id,quantity:item.qty,line_key:cartKey(item.id,item.modifiers,item.preparationNote),modifiers:(item.modifiers||[]).map(m=>({product_id:m.id,quantity:m.quantity||1}))})); }
export function promoMessage(error) {
 const m=String(error?.message||'');
 if(m.includes('PROMO_NOT_APPLICABLE'))return 'Промокод не подходит к сумме или товарам в корзине.';
 if(m.includes('PROMO_INVALID'))return 'Промокод не найден, выключен или срок действия закончился.';
 if(['PGRST202','42883'].includes(error?.code))return 'Промокоды временно недоступны. Можно оформить заказ без промокода.';
 return 'Не удалось проверить промокод. Проверьте связь и повторите.';
}
export async function quotePromo(code,items,rewardKey=null,rewardDiscount=0) {
 const normalized=code.trim().toUpperCase();
 if(!/^[A-Z0-9_-]{2,32}$/.test(normalized))throw new Error('PROMO_INVALID');
 const {data,error}=await supabase.rpc('quote_app_promo',{p_code:normalized,p_items:promoItems(items),p_reward_key:rewardKey,p_reward_discount:rewardDiscount});
 if(error)throw error;
 if(!data||!Number.isFinite(Number(data.discount))||Number(data.discount)<0)throw new Error('INVALID_PROMO_RESPONSE');
 return {code:normalized,discount:Number(data.discount)};
}
