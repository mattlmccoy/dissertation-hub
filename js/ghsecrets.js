// GitHub Actions secrets / variables / workflow-dispatch helper for the owner Connect-email flow.
// Every network fn takes an explicit token argument — it NEVER reads localStorage, so a one-time
// elevated token can flow through without being persisted. Repo mirrors gh.js (the data repo).
const API = 'https://api.github.com', OWNER = 'mattlmccoy', REPO = 'dissertation-tracker-data';
const hdr = tok => ({ Authorization:`Bearer ${tok}`, Accept:'application/vnd.github+json' });

// Provider prefill table (pure data). domains[] drives detectProvider. keyUrl/keyLabel deep-link the
// EXACT page where the owner generates the app password / API key that goes in the password field —
// which is never their normal account login password.
export const PROVIDERS = {
  gmail:    { id:'gmail',    label:'Gmail',                host:'smtp.gmail.com',     port:465, domains:['gmail.com','googlemail.com'],
              secretWord:'App Password', keyUrl:'https://myaccount.google.com/apppasswords', keyLabel:'Create your Gmail App Password',
              keyNote:'Requires 2-Step Verification to be on. Paste the 16-character code (spaces optional).' },
  outlook:  { id:'outlook',  label:'Outlook / Office 365', host:'smtp.office365.com', port:587, domains:['outlook.com','hotmail.com','live.com'],
              secretWord:'app password', keyUrl:'https://account.live.com/proofs/AppPassword', keyLabel:'Create an Outlook app password',
              keyNote:'For personal Outlook/Hotmail. Work/school (Office 365) accounts set app passwords via your IT security portal.' },
  brevo:    { id:'brevo',    label:'Brevo (Sendinblue)',   host:'smtp-relay.brevo.com', port:587, domains:[],
              secretWord:'SMTP key', keyUrl:'https://app.brevo.com/settings/keys/smtp', keyLabel:'Get your Brevo SMTP key',
              keyNote:'Use the SMTP key, not the account password.' },
  custom:   { id:'custom',   label:'Custom SMTP',          host:'', port:587, domains:[],
              secretWord:'app password / API key', keyUrl:'', keyLabel:'', keyNote:"Use your provider's app password or API key, not your login." },
};

// Map a from-address domain to a provider id. .edu/institutional → outlook; unknown → custom.
export function detectProvider(email){
  const m = /^[^@\s]+@([^@\s]+\.[^@\s]+)$/.exec((email||'').trim().toLowerCase());
  if (!m) return null;
  const dom = m[1];
  for (const p of Object.values(PROVIDERS)) if (p.domains.includes(dom)) return p.id;
  if (dom.endsWith('.edu') || dom.endsWith('.ac.uk') || dom.includes('.edu.')) return 'outlook';
  return 'custom';
}

// 32-char base62 advisor access key.
export function genKey(){
  const A = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const r = crypto.getRandomValues(new Uint8Array(32));
  let s = ''; for (const b of r) s += A[b % 62]; return s;
}

// GET the repo Actions public key. Throwing on 403 is the signal the token lacks Secrets:write.
export async function getPublicKey(tok){
  const r = await fetch(`${API}/repos/${OWNER}/${REPO}/actions/secrets/public-key`, { headers:hdr(tok), cache:'no-store' });
  if (r.status === 403 || r.status === 404) { const e = new Error('no-secret-scope'); e.code = 'NOSCOPE'; throw e; }
  if (!r.ok) throw new Error('public-key ' + r.status);
  return r.json();   // { key_id, key }
}

// PUT one sealed secret. sealFn(pubKeyB64, value) -> base64 (from vendor/seal.mjs).
export async function putSecret(tok, pk, sealFn, name, value){
  const r = await fetch(`${API}/repos/${OWNER}/${REPO}/actions/secrets/${name}`, {
    method:'PUT', headers:{ ...hdr(tok), 'Content-Type':'application/json' },
    body: JSON.stringify({ encrypted_value: sealFn(pk.key, value), key_id: pk.key_id }) });
  if (!r.ok) throw new Error(`secret ${name}: ${r.status} ${(await r.text()).slice(0,120)}`);
}

// Set a plain (non-secret) Actions variable: POST, and on 409 (exists) PATCH.
export async function setVariable(tok, name, value){
  let r = await fetch(`${API}/repos/${OWNER}/${REPO}/actions/variables`, {
    method:'POST', headers:{ ...hdr(tok), 'Content-Type':'application/json' },
    body: JSON.stringify({ name, value }) });
  if (r.status === 409){
    r = await fetch(`${API}/repos/${OWNER}/${REPO}/actions/variables/${name}`, {
      method:'PATCH', headers:{ ...hdr(tok), 'Content-Type':'application/json' },
      body: JSON.stringify({ name, value }) });
  }
  if (!r.ok) throw new Error(`variable ${name}: ${r.status}`);
}

// Fire the invite workflow as a test send to testEmail. Needs actions:write / workflow scope.
export async function dispatchInvite(tok, testEmail){
  const r = await fetch(`${API}/repos/${OWNER}/${REPO}/actions/workflows/invite.yml/dispatches`, {
    method:'POST', headers:{ ...hdr(tok), 'Content-Type':'application/json' },
    body: JSON.stringify({ ref:'main', inputs:{ test_email: testEmail } }) });
  if (!r.ok) throw new Error('dispatch ' + r.status + ' ' + (await r.text()).slice(0,120));
}

// Newest workflow_dispatch run id/status/conclusion for invite.yml.
export async function latestRun(tok){
  const r = await fetch(`${API}/repos/${OWNER}/${REPO}/actions/workflows/invite.yml/runs?event=workflow_dispatch&per_page=1`, { headers:hdr(tok), cache:'no-store' });
  if (!r.ok) throw new Error('runs ' + r.status);
  const d = await r.json(); const run = (d.workflow_runs||[])[0];
  return run ? { id:run.id, status:run.status, conclusion:run.conclusion } : null;
}

// Best-effort profile prefill: { name, email }.
export async function prefillFromGitHub(tok){
  const out = { name:'', email:'' };
  try { const u = await (await fetch(`${API}/user`, { headers:hdr(tok) })).json(); out.name = u.name || u.login || ''; } catch {}
  try { const es = await (await fetch(`${API}/user/emails`, { headers:hdr(tok) })).json();
        const p = Array.isArray(es) ? (es.find(e=>e.primary) || es[0]) : null; out.email = p?.email || ''; } catch {}
  return out;
}
