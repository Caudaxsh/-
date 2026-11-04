// 選用:Cloudflare Worker 報價代理。
// 若瀏覽器直連 Yahoo Finance 被 CORS 擋下,部署這支 Worker,把它的網址填進「設定 → 進階 → 報價代理網址」。
// 只轉發 Yahoo 的 chart / search 兩個公開 API,並加上 CORS 標頭;不是通用代理,也不會經手任何薪資資料。
//
// 部署:Cloudflare Dashboard → Workers & Pages → Create → Hello World → 把本檔內容貼上 → Deploy。
// 之後把 https://<name>.<account>.workers.dev 貼到網站設定。
const ALLOWED = [
  { host: 'query1.finance.yahoo.com', path: /^\/v8\/finance\/chart\// },
  { host: 'query2.finance.yahoo.com', path: /^\/v1\/finance\/search/ },
  { host: 'query1.finance.yahoo.com', path: /^\/v1\/finance\/search/ },
];
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-methods': 'GET, OPTIONS', 'access-control-allow-headers': '*' };

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const target = new URL(request.url).searchParams.get('u');
    let u;
    try { u = new URL(target); } catch (e) { return new Response('bad url', { status: 400, headers: CORS }); }
    if (u.protocol !== 'https:' || !ALLOWED.some((a) => a.host === u.hostname && a.path.test(u.pathname))) {
      return new Response('forbidden', { status: 403, headers: CORS });
    }
    const upstream = await fetch(u.toString(), { headers: { 'user-agent': 'Mozilla/5.0 (compatible; WorkHorse/1.0)', accept: 'application/json' }, cf: { cacheTtl: 1800, cacheEverything: true } });
    const body = await upstream.text();
    return new Response(body, { status: upstream.status, headers: { ...CORS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=1800' } });
  },
};
