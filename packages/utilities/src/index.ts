export function slugify(value:string){return value.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,60);}
export function formatCoins(value:number|bigint){return new Intl.NumberFormat(undefined,{maximumFractionDigits:0}).format(Number(value));}
export function clamp(value:number,min:number,max:number){return Math.min(max,Math.max(min,value));}
export function safeExternalUrl(value:string){const url=new URL(value);if(!['http:','https:'].includes(url.protocol))throw new TypeError('Only HTTP and HTTPS links are allowed.');return url.toString();}
