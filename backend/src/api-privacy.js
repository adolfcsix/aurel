/**
 * API responses include client, rental and receipt data. Do not allow browsers
 * or intermediaries to persist authenticated responses in an HTTP cache.
 * Applies also to errors and to account/session endpoints.
 */
export function apiPrivacyHeaders(_req,res,next){
 res.setHeader('Cache-Control','no-store, max-age=0');
 res.setHeader('Pragma','no-cache');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','no-referrer');
 next();
}
