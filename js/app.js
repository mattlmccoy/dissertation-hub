import * as pdfjs from 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs';
pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
import { anchorFromSelection } from './anchor.js';
import { newReview, addComment } from './model.js';

const SCALE = 1.4;
const readPane = document.getElementById('read-pane');
readPane.style.cssText = 'flex:1;min-width:0;overflow:auto;height:calc(100vh - 49px)';

document.getElementById('topbar').innerHTML =
  `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:.5px solid var(--border);background:var(--bg-2)">
     <strong style="font-weight:500">Dissertation Reviewer</strong>
     <span id="ch-label" style="color:var(--text-2);font-size:13px"></span>
     <label style="margin-left:auto;font-size:12px;cursor:pointer;border:.5px solid var(--border-2);border-radius:8px;padding:5px 11px">
       Open PDF<input type="file" id="pdf-file" accept="application/pdf" class="hidden"></label>
   </div>`;

let review = JSON.parse(localStorage.getItem('review:current') || 'null') || newReview('ch_modeling', '');
const save = () => localStorage.setItem('review:current', JSON.stringify(review));

// ---------- render ----------
export async function renderPdf(arrayBuf){
  readPane.innerHTML = '';
  const doc = await pdfjs.getDocument({ data: arrayBuf }).promise;
  window.__pdf = doc;
  for (let n = 1; n <= doc.numPages; n++){
    const page = await doc.getPage(n);
    const vp = page.getViewport({ scale: SCALE });
    const wrap = document.createElement('div');
    wrap.className = 'pdf-page'; wrap.dataset.page = n;
    wrap.style.cssText = `position:relative;margin:16px auto;width:${vp.width}px`;
    wrap.style.setProperty('--scale-factor', SCALE);
    const canvas = document.createElement('canvas');
    canvas.width = vp.width; canvas.height = vp.height;
    canvas.style.cssText = 'display:block;border:.5px solid var(--border);background:#fff;border-radius:4px';
    wrap.appendChild(canvas);
    readPane.appendChild(wrap);
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    const tl = document.createElement('div'); tl.className = 'textLayer';
    wrap.appendChild(tl);
    const tc = await page.getTextContent();
    const layer = new pdfjs.TextLayer({ textContentSource: tc, container: tl, viewport: vp });
    await layer.render();
  }
}

// ---------- select-to-comment ----------
let pendingAnchor = null;
readPane.addEventListener('mouseup', () => {
  const sel = window.getSelection();
  const text = sel.toString();
  if (!text.trim() || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  const pageEl = (range.startContainer.parentElement || range.startContainer).closest?.('.pdf-page')
    || range.startContainer.parentElement?.closest('.pdf-page');
  if (!pageEl) return;
  const pr = pageEl.getBoundingClientRect();
  const rects = [...range.getClientRects()].map(r => ({ x: r.x - pr.x, y: r.y - pr.y, w: r.width, h: r.height }));
  pendingAnchor = anchorFromSelection({ text, page: +pageEl.dataset.page, rects });
  showAnchorPopover(pendingAnchor, pageEl);
});

function showAnchorPopover(anchor, pageEl){
  document.getElementById('anchor-pop')?.remove();
  const loc = anchor.synctex ? `${anchor.synctex.file}:${anchor.synctex.line}` : 'resolving on save…';
  const ok = anchor.synctex ? 'var(--success)' : 'var(--text-3)';
  const pop = document.createElement('div'); pop.id = 'anchor-pop';
  pop.style.cssText = 'position:absolute;left:16px;right:16px;bottom:8px;background:var(--bg);border:.5px solid var(--info);border-radius:var(--r-md);padding:10px 12px;z-index:5';
  pop.innerHTML =
    `<div style="font-size:11px;color:var(--text-2);display:flex">Commenting on
       <span style="margin-left:auto;color:${ok}">⛓ ${loc}</span></div>
     <div style="font-style:italic;font-size:12px;color:var(--text-3);border-left:2px solid var(--border-2);padding-left:8px;margin:6px 0">"${anchor.quote.slice(0,120)}"</div>
     <div id="tagrow" style="display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap"></div>
     <textarea id="cbody" rows="2" placeholder="comment…" style="width:100%;border:.5px solid var(--border);border-radius:6px;padding:6px;font:inherit;background:var(--bg);color:var(--text)"></textarea>
     <div style="display:flex;gap:8px;margin-top:8px"><button id="csave">Comment</button><button id="ccancel">Cancel</button></div>`;
  pageEl.appendChild(pop);
  const tags = ['claim','wording','figure','citation','question']; let tag = 'claim';
  const tr = pop.querySelector('#tagrow');
  tags.forEach(t => {
    const b = document.createElement('button'); b.textContent = t;
    b.style.cssText = 'font-size:11px;padding:2px 9px;border-radius:10px;border:.5px solid var(--border)';
    const pick = () => { tag = t; [...tr.children].forEach(x => x.style.background = 'transparent'); b.style.background = 'var(--bg-3)'; };
    b.onclick = pick; tr.appendChild(b); if (t === 'claim') pick();
  });
  pop.querySelector('#ccancel').onclick = () => pop.remove();
  pop.querySelector('#csave').onclick = () => {
    window.dispatchEvent(new CustomEvent('comment:add', { detail: { anchor: pendingAnchor, tag, body: pop.querySelector('#cbody').value } }));
    pop.remove();
  };
}

// ---------- comments rail ----------
const tagColors = { claim:['--claim-bg','--claim'], wording:['--wording-bg','--wording'],
  figure:['--figure-bg','--figure'], citation:['--citation-bg','--citation'], question:['--question-bg','--question'], other:['--wording-bg','--wording'] };

function renderComments(){
  const pane = document.getElementById('comments-pane');
  pane.style.cssText = 'width:220px;flex-shrink:0;background:var(--bg-2);padding:10px;border-left:.5px solid var(--border);overflow:auto;height:calc(100vh - 49px)';
  const open = review.comments.filter(c => c.status === 'open').length;
  pane.innerHTML = `<div style="font-size:11px;color:var(--text-3);margin-bottom:8px;display:flex">COMMENTS<span style="margin-left:auto">${review.comments.length} · ${open} open</span></div>`;
  review.comments.forEach(c => {
    const [bg,fg] = tagColors[c.tag] || tagColors.other;
    const stClr = c.status === 'staged' ? '--info' : c.status === 'merged' ? '--success' : '--text-2';
    const card = document.createElement('div');
    card.style.cssText = 'background:var(--bg);border:.5px solid var(--border);border-radius:var(--r-md);padding:9px 10px;margin-bottom:8px;cursor:pointer';
    card.innerHTML = `<div style="display:flex;gap:6px;margin-bottom:6px">
        <span style="font-size:10px;font-weight:500;padding:1px 8px;border-radius:10px;background:var(${bg});color:var(${fg})">${c.tag}</span>
        <span style="margin-left:auto;font-size:10px;padding:1px 8px;border-radius:10px;color:var(${stClr})">${c.status}</span></div>
      <div style="font-size:11px;font-style:italic;color:var(--text-3);margin-bottom:5px">"${(c.anchor.quote || '').slice(0,46)}"</div>
      <div style="font-size:13px;line-height:1.5">${c.body || ''}</div>`;
    card.onclick = () => jumpToAnchor(c);
    pane.appendChild(card);
  });
}

window.addEventListener('comment:add', e => {
  review = addComment(review, e.detail); save(); renderComments();
});

function jumpToAnchor(c){
  const pageEl = document.querySelector(`.pdf-page[data-page="${c.page}"]`);
  if (!pageEl) return;
  pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  (c.anchor.rects || []).forEach(r => {
    const m = document.createElement('div'); m.className = 'flash';
    m.style.cssText = `position:absolute;left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;background:var(--warn-bg);opacity:.55;pointer-events:none;border-radius:2px`;
    pageEl.appendChild(m); setTimeout(() => m.remove(), 1600);
  });
}

// ---------- bootstrap ----------
renderComments();
document.getElementById('pdf-file').addEventListener('change', async e => {
  const f = e.target.files[0]; if (f) renderPdf(await f.arrayBuffer());
});
if (new URLSearchParams(location.search).has('demo')) {
  fetch('./demo.pdf').then(r => r.arrayBuffer()).then(renderPdf).catch(e => console.error('demo load failed', e));
}
