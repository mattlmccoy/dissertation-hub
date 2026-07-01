// Stateless CORS relay for GitHub's device-flow endpoints (which don't send CORS headers, so a
// static site can't call them directly). Holds NO secret and stores NO data — device flow uses only
// the public client_id, and the user authorizes on github.com. Deploy free on Cloudflare Workers.
//
// Two routes, both POST (body passed straight through):
//   /device/code   -> https://github.com/login/device/code            {client_id, scope}
//   /device/token  -> https://github.com/login/oauth/access_token      {client_id, device_code, grant_type}
//
// Set ALLOWED to your GitHub Pages origin(s). Redeploy after changing.
const ALLOWED = ['https://mattlmccoy.github.io'];
const TARGET = {
  '/device/code':  'https://github.com/login/device/code',
  '/device/token': 'https://github.com/login/oauth/access_token',
};

function cors(origin) {
  const ok = ALLOWED.includes(origin);
  return {
    'Access-Control-Allow-Origin': ok ? origin : ALLOWED[0],
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(req) {
    const origin = req.headers.get('Origin') || '';
    const { pathname } = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors(origin) });
    const target = TARGET[pathname];
    if (!target || req.method !== 'POST') return new Response('not found', { status: 404, headers: cors(origin) });
    const gh = await fetch(target, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: await req.text(),   // {client_id,scope} or {client_id,device_code,grant_type}, form-encoded
    });
    return new Response(await gh.text(), {
      status: gh.status,
      headers: { ...cors(origin), 'Content-Type': 'application/json' },
    });
  },
};
