# Device-flow CORS relay

`worker.js` is a tiny, **stateless, secretless** Cloudflare Worker that lets the static reviewer app
complete GitHub's device-flow login (GitHub's device endpoints don't send CORS headers, so the
browser can't call them directly). It forwards two POSTs and adds CORS headers. It holds no secret
(device flow uses only the public `client_id`) and stores nothing.

## Deploy (once, free)

**Option A — Cloudflare dashboard (no tooling):**
1. Cloudflare dashboard → Workers & Pages → Create → Worker.
2. Replace the code with the contents of `worker.js`.
3. Edit `ALLOWED` to your Pages origin (e.g. `https://mattlmccoy.github.io`).
4. Deploy. Copy the Worker URL (e.g. `https://diss-relay.<subdomain>.workers.dev`).

**Option B — wrangler CLI:**
```bash
npm i -g wrangler
wrangler login
wrangler deploy relay/worker.js --name diss-relay
```

## After deploy
Give the Worker URL to the app: it goes in `js/ghauth.js` as `RELAY_URL` (alongside the GitHub App
`client_id`). Then "Connect GitHub" works with no token paste.

## Smoke test
```bash
curl -i -X OPTIONS https://<your-worker-url>/device/code -H "Origin: https://mattlmccoy.github.io"
# expect 200 + access-control-allow-origin header
```
