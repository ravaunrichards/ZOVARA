import { api, jsonBody } from '@zovara/api-client';
export type CoinPack = {id:'starter'|'creator'|'studio';coins:number;priceCents:number;currency:string;title:string};
export async function listCoinPacks() { return (await api<{packs:CoinPack[]}>('/api/wallet/packs')).packs; }
export async function startCardCheckout(packId:CoinPack['id']) { return api<{checkoutUrl:string;provider:'stripe';status:'pending'}>('/api/payments/stripe/checkout',{method:'POST',body:jsonBody({packId})}); }
export async function sendGift(recipientUsername:string,giftId:'spark'|'bloom'|'orbit'|'crown') { return api<{giftId:string;balanceCoins:number}>('/api/gifts/send',{method:'POST',body:jsonBody({recipientUsername,giftId})}); }
// The server, never this client, validates payment events and changes wallet balances.
