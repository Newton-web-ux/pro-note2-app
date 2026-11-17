/* Pro Document — Add-on #3: Website tab (paste HTML code → build & export a website).
   Load AFTER word-pro-addon.js and word-pro-addon-2.js, as the last script before </body>:
   <script src="word-pro-addon-3.js"></script>
   It only ADDS a "Website" tab; every existing feature is untouched. */
(function () {
  'use strict';
  if (window.WP3) return;
  const $ = id => document.getElementById(id);
  const ro = () => typeof isReadOnly !== 'undefined' && isReadOnly;
  const pg = () => pages[currentPage];
  const say = m => typeof setStatus === 'function' && setStatus(m);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const title = () => ($('docTitleDisplay').textContent.replace(/^—\s*/, '').trim() || 'My Website');
  const fname = () => title().replace(/[\\/:*?"<>|]/g, '_');
  let saved = null, target = null;

  document.addEventListener('selectionchange', () => {
    const s = getSelection();
    if (s.rangeCount && pages.some(p => p.contains(s.anchorNode))) saved = s.getRangeAt(0).cloneRange();
  });
  const dirty = el => ((el && pages.find(p => p.contains(el))) || pg()).dispatchEvent(new Event('input', { bubbles: true }));

  /* ── sanitiser: no scripts/handlers; iframes only as sandboxed web blocks ── */
  function safe(html) {
    const d = new DOMParser().parseFromString(html, 'text/html');
    d.querySelectorAll('script,object,embed,link,meta,form,base,style,title,noscript,applet').forEach(n => n.remove());
    d.querySelectorAll('iframe').forEach(f => {
      if (!f.closest('.wp-web') || !f.hasAttribute('srcdoc')) return f.remove();
      f.setAttribute('sandbox', 'allow-scripts allow-popups'); f.removeAttribute('src');
    });
    d.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => {
      if (/^on/i.test(a.name)) n.removeAttribute(a.name);
      else if (a.name !== 'srcdoc' && /^\s*(javascript|vbscript|data:text\/html)/i.test(a.value)) n.removeAttribute(a.name);
    }));
    return d.body.innerHTML;
  }

  /* ── modal ── */
  const css = document.createElement('style');
  css.textContent = `.wp3-ov{position:fixed;inset:0;z-index:10060;background:rgba(15,30,60,.45);display:flex;align-items:center;justify-content:center}
  .wp3-dlg{background:#fff;border-radius:10px;box-shadow:0 18px 48px rgba(15,30,60,.35);display:flex;flex-direction:column;max-width:96vw;max-height:92vh;overflow:hidden;color:var(--text);font-size:13px}
  .wp3-h{background:var(--accent);color:#fff;padding:9px 12px;display:flex;justify-content:space-between;align-items:center}
  .wp3-h button{background:rgba(255,255,255,.2);border:none;color:#fff;border-radius:4px;padding:2px 8px;cursor:pointer}
  .wp3-b{padding:12px;overflow:auto;display:flex;flex-direction:column;gap:8px}
  .wp3-b textarea{width:100%;min-height:200px;font:12px Consolas,monospace;padding:8px;border:1px solid var(--border);border-radius:6px;resize:vertical;tab-size:2}
  .wp3-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  .wp3-row button{border:1px solid var(--border);background:#fff;border-radius:6px;padding:5px 10px;cursor:pointer;font:inherit}
  .wp3-row button:hover{background:var(--accent-light);border-color:var(--accent)}
  .wp3-row button.pri{background:var(--accent);color:#fff;border-color:var(--accent)}
  .wp3-row label{display:flex;gap:5px;align-items:center;cursor:pointer}
  .wp3-fr{width:100%;border:1px solid var(--border);border-radius:6px;background:#fff}
  .wp-web{margin:12px 0;border:1px solid #c9d4ea;border-radius:6px;overflow:hidden;user-select:none}
  .wp-web-bar{background:#eef3fc;padding:3px 8px;font:11px 'Segoe UI',sans-serif;color:#2b579a;display:flex;gap:6px;align-items:center}
  .wp-web-bar button{border:1px solid #c9d4ea;background:#fff;border-radius:4px;font-size:11px;padding:1px 7px;cursor:pointer}
  .wp-web iframe{display:block;width:100%;border:0;background:#fff}
  @media print{.wp-web-bar{display:none}.wp-web{border:none}}`;
  document.head.appendChild(css);
  const close = () => { const m = $('wp3m'); if (m) m.remove(); };
  function modal(t, body, w) {
    close(); const o = document.createElement('div'); o.id = 'wp3m'; o.className = 'wp3-ov';
    o.innerHTML = `<div class="wp3-dlg" style="width:${w || 760}px"><div class="wp3-h"><b>${esc(t)}</b><button data-x>✕</button></div><div class="wp3-b">${body}</div></div>`;
    document.body.appendChild(o); o.querySelector('[data-x]').onclick = close;
    o.addEventListener('mousedown', e => { if (e.target === o) close(); }); return o;
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  /* ── insert helpers ── */
  function topBlock() {
    let n = saved && saved.startContainer.isConnected ? saved.startContainer : null; const p = pg();
    while (n && n.parentNode !== p) n = n.parentNode;
    return n && n.nodeType === 1 ? n : null;
  }
  function insertNodes(nodes) {
    const ref = topBlock(), p = pg(); let at = ref;
    nodes.forEach(n => { at ? at.after(n) : p.appendChild(n); at = n; });
    const sp = document.createElement('p'); sp.innerHTML = '<br>'; at.after(sp); dirty(p);
  }
  const barHtml = '<div class="wp-web-bar" contenteditable="false">🌐 Web block <button data-w="edit">Edit code</button><button data-w="grow">Taller</button><button data-w="shrink">Shorter</button><button data-w="del">Remove</button></div>';
  function webBlock(code, h) {
    const w = document.createElement('div'); w.className = 'wp-web'; w.contentEditable = 'false';
    w.innerHTML = barHtml + `<iframe sandbox="allow-scripts allow-popups" style="height:${h || 420}px" title="Web block"></iframe>`;
    w.querySelector('iframe').setAttribute('srcdoc', code); return w;
  }
  /* turn <style> rules into inline styles using a script-less, same-origin hidden iframe */
  const INH = ['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'text-align', 'letter-spacing', 'text-transform', 'text-decoration-line'];
  const BOX = ['background-color', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'border-top', 'border-bottom', 'border-left', 'border-right', 'border-radius'];
  function inlineStyles(html) {
    return new Promise(res => {
      const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-same-origin');
      f.style.cssText = 'position:fixed;left:-9999px;top:0;width:816px;height:600px;visibility:hidden';
      let done = false;
      const fin = out => { if (done) return; done = true; f.remove(); res(out); };
      f.onload = () => {
        try {
          const d = f.contentDocument, w = f.contentWindow;
          d.body.querySelectorAll('script').forEach(n => n.remove());
          d.body.querySelectorAll('*').forEach(el => {
            const cs = w.getComputedStyle(el); if (cs.display === 'none') return el.setAttribute('data-rm', '1');
            const ps = el.parentElement && w.getComputedStyle(el.parentElement); let s = '';
            INH.forEach(p => { const v = cs.getPropertyValue(p); if (v && (!ps || ps.getPropertyValue(p) !== v || el.parentElement === d.body)) s += p + ':' + v + ';'; });
            BOX.forEach(p => { const v = cs.getPropertyValue(p); if (!v || /^(0px|rgba\(0, 0, 0, 0\)|none.*|0px none.*)$/.test(v) || /^0px (none|solid 0)/.test(v) || / 0px /.test(' ' + v) && /^0px/.test(v)) return; s += p + ':' + v + ';'; });
            if (/^(flex|grid)$/.test(cs.display)) s += 'display:block;';
            el.setAttribute('style', s + (el.getAttribute('style') || '').replace(/display:\s*(flex|grid)[^;]*;?/g, ''));
          });
          d.body.querySelectorAll('[data-rm]').forEach(n => n.remove());
          const bg = w.getComputedStyle(d.body).backgroundColor, out = d.body.innerHTML;
          fin(/rgba\(0, 0, 0, 0\)|rgb\(255, 255, 255\)/.test(bg) ? out : `<div style="background:${bg}">${out}</div>`);
        } catch (e) { fin(html); }
      };
      setTimeout(() => fin(null), 6000);
      document.body.appendChild(f); f.srcdoc = html;
    });
  }

  /* ── paste HTML dialog ── */
  function pasteDlg(initial, existing) {
    if (ro()) return say('This document is view-only.');
    target = existing || null;
    const m = modal(existing ? 'Edit web block' : 'Paste HTML code', `
      <div style="color:var(--muted)">Paste a full web page or just a snippet (HTML + CSS + JS). The preview runs in a sandbox, so it cannot touch your document or account.</div>
      <textarea id="wp3c" spellcheck="false" placeholder="<!DOCTYPE html>&#10;<html>…</html>">${esc(initial || '')}</textarea>
      <div class="wp3-row"><label><input type="radio" name="wp3mode" value="web" checked> Web block <small>(exact look, scripts allowed, sandboxed)</small></label>
        <label><input type="radio" name="wp3mode" value="edit"${existing ? ' disabled' : ''}> Editable <small>(converted to editable text &amp; styles, scripts removed)</small></label></div>
      <div class="wp3-row"><button data-a="file">📂 Load .html file</button><button data-a="prev">▶ Refresh preview</button>
        <span style="margin-left:auto">Height</span><input type="number" id="wp3h" value="420" min="120" max="2000" style="width:70px"></div>
      <iframe class="wp3-fr" id="wp3p" sandbox="allow-scripts allow-popups" style="height:260px"></iframe>
      <div class="wp3-row" style="justify-content:flex-end"><button data-a="x">Cancel</button><button class="pri" data-a="ok">${existing ? 'Update block' : 'Insert into page'}</button></div>`);
    const ta = $('wp3c'), prev = () => { $('wp3p').srcdoc = ta.value || '<p style="font:13px sans-serif;color:#888;padding:12px">Preview appears here…</p>'; };
    let t; ta.oninput = () => { clearTimeout(t); t = setTimeout(prev, 500); };
    ta.onkeydown = e => { if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); } };
    prev();
    m.onclick = async e => {
      const a = e.target.dataset.a; if (!a) return;
      if (a === 'x') return close();
      if (a === 'prev') return prev();
      if (a === 'file') {
        const i = document.createElement('input'); i.type = 'file'; i.accept = '.html,.htm,.txt';
        i.onchange = async () => { if (i.files[0]) { ta.value = await i.files[0].text(); prev(); } }; return i.click();
      }
      const code = ta.value.trim(); if (!code) return say('Paste some HTML first.');
      const mode = (document.querySelector('input[name=wp3mode]:checked') || {}).value, h = +$('wp3h').value || 420;
      if (target) { const f = target.querySelector('iframe'); f.setAttribute('srcdoc', code); f.style.height = h + 'px'; dirty(target); close(); return say('Web block updated.'); }
      if (mode === 'web') { insertNodes([webBlock(code, h)]); close(); return say('Web block inserted. Use its bar to edit, resize or remove it.'); }
      say('Converting…'); const out = await inlineStyles(code);
      if (out == null) return say('Conversion timed out — try Web block mode.');
      const box = document.createElement('div'); box.innerHTML = safe(out); insertNodes([...box.childNodes]); close(); say('HTML inserted as editable content.');
    };
  }

  /* web-block bar actions */
  $('contentArea').addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('.wp-web-bar button'); if (!b) return;
    const w = b.closest('.wp-web'), f = w.querySelector('iframe'), a = b.dataset.w;
    if (ro()) return say('This document is view-only.');
    if (a === 'edit') pasteDlg(f.getAttribute('srcdoc') || '', w);
    else if (a === 'del') { w.remove(); dirty(pg()); }
    else { f.style.height = Math.max(120, (parseFloat(f.style.height) || 420) + (a === 'grow' ? 80 : -80)) + 'px'; dirty(w); }
  });

  /* ── page source editor ── */
  function sourceDlg() {
    if (ro()) return say('This document is view-only.');
    const p = pg(), c = p.cloneNode(true);
    c.querySelectorAll('.img-handle,#drawCanvasOverlay').forEach(n => n.remove());
    c.querySelectorAll('mark.wp-hit').forEach(n => n.replaceWith(...n.childNodes));
    const m = modal('Page HTML source — page ' + (currentPage + 1), `<div style="color:var(--muted)">Edit the HTML of this page. Scripts and event handlers are removed when you apply.</div><textarea id="wp3c" spellcheck="false" style="min-height:320px">${esc(c.innerHTML)}</textarea><div class="wp3-row" style="justify-content:flex-end"><button data-a="x">Cancel</button><button class="pri" data-a="ok">Apply to page</button></div>`, 820);
    m.onclick = e => {
      const a = e.target.dataset.a; if (!a) return; if (a === 'x') return close();
      p.innerHTML = safe($('wp3c').value);
      p.querySelectorAll('img.draggable').forEach(i => typeof makeDraggableResizable === 'function' && makeDraggableResizable(i));
      dirty(p); close(); say('Page HTML applied.');
    };
  }

  /* ── build the website ── */
  function pageBody(p) {
    const c = p.cloneNode(true);
    c.querySelectorAll('.img-handle,#drawCanvasOverlay,.wp-web-bar,mark.wp-hit').forEach(n => n.classList.contains('wp-hit') ? n.replaceWith(...n.childNodes) : n.remove());
    c.querySelectorAll('img.draggable').forEach(i => { i.style.position = 'static'; i.style.transform = ''; i.style.maxWidth = '100%'; });
    c.querySelectorAll('.wp-web').forEach(w => w.removeAttribute('contenteditable'));
    c.removeAttribute('contenteditable');
    return safe(c.innerHTML);
  }
  const pageTitle = (p, i) => { const h = p.querySelector('h1,h2'); return (h && h.textContent.trim().slice(0, 28)) || 'Page ' + (i + 1); };
  const SITE_CSS = f => `*{box-sizing:border-box}body{margin:0;font-family:${f};color:#1a1a1a;background:#f3f5f9;line-height:1.65}
.site-nav{position:sticky;top:0;z-index:10;background:#16305a;display:flex;gap:4px;flex-wrap:wrap;padding:8px 16px}.site-nav a{color:#fff;text-decoration:none;padding:6px 12px;border-radius:6px;font-size:14px}.site-nav a:hover,.site-nav a.on{background:rgba(255,255,255,.18)}
.pg{max-width:900px;margin:24px auto;padding:48px 40px;background:#fff;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.08)}
img{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid #bbb;padding:6px 10px}.wp-web{margin:16px 0}.wp-web iframe{width:100%;border:0}
a{color:#2b579a}blockquote{border-left:4px solid #2b579a;margin:12px 0;padding:4px 16px;color:#444}pre{background:#f4f6fa;padding:10px;overflow:auto}
@media(max-width:640px){.pg{margin:0;border-radius:0;padding:24px 16px;box-shadow:none}}`;
  const pgStyle = p => ['background', 'backgroundImage', 'backgroundSize', 'color', 'fontFamily'].map(k => p.style[k] ? k.replace(/[A-Z]/g, c => '-' + c.toLowerCase()) + ':' + p.style[k] : '').filter(Boolean).join(';');
  const font = () => (pages[0] && pages[0].style.fontFamily) || "Calibri,'Segoe UI',system-ui,sans-serif";
  const head = (t, extra) => `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(t)}</title>${extra}</head><body>`;
  function singleSite() {
    const nav = pages.length > 1 ? `<nav class="site-nav">${pages.map((p, i) => `<a href="#p${i + 1}">${esc(pageTitle(p, i))}</a>`).join('')}</nav>` : '';
    return head(title(), `<style>${SITE_CSS(font())}</style>`) + nav + pages.map((p, i) => `<section class="pg" id="p${i + 1}" style="${esc(pgStyle(p))}">${pageBody(p)}</section>`).join('') + '</body></html>';
  }
  const fileOf = i => i === 0 ? 'index.html' : `page-${i + 1}.html`;
  function multiSite() {
    const files = { 'style.css': SITE_CSS(font()) };
    pages.forEach((p, i) => {
      const nav = `<nav class="site-nav">${pages.map((q, j) => `<a href="${fileOf(j)}"${j === i ? ' class="on"' : ''}>${esc(pageTitle(q, j))}</a>`).join('')}</nav>`;
      files[fileOf(i)] = head(title() + (i ? ' — ' + pageTitle(p, i) : ''), '<link rel="stylesheet" href="style.css">') + nav + `<section class="pg" style="${esc(pgStyle(p))}">${pageBody(p)}</section></body></html>`;
    });
    return files;
  }
  const dl = (name, blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };

  function preview() {
    const m = modal('Website preview', `<div class="wp3-row"><button data-d="100%">🖥 Desktop</button><button data-d="768px">📱 Tablet</button><button data-d="390px">📱 Mobile</button><span style="color:var(--muted)">Sandboxed — links and scripts run safely.</span></div><div style="background:#e8ecf3;padding:8px;display:flex;justify-content:center;border-radius:6px"><iframe id="wp3pv" class="wp3-fr" sandbox="allow-scripts allow-popups" style="height:62vh;width:100%;transition:width .2s"></iframe></div>`, 1000);
    $('wp3pv').srcdoc = singleSite();
    m.onclick = e => { const d = e.target.dataset.d; if (d) $('wp3pv').style.width = d; };
  }

  /* ── building blocks & starter sites (inserted as editable HTML) ── */
  const BTN = 'display:inline-block;background:#2b579a;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600';
  const BLOCKS = {
    navbar: `<div style="background:#16305a;color:#fff;padding:14px 20px;border-radius:6px"><b style="font-size:16pt">[Brand]</b> <span style="float:right"><a href="#" style="color:#fff">Home</a> &nbsp; <a href="#" style="color:#fff">About</a> &nbsp; <a href="#" style="color:#fff">Contact</a></span></div>`,
    hero: `<div style="background:#eaf1fd;padding:60px 30px;text-align:center;border-radius:8px"><h1 style="font-size:34pt;margin:0 0 10px;color:#16305a">[Your headline]</h1><p style="font-size:14pt;color:#4a5a75">[One sentence describing what you offer.]</p><p><a href="#" style="${BTN}">Get started</a></p></div>`,
    columns: `<table style="width:100%;border-collapse:collapse"><tr>${[1, 2, 3].map(n => `<td style="border:none;padding:14px;vertical-align:top;width:33%"><h3 style="color:#2b579a">Feature ${n}</h3><p>[Short description.]</p></td>`).join('')}</tr></table>`,
    card: `<div style="border:1px solid #d6deef;border-radius:10px;padding:18px 20px;box-shadow:0 2px 8px rgba(0,0,0,.08);margin:10px 0"><h3 style="margin-top:0">[Card title]</h3><p>[Card text.]</p><a href="#">Learn more →</a></div>`,
    button: `<p style="text-align:center"><a href="#" style="${BTN}">[Button text]</a></p>`,
    footer: `<div style="border-top:1px solid #ccc;margin-top:30px;padding-top:12px;text-align:center;color:#777;font-size:10pt">© [Year] [Your name]. All rights reserved.</div>`
  };
  const SITES = {
    landing: BLOCKS.navbar + BLOCKS.hero + '<h2 style="text-align:center;margin-top:30px">Why choose us</h2>' + BLOCKS.columns + '<h2 style="text-align:center">Ready to begin?</h2>' + BLOCKS.button + BLOCKS.footer,
    portfolio: `<div style="text-align:center;padding:30px 0"><h1 style="font-size:32pt;margin:0">[Your Name]</h1><p style="color:#5a6b85;font-size:13pt">[Designer · Developer · Writer]</p></div><h2>About</h2><p>[Two or three sentences about you.]</p><h2>Projects</h2>${BLOCKS.card}${BLOCKS.card}<h2>Contact</h2><p>Email: [you@example.com]</p>${BLOCKS.footer}`,
    blog: `<h1 style="font-size:28pt">[Blog post title]</h1><p style="color:#777">By [Author] · [Date]</p><p style="font-size:13pt">[Opening paragraph that hooks the reader.]</p><h2>[Section heading]</h2><p>[Content.]</p><blockquote>[A pull quote.]</blockquote><h2>[Section heading]</h2><p>[Content.]</p>${BLOCKS.footer}`
  };
  function addHtml(html) {
    if (ro()) return say('This document is view-only.');
    const box = document.createElement('div'); box.innerHTML = safe(html); insertNodes([...box.childNodes]);
  }

  /* ── ribbon tab ── */
  const b = (ic, l, fn, t) => `<button class="tb-btn" onmousedown="event.preventDefault()" onclick="${fn}" title="${t || l}"><span class="tb-icon">${ic}</span>${l}</button>`;
  const sl = (label, opts, fn, w) => `<select class="tb-select" style="width:${w}px" onchange="${fn}(this.value);this.selectedIndex=0"><option value="">${label}</option>${opts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select>`;
  const tab = document.createElement('button'); tab.className = 'tab-btn'; tab.dataset.tab = 'wpweb'; tab.textContent = '🌐 Website'; tab.onclick = () => switchTab('wpweb');
  document.querySelector('.ribbon-tabs').appendChild(tab);
  const tb = document.createElement('div'); tb.id = 'wpweb'; tb.className = 'ribbon-toolbar';
  tb.innerHTML = [
    ['Paste code', b('📋', 'Paste HTML', 'WP3.paste()', 'Paste HTML/CSS/JS and insert it as a web block or editable content') + b('🧾', 'Page Source', 'WP3.source()', 'View and edit this page\u2019s HTML')],
    ['Build', sl('Add block', [['navbar', 'Navbar'], ['hero', 'Hero section'], ['columns', '3 columns'], ['card', 'Card'], ['button', 'Button'], ['footer', 'Footer']], 'WP3.block', 110) + sl('Starter site', [['landing', 'Landing page'], ['portfolio', 'Portfolio'], ['blog', 'Blog post']], 'WP3.site', 110)],
    ['Publish', b('👁', 'Preview', 'WP3.preview()', 'Preview as a website (desktop / tablet / mobile)') + b('🌐', 'Export .html', "WP3.exp('html')", 'One self-contained web page') + b('🗂', 'Export site .zip', "WP3.exp('zip')", 'Multi-page website: index.html, page-2.html… + style.css')]
  ].map(g => `<div class="ribbon-group"><div class="ribbon-group-row">${g[1]}</div><div class="ribbon-group-label">${g[0]}</div></div>`).join('');
  document.querySelector('.find-bar').before(tb);

  window.WP3 = {
    paste: () => pasteDlg(), source: sourceDlg, preview,
    block: k => { saved = saved || null; addHtml(BLOCKS[k]); },
    site: k => { addHtml(SITES[k]); say('Starter site inserted — replace the [placeholders].'); },
    async exp(kind) {
      try {
        if (kind === 'html') { dl(fname() + '.html', new Blob([singleSite()], { type: 'text/html' })); return say('Website exported as a single HTML file.'); }
        say('Building .zip…');
        if (!window.JSZip) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'; s.onload = ok; s.onerror = () => no(new Error('Could not load the zip library (needs internet)')); document.head.appendChild(s); });
        const z = new JSZip(), files = multiSite(); Object.keys(files).forEach(n => z.file(n, files[n]));
        dl(fname() + '-site.zip', await z.generateAsync({ type: 'blob' })); say('Multi-page website exported (' + Object.keys(files).length + ' files).');
      } catch (e) { console.warn(e); say('Export failed: ' + (e.message || e)); }
    }
  };
  if (ro()) tb.querySelectorAll('button:not([onclick*="preview"]):not([onclick*="exp"]),select').forEach(x => x.disabled = true);
  say('Website tab loaded.');
})();
