export type ProductEvent = {name:string;occurredAt:string;properties?:Record<string,string|number|boolean|null>};
export type AnalyticsSink = (event:ProductEvent)=>void;
/** Analytics collection is opt-in and intentionally requires a host-configured sink. */
export function createConsentAnalytics(consented:()=>boolean,sink?:AnalyticsSink){return {track(name:string,properties:ProductEvent['properties']={}){if(!sink||!consented())return;sink({name,occurredAt:new Date().toISOString(),properties});}};}
