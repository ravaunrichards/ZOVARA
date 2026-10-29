export const DEFAULT_LOCALE = 'en-JM';
export const DEFAULT_TIME_ZONE = 'America/Jamaica';
export function formatMoney(value, currency='USD', locale=DEFAULT_LOCALE) { return new Intl.NumberFormat(locale,{style:'currency',currency}).format(value); }
export function formatDate(value, locale=DEFAULT_LOCALE, timeZone=DEFAULT_TIME_ZONE) { return new Intl.DateTimeFormat(locale,{dateStyle:'medium',timeStyle:'short',timeZone}).format(new Date(value)); }
