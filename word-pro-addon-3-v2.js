/* Pro Document — Add-on #3 v2: Website builder ("mini Google Sites").
   Use this INSTEAD of word-pro-addon-3.js. Load order (last scripts before </body>):
   word-pro-addon.js, word-pro-addon-2.js, word-pro-addon-3-v2.js
   Adds a 🌐 Website tab only; no existing feature is changed. */
(function () {
  'use strict';
  if (window.WP3) return;
  const $ = id => document.getElementById(id);
  const ro = () => typeof isReadOnly !== 'undefined' && isReadOnly;
  const pg = () => pages[currentPage];
  const say = m => typeof setStatus === 'function' && setStatus(m);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const docTitle = () => ($('docTitleDisplay').textContent.replace(/^—\s*/, '').trim() || 'My Website');
  const fname = () => docTitle().replace(/[\\/:*?"<>|]/g, '_');
  let saved = null, target = null;
  document.addEventListener('selectionchange', () => { const s = getSelection(); if (s.rangeCount && pages.some(p => p.contains(s.anchorNode))) saved = s.getRangeAt(0).cloneRange(); });
  const dirty = el => ((el && pages.find(p => p.contains(el))) || pg()).dispatchEvent(new Event('input', { bubbles: true }));

  /* ── sanitiser: no scripts/handlers; iframes only inside sandboxed web blocks ── */
  function safe(html) {
    const d = new DOMParser().parseFromString(html, 'text/html');
    d.querySelectorAll('script,object,embed,link,meta,form,base,style,title,noscript,applet').forEach(n => n.remove());
    d.querySelectorAll('iframe').forEach(f => { if (!f.closest('.wp-web') || !f.hasAttribute('srcdoc')) return f.remove(); f.setAttribute('sandbox', 'allow-scripts allow-popups'); f.removeAttribute('src'); });
    d.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => {
      if (/^on/i.test(a.name)) n.removeAttribute(a.name);
      else if (a.name !== 'srcdoc' && /^\s*(javascript|vbscript|data:text\/html)/i.test(a.value)) n.removeAttribute(a.name);
    }));
    return d.body.innerHTML;
  }

  /* ── UI styles + modal ── */
  const css = document.createElement('style');
  css.textContent = `.wp3-ov{position:fixed;inset:0;z-index:10060;background:rgba(15,30,60,.45);display:flex;align-items:center;justify-content:center}
  .wp3-dlg{background:#fff;border-radius:10px;box-shadow:0 18px 48px rgba(15,30,60,.35);display:flex;flex-direction:column;max-width:96vw;max-height:92vh;overflow:hidden;color:var(--text);font-size:13px}
  .wp3-h{background:var(--accent);color:#fff;padding:9px 12px;display:flex;justify-content:space-between;align-items:center}
  .wp3-h button{background:rgba(255,255,255,.2);border:none;color:#fff;border-radius:4px;padding:2px 8px;cursor:pointer}
  .wp3-b{padding:12px;overflow:auto;display:flex;flex-direction:column;gap:8px}
  .wp3-b textarea{width:100%;min-height:200px;font:12px Consolas,monospace;padding:8px;border:1px solid var(--border);border-radius:6px;resize:vertical}
  .wp3-b input[type=text],.wp3-b select{padding:6px 8px;border:1px solid var(--border);border-radius:6px;font:inherit;width:100%}
  .wp3-b label.f{display:flex;flex-direction:column;gap:3px;font-weight:600;font-size:12px;color:var(--muted)}
  .wp3-g{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .wp3-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  .wp3-row button{border:1px solid var(--border);background:#fff;border-radius:6px;padding:5px 10px;cursor:pointer;font:inherit}
  .wp3-row button:hover{background:var(--accent-light);border-color:var(--accent)}
  .wp3-row button.pri{background:var(--accent);color:#fff;border-color:var(--accent)}
  .wp3-row label{display:flex;gap:5px;align-items:center;cursor:pointer}
  .wp3-fr{width:100%;border:1px solid var(--border);border-radius:6px;background:#fff}
  .wp3-pr{display:grid;grid-template-columns:26px 1fr auto auto auto auto;gap:6px;align-items:center}
  .wp3-pr button{border:1px solid var(--border);background:#fff;border-radius:4px;cursor:pointer;padding:3px 7px}
  .wp-web{margin:12px 0;border:1px solid #c9d4ea;border-radius:6px;overflow:hidden;user-select:none}
  .wp-web-bar{background:#eef3fc;padding:3px 8px;font:11px 'Segoe UI',sans-serif;color:#2b579a;display:flex;gap:6px;align-items:center}
  .wp-web-bar button{border:1px solid #c9d4ea;background:#fff;border-radius:4px;font-size:11px;padding:1px 7px;cursor:pointer}
  .wp-web iframe{display:block;width:100%;border:0;background:#fff}
  .page details{border:1px solid #d6deef;border-radius:6px;padding:8px 12px;margin:6px 0}.page summary{cursor:pointer;font-weight:600}
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

  /* ── site + per-page settings (hidden markers inside the pages, so they save with the document) ── */
  const THEMES = {
    blue: ['Ocean blue', '#2b579a', '#16305a'], forest: ['Forest', '#2e7d4f', '#17402a'], sunset: ['Sunset', '#d9622b', '#5a2a14'],
    rose: ['Rose', '#c2447a', '#521a37'], violet: ['Violet', '#6c4fc2', '#2b1d5a'], mono: ['Mono', '#222222', '#111111']
  };
  const FONTS = { sans: ["'Segoe UI',system-ui,-apple-system,Roboto,sans-serif", 'Modern sans'], serif: ["Georgia,'Times New Roman',serif", 'Classic serif'], round: ["'Trebuchet MS','Segoe UI',sans-serif", 'Friendly'], mono: ["Consolas,'Courier New',monospace", 'Technical'] };
  const DEF = { name: '', tag: '', theme: 'blue', font: 'sans', nav: 'top', logo: '🌐', footer: '© {year} {name}', desc: '', dark: true };
  function marker(p, cls, make) {
    let m = p.querySelector(':scope > .' + cls);
    if (!m && make) { m = document.createElement('div'); m.className = cls; m.contentEditable = 'false'; m.style.display = 'none'; p.insertBefore(m, p.firstChild); }
    return m;
  }
  const getCfg = () => { const m = pages[0] && marker(pages[0], 'wp-cfg'); let o = {}; try { o = JSON.parse(m.dataset.cfg); } catch (e) {} const c = { ...DEF, ...o }; if (!c.name) c.name = docTitle(); return c; };
  const setCfg = c => { marker(pages[0], 'wp-cfg', 1).dataset.cfg = JSON.stringify(c); dirty(pages[0]); };
  const getPc = i => { const m = marker(pages[i], 'wp-pcfg'); return m ? { id: m.dataset.id, t: m.dataset.t || '', h: m.dataset.h === '1' } : { id: '', t: '', h: false }; };
  function setPc(i, o) { const m = marker(pages[i], 'wp-pcfg', 1); if (!m.dataset.id) m.dataset.id = 'p' + Math.random().toString(36).slice(2, 7); if ('t' in o) m.dataset.t = o.t; if ('h' in o) m.dataset.h = o.h ? '1' : '0'; dirty(pages[i]); return m.dataset.id; }
  const pid = i => getPc(i).id || setPc(i, {});
  const autoTitle = (p, i) => { const h = p.querySelector('h1,h2'); return (h && h.textContent.trim().slice(0, 30)) || 'Page ' + (i + 1); };
  const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page';

  /* ── insert helpers ── */
  function topBlock() { let n = saved && saved.startContainer.isConnected ? saved.startContainer : null; const p = pg(); while (n && n.parentNode !== p) n = n.parentNode; return n && n.nodeType === 1 ? n : null; }
  function insertNodes(nodes) {
    const ref = topBlock(), p = pg(); let at = ref;
    nodes.forEach(n => { at ? at.after(n) : p.appendChild(n); at = n; });
    const sp = document.createElement('p'); sp.innerHTML = '<br>'; at.after(sp); dirty(p);
  }
  function addHtml(html) { if (ro()) return say('This document is view-only.'); const b = document.createElement('div'); b.innerHTML = safe(html); insertNodes([...b.childNodes]); }
  const barHtml = '<div class="wp-web-bar" contenteditable="false">🌐 Web block <button data-w="edit">Edit code</button><button data-w="grow">Taller</button><button data-w="shrink">Shorter</button><button data-w="del">Remove</button></div>';
  function webBlock(code, h) {
    const w = document.createElement('div'); w.className = 'wp-web'; w.contentEditable = 'false';
    w.innerHTML = barHtml + `<iframe sandbox="allow-scripts allow-popups" style="height:${h || 420}px" title="Web block"></iframe>`;
    w.querySelector('iframe').setAttribute('srcdoc', code); return w;
  }

  /* convert <style> rules into inline styles via a script-less hidden iframe */
  const INH = ['color', 'font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'text-align', 'letter-spacing', 'text-transform', 'text-decoration-line'];
  const BOX = ['background-color', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right', 'border-top', 'border-bottom', 'border-left', 'border-right', 'border-radius'];
  function inlineStyles(html) {
    return new Promise(res => {
      const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-same-origin');
      f.style.cssText = 'position:fixed;left:-9999px;top:0;width:816px;height:600px;visibility:hidden';
      let done = false; const fin = o => { if (done) return; done = true; f.remove(); res(o); };
      f.onload = () => {
        try {
          const d = f.contentDocument, w = f.contentWindow; d.body.querySelectorAll('script').forEach(n => n.remove());
          d.body.querySelectorAll('*').forEach(el => {
            const cs = w.getComputedStyle(el); if (cs.display === 'none') return el.setAttribute('data-rm', '1');
            const ps = el.parentElement && w.getComputedStyle(el.parentElement); let s = '';
            INH.forEach(p => { const v = cs.getPropertyValue(p); if (v && (!ps || ps.getPropertyValue(p) !== v || el.parentElement === d.body)) s += p + ':' + v + ';'; });
            BOX.forEach(p => { const v = cs.getPropertyValue(p); if (!v || /^(0px|rgba\(0, 0, 0, 0\)|none.*|0px none.*)$/.test(v) || /^0px (none|solid 0)/.test(v)) return; s += p + ':' + v + ';'; });
            if (/^(flex|grid)$/.test(cs.display)) s += 'display:block;';
            el.setAttribute('style', s + (el.getAttribute('style') || '').replace(/display:\s*(flex|grid)[^;]*;?/g, ''));
          });
          d.body.querySelectorAll('[data-rm]').forEach(n => n.remove());
          const bg = w.getComputedStyle(d.body).backgroundColor, out = d.body.innerHTML;
          fin(/rgba\(0, 0, 0, 0\)|rgb\(255, 255, 255\)/.test(bg) ? out : `<div style="background:${bg}">${out}</div>`);
        } catch (e) { fin(html); }
      };
      setTimeout(() => fin(null), 6000); document.body.appendChild(f); f.srcdoc = html;
    });
  }

  /* ── paste HTML dialog ── */
  function pasteDlg(initial, existing) {
    if (ro()) return say('This document is view-only.');
    target = existing || null;
    const m = modal(existing ? 'Edit web block' : 'Paste HTML code', `
      <div style="color:var(--muted)">Paste a full page or a snippet (HTML + CSS + JS). The preview runs in a sandbox and cannot touch your document or account.</div>
      <textarea id="wp3c" spellcheck="false" placeholder="<!DOCTYPE html>…">${esc(initial || '')}</textarea>
      <div class="wp3-row"><label><input type="radio" name="wp3mode" value="web" checked> Web block <small>(exact look, scripts allowed)</small></label>
        <label><input type="radio" name="wp3mode" value="edit"${existing ? ' disabled' : ''}> Editable <small>(styles inlined, scripts removed)</small></label></div>
      <div class="wp3-row"><button data-a="file">📂 Load .html</button><button data-a="prev">▶ Refresh</button><span style="margin-left:auto">Height</span><input type="number" id="wp3h" value="420" min="120" max="2000" style="width:70px"></div>
      <iframe class="wp3-fr" id="wp3p" sandbox="allow-scripts allow-popups" style="height:240px"></iframe>
      <div class="wp3-row" style="justify-content:flex-end"><button data-a="x">Cancel</button><button class="pri" data-a="ok">${existing ? 'Update block' : 'Insert into page'}</button></div>`);
    const ta = $('wp3c'), prev = () => { $('wp3p').srcdoc = ta.value || '<p style="font:13px sans-serif;color:#888;padding:12px">Preview appears here…</p>'; }; let t;
    ta.oninput = () => { clearTimeout(t); t = setTimeout(prev, 500); };
    ta.onkeydown = e => { if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); } }; prev();
    m.onclick = async e => {
      const a = e.target.dataset.a; if (!a) return;
      if (a === 'x') return close(); if (a === 'prev') return prev();
      if (a === 'file') { const i = document.createElement('input'); i.type = 'file'; i.accept = '.html,.htm,.txt'; i.onchange = async () => { if (i.files[0]) { ta.value = await i.files[0].text(); prev(); } }; return i.click(); }
      const code = ta.value.trim(); if (!code) return say('Paste some HTML first.');
      const mode = (document.querySelector('input[name=wp3mode]:checked') || {}).value, h = +$('wp3h').value || 420;
      if (target) { const f = target.querySelector('iframe'); f.setAttribute('srcdoc', code); f.style.height = h + 'px'; dirty(target); close(); return say('Web block updated.'); }
      if (mode === 'web') { insertNodes([webBlock(code, h)]); close(); return say('Web block inserted.'); }
      say('Converting…'); const out = await inlineStyles(code); if (out == null) return say('Conversion timed out — try Web block mode.');
      const box = document.createElement('div'); box.innerHTML = safe(out); insertNodes([...box.childNodes]); close(); say('HTML inserted as editable content.');
    };
  }
  $('contentArea').addEventListener('click', e => {
    const lk = e.target.closest && e.target.closest('a[href^="page:"]');
    if (lk && (e.ctrlKey || e.metaKey || ro())) { e.preventDefault(); const i = pages.findIndex((p, k) => getPc(k).id === lk.getAttribute('href').slice(5)); if (i >= 0) switchPage(i); return; }
    const b = e.target.closest && e.target.closest('.wp-web-bar button'); if (!b) return;
    const w = b.closest('.wp-web'), f = w.querySelector('iframe'), a = b.dataset.w; if (ro()) return say('This document is view-only.');
    if (a === 'edit') pasteDlg(f.getAttribute('srcdoc') || '', w); else if (a === 'del') { w.remove(); dirty(pg()); }
    else { f.style.height = Math.max(120, (parseFloat(f.style.height) || 420) + (a === 'grow' ? 80 : -80)) + 'px'; dirty(w); }
  });

  /* ── page source ── */
  function sourceDlg() {
    if (ro()) return say('This document is view-only.');
    const p = pg(), c = p.cloneNode(true); c.querySelectorAll('.img-handle,#drawCanvasOverlay').forEach(n => n.remove()); c.querySelectorAll('mark.wp-hit').forEach(n => n.replaceWith(...n.childNodes));
    const m = modal('Page HTML source — page ' + (currentPage + 1), `<div style="color:var(--muted)">Scripts and event handlers are removed when you apply.</div><textarea id="wp3c" spellcheck="false" style="min-height:320px">${esc(c.innerHTML)}</textarea><div class="wp3-row" style="justify-content:flex-end"><button data-a="x">Cancel</button><button class="pri" data-a="ok">Apply to page</button></div>`, 820);
    m.onclick = e => { const a = e.target.dataset.a; if (!a) return; if (a === 'x') return close(); p.innerHTML = safe($('wp3c').value); p.querySelectorAll('img.draggable').forEach(i => typeof makeDraggableResizable === 'function' && makeDraggableResizable(i)); dirty(p); close(); say('Page HTML applied.'); };
  }

  /* ── Site settings dialog ── */
  function siteDlg() {
    if (ro()) return say('This document is view-only.');
    const c = getCfg(), opt = (o, v) => Object.keys(o).map(k => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(Array.isArray(o[k]) ? o[k][0] : o[k])}</option>`).join('');
    const m = modal('Site settings', `<div class="wp3-g">
      <label class="f">Site name<input type="text" id="s_name" value="${esc(c.name)}"></label><label class="f">Tagline<input type="text" id="s_tag" value="${esc(c.tag)}"></label>
      <label class="f">Logo (emoji or letter)<input type="text" id="s_logo" value="${esc(c.logo)}" maxlength="4"></label>
      <label class="f">Colour theme<select id="s_theme">${opt(THEMES, c.theme)}</select></label>
      <label class="f">Font style<select id="s_font">${opt(Object.fromEntries(Object.entries(FONTS).map(([k, v]) => [k, v[1]])), c.font)}</select></label>
      <label class="f">Menu position<select id="s_nav"><option value="top"${c.nav === 'top' ? ' selected' : ''}>Top bar</option><option value="side"${c.nav === 'side' ? ' selected' : ''}>Left sidebar</option></select></label>
      <label class="f" style="grid-column:1/-1">Footer text ({year} and {name} are filled in)<input type="text" id="s_footer" value="${esc(c.footer)}"></label>
      <label class="f" style="grid-column:1/-1">Search description (SEO)<input type="text" id="s_desc" value="${esc(c.desc)}" maxlength="160"></label></div>
      <label class="wp3-row"><input type="checkbox" id="s_dark"${c.dark ? ' checked' : ''}> Show a dark-mode switch on the site</label>
      <div class="wp3-row" style="justify-content:flex-end"><button data-a="x">Cancel</button><button data-a="pv">Save &amp; preview</button><button class="pri" data-a="ok">Save</button></div>`, 560);
    m.onclick = e => {
      const a = e.target.dataset.a; if (!a) return; if (a === 'x') return close();
      setCfg({ name: $('s_name').value.trim(), tag: $('s_tag').value.trim(), logo: $('s_logo').value.trim() || '🌐', theme: $('s_theme').value, font: $('s_font').value, nav: $('s_nav').value, footer: $('s_footer').value, desc: $('s_desc').value.trim(), dark: $('s_dark').checked });
      close(); say('Site settings saved.'); if (a === 'pv') preview();
    };
  }

  /* ── Pages & menu dialog ── */
  function movePg(i, d) {
    const j = i + d; if (j < 0 || j >= pages.length) return; const cur = pages[currentPage];
    [pages[i], pages[j]] = [pages[j], pages[i]]; const area = $('contentArea'); pages.forEach((p, k) => { area.appendChild(p); p.setAttribute('data-page-num', k + 1); });
    currentPage = pages.indexOf(cur); if (typeof updateThumbnails === 'function') updateThumbnails(); switchPage(currentPage); dirty(pages[0]);
  }
  function pagesDlg() {
    if (ro()) return say('This document is view-only.');
    const draw = () => {
      $('wp3list').innerHTML = pages.map((p, i) => { const c = getPc(i); return `<div class="wp3-pr" data-i="${i}"><b>${i + 1}</b><input type="text" data-k="t" value="${esc(c.t)}" placeholder="${esc(autoTitle(p, i))}"><label title="Hide from menu"><input type="checkbox" data-k="h"${c.h ? ' checked' : ''}> hide</label><button data-a="up">▲</button><button data-a="dn">▼</button><button data-a="go">Go</button></div>`; }).join('');
    };
    const m = modal('Pages & menu', `<div style="color:var(--muted)">Name each page as it appears in the site menu, hide pages from the menu, or reorder them. Page 1 becomes the home page.</div><div id="wp3list" style="display:flex;flex-direction:column;gap:6px"></div><div class="wp3-row"><button data-a="add">➕ Add page</button></div>`, 600);
    draw();
    m.oninput = e => { const r = e.target.closest('[data-i]'); if (r && e.target.dataset.k === 't') setPc(+r.dataset.i, { t: e.target.value }); };
    m.onchange = e => { const r = e.target.closest('[data-i]'); if (r && e.target.dataset.k === 'h') setPc(+r.dataset.i, { h: e.target.checked }); };
    m.onclick = e => {
      const a = e.target.dataset.a; if (!a) return; const r = e.target.closest('[data-i]'), i = r ? +r.dataset.i : 0;
      if (a === 'up') movePg(i, -1); else if (a === 'dn') movePg(i, 1); else if (a === 'go') { switchPage(i); return close(); } else if (a === 'add') { addPage(); setPc(pages.length - 1, {}); }
      draw();
    };
  }
  function linkDlg() {
    if (ro()) return say('This document is view-only.');
    if (pages.length < 2) return say('Add a second page first (Pages & Menu ▸ Add page).');
    const sel = getSelection().toString().trim();
    const m = modal('Link to a page', `<label class="f">Page<select id="l_p">${pages.map((p, i) => `<option value="${i}">${i + 1}. ${esc(getPc(i).t || autoTitle(p, i))}</option>`).join('')}</select></label><label class="f">Link text<input type="text" id="l_t" value="${esc(sel || 'Read more')}"></label><div class="wp3-row" style="justify-content:flex-end"><button data-a="x">Cancel</button><button class="pri" data-a="ok">Insert link</button></div>`, 380);
    m.onclick = e => { const a = e.target.dataset.a; if (!a) return; if (a === 'x') return close(); const id = pid(+$('l_p').value), t = esc($('l_t').value.trim() || 'Link'); close(); if (saved) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved); } pg().focus(); document.execCommand('insertHTML', false, `<a href="page:${id}">${t}</a>&nbsp;`); say('Page link added (Ctrl+click it to jump).'); };
  }

  /* ── embeds (video / map) as sandboxed web blocks ── */
  function embed(kind) {
    if (ro()) return say('This document is view-only.');
    let src = '';
    if (kind === 'video') {
      const u = prompt('YouTube link:'); if (!u) return; const m = u.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/); if (!m) return say('That does not look like a YouTube link.');
      src = 'https://www.youtube-nocookie.com/embed/' + m[1];
    } else { const q = prompt('Address or place (e.g. Barddhaman railway station):'); if (!q) return; src = 'https://maps.google.com/maps?q=' + encodeURIComponent(q) + '&output=embed'; }
    insertNodes([webBlock(`<body style="margin:0"><iframe src="${src}" style="width:100%;height:100vh;border:0" allowfullscreen loading="lazy"></iframe></body>`, 360)]); say('Embed added.');
  }

  /* ── building blocks & starter sites ── */
  const BTN = 'display:inline-block;background:#2b579a;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600';
  const CARD = 'border:1px solid #d6deef;border-radius:10px;padding:16px 18px;box-shadow:0 2px 8px rgba(0,0,0,.07)';
  const cols = (n, f) => `<table style="width:100%;border-collapse:collapse"><tr>${Array.from({ length: n }, (_, i) => `<td style="border:none;padding:8px;vertical-align:top;width:${100 / n}%">${f(i + 1)}</td>`).join('')}</tr></table>`;
  const BLOCKS = {
    hero: `<div style="background:#eaf1fd;padding:56px 28px;text-align:center;border-radius:10px"><h1 style="font-size:32pt;margin:0 0 10px;color:#16305a">[Your headline]</h1><p style="font-size:14pt;color:#4a5a75">[One sentence describing what you offer.]</p><p><a href="#" style="${BTN}">Get started</a></p></div>`,
    columns: cols(3, n => `<h3 style="color:#2b579a">Feature ${n}</h3><p>[Short description.]</p>`),
    card: `<div style="${CARD};margin:10px 0"><h3 style="margin-top:0">[Card title]</h3><p>[Card text.]</p><a href="#">Learn more →</a></div>`,
    gallery: cols(3, n => `<div style="background:#e4e9f3;border-radius:8px;height:120px;text-align:center;line-height:120px;color:#7b88a3">Photo ${n}</div><p style="text-align:center;color:#666;font-size:10pt">Caption ${n}</p>`),
    testimonial: `<div style="background:#f6f8fd;border-left:5px solid #2b579a;border-radius:6px;padding:16px 20px;margin:12px 0"><p style="font-size:13pt;font-style:italic;margin:0 0 8px">“[A short, genuine quote from a happy customer.]”</p><b>[Name]</b> <span style="color:#777">· [Role, company]</span></div>`,
    pricing: cols(3, n => `<div style="${CARD};text-align:center"><h3 style="margin-top:0">${['Basic', 'Standard', 'Premium'][n - 1]}</h3><p style="font-size:24pt;margin:6px 0;color:#2b579a"><b>₹${n * 199}</b></p><p style="color:#777">per month</p><p>✓ [Feature]<br>✓ [Feature]<br>✓ [Feature]</p><a href="#" style="${BTN}">Choose</a></div>`),
    faq: '<h2>Frequently asked questions</h2><details open><summary>[Question one?]</summary><p>[Answer.]</p></details><details><summary>[Question two?]</summary><p>[Answer.]</p></details><details><summary>[Question three?]</summary><p>[Answer.]</p></details>',
    contact: `<div style="${CARD};margin:12px 0"><h2 style="margin-top:0">Contact us</h2><p>📧 <a href="mailto:you@example.com">you@example.com</a><br>📞 [+91 00000 00000]<br>📍 [Address]</p><a href="mailto:you@example.com" style="${BTN}">Send an email</a></div>`,
    social: '<p style="text-align:center">Follow us: <a href="#">Instagram</a> · <a href="#">YouTube</a> · <a href="#">Facebook</a> · <a href="#">LinkedIn</a></p>',
    button: `<p style="text-align:center"><a href="#" style="${BTN}">[Button text]</a></p>`,
    stats: cols(3, n => `<p style="text-align:center;margin:0"><b style="font-size:26pt;color:#2b579a">${['500+', '10 yrs', '4.9★'][n - 1]}</b><br><span style="color:#777">[Label]</span></p>`)
  };
  const SITES = {
    business: BLOCKS.hero + '<h2 style="text-align:center;margin-top:28px">What we do</h2>' + BLOCKS.columns + BLOCKS.stats + '<h2 style="text-align:center">What clients say</h2>' + BLOCKS.testimonial + '<h2 style="text-align:center">Plans</h2>' + BLOCKS.pricing + BLOCKS.faq + BLOCKS.contact,
    portfolio: `<div style="text-align:center;padding:26px 0"><h1 style="font-size:30pt;margin:0">[Your Name]</h1><p style="color:#5a6b85;font-size:13pt">[Designer · Developer · Writer]</p></div><h2>About</h2><p>[Two or three sentences about you.]</p><h2>Projects</h2>${BLOCKS.gallery}${BLOCKS.card}<h2>Contact</h2>${BLOCKS.social}`,
    blog: '<h1 style="font-size:28pt">[Post title]</h1><p style="color:#777">By [Author] · [Date]</p><p style="font-size:13pt">[Opening paragraph that hooks the reader.]</p><h2>[Section]</h2><p>[Content.]</p><blockquote>[A pull quote.]</blockquote><h2>[Section]</h2><p>[Content.]</p>',
    event: `<div style="background:#16305a;color:#fff;padding:50px 24px;text-align:center;border-radius:10px"><p style="letter-spacing:4px;margin:0">YOU ARE INVITED</p><h1 style="font-size:30pt;margin:8px 0;color:#fff">[Event name]</h1><p>[Date] · [Time] · [Venue]</p><p><a href="#" style="${BTN};background:#f5c518;color:#222">RSVP</a></p></div><h2>Schedule</h2><table style="width:100%;border-collapse:collapse"><tr><td style="border:1px solid #ccc;padding:6px"><b>10:00</b></td><td style="border:1px solid #ccc;padding:6px">[Opening]</td></tr><tr><td style="border:1px solid #ccc;padding:6px"><b>11:00</b></td><td style="border:1px solid #ccc;padding:6px">[Session]</td></tr></table><h2>Location</h2><p>[Address]</p>`,
    classroom: `<h1>[Class / Club name]</h1><p style="color:#5a6b85">[Teacher / organiser] · [Term]</p>${BLOCKS.columns}<h2>Announcements</h2><ul><li>[Date] — [News]</li></ul><h2>Resources</h2><ul><li><a href="#">[Syllabus]</a></li><li><a href="#">[Assignments]</a></li></ul>${BLOCKS.contact}`
  };

  /* ── site builder (export / preview) ── */
  function siteCss(c) {
    const [, a, n] = THEMES[c.theme] || THEMES.blue, f = (FONTS[c.font] || FONTS.sans)[0], side = c.nav === 'side';
    return `:root{--a:${a};--n:${n};--bg:#f3f5f9;--card:#fff;--text:#1a1f2b;--muted:#667085;--line:#e1e5ee}[data-dark]{--bg:#12161d;--card:#1b222d;--text:#e6e9ef;--muted:#9aa4b5;--line:#2c3646}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:${f};color:var(--text);background:var(--bg);line-height:1.65}
.shell{display:${side ? 'flex' : 'block'};min-height:100vh}.side-nav,.top-nav{background:var(--n);color:#fff}
.top-nav{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 18px}
.side-nav{width:250px;flex:none;padding:18px 12px;position:sticky;top:0;height:100vh;overflow:auto}
.brand{display:flex;align-items:center;gap:10px;margin-right:12px;color:#fff;text-decoration:none}.brand .lg{font-size:24px}.brand b{font-size:17px;display:block;line-height:1.1}.brand small{opacity:.75;font-size:11px}
nav.m{display:flex;gap:4px;flex-wrap:wrap;${side ? 'flex-direction:column;margin-top:18px' : ''}}nav.m a{color:#fff;text-decoration:none;padding:7px 13px;border-radius:7px;font-size:14px}nav.m a:hover,nav.m a.on{background:rgba(255,255,255,.18)}
.tools{margin-left:auto;display:flex;gap:6px}.tools button{background:rgba(255,255,255,.15);color:#fff;border:none;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:14px}#mn{display:none}
.content{flex:1;min-width:0}.pg{max-width:900px;margin:26px auto;padding:44px 40px;background:var(--card);border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,.07);overflow-wrap:anywhere}
.pg h1,.pg h2,.pg h3{color:var(--a)}img{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid var(--line);padding:6px 10px}
.wp-web iframe{width:100%;border:0}a{color:var(--a)}blockquote{border-left:4px solid var(--a);margin:12px 0;padding:4px 16px;color:var(--muted)}pre{background:rgba(127,127,127,.12);padding:10px;overflow:auto}
details{border:1px solid var(--line);border-radius:6px;padding:8px 12px;margin:6px 0}summary{cursor:pointer;font-weight:600}
footer.sf{text-align:center;color:var(--muted);padding:22px 12px;font-size:13px}
@media(max-width:760px){.shell{display:block}.side-nav{width:auto;height:auto;position:static}#mn{display:inline-block}nav.m{display:none;flex-direction:column;width:100%}body.open nav.m{display:flex}.pg{margin:0;border-radius:0;padding:22px 16px;box-shadow:none}}`;
  }
  const JS = '<script>(function(){var d=document.documentElement,b=document.getElementById("dk");try{if(localStorage.getItem("dk")==="1")d.setAttribute("data-dark","")}catch(e){}if(b)b.onclick=function(){var o=d.toggleAttribute("data-dark");try{localStorage.setItem("dk",o?"1":"0")}catch(e){}};var m=document.getElementById("mn");if(m)m.onclick=function(){document.body.classList.toggle("open")}})();<\/script>';
  function collect() {
    const used = new Set();
    return pages.map((p, i) => {
      const pc = getPc(i), title = pc.t || autoTitle(p, i); let slug = i ? slugify(title) : 'index', k = 2; while (used.has(slug)) slug = slugify(title) + '-' + k++; used.add(slug);
      const c = p.cloneNode(true);
      c.querySelectorAll('.wp-cfg,.wp-pcfg,.img-handle,#drawCanvasOverlay,.wp-web-bar,.wp-wm').forEach(n => n.remove()); c.querySelectorAll('mark.wp-hit').forEach(n => n.replaceWith(...n.childNodes));
      c.querySelectorAll('img.draggable').forEach(im => { im.style.position = 'static'; im.style.transform = ''; im.style.maxWidth = '100%'; }); c.querySelectorAll('.wp-web').forEach(w => w.removeAttribute('contenteditable'));
      return { i, id: pc.id, title, hidden: pc.h, slug, html: safe(c.innerHTML) };
    });
  }
  function shell(c, items, cur, o) {
    const year = new Date().getFullYear(), foot = esc(c.footer.replace(/\{year\}/g, year).replace(/\{name\}/g, c.name));
    const nav = '<nav class="m">' + items.filter(x => !x.hidden || x === cur).map(x => `<a href="${o.href(x)}"${x === cur ? ' class="on"' : ''}>${esc(x.title)}</a>`).join('') + '</nav>';
    const tools = `<span class="tools">${c.dark ? '<button id="dk" title="Dark mode">🌓</button>' : ''}<button id="mn" title="Menu">☰</button></span>`;
    const brand = `<a class="brand" href="${o.href(items[0])}"><span class="lg">${esc(c.logo)}</span><span><b>${esc(c.name)}</b>${c.tag ? `<small>${esc(c.tag)}</small>` : ''}</span></a>`;
    const fav = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${c.logo.slice(0, 2)}</text></svg>`);
    const head = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(cur && cur.i ? cur.title + ' — ' + c.name : c.name)}</title>${c.desc ? `<meta name="description" content="${esc(c.desc)}"><meta property="og:description" content="${esc(c.desc)}">` : ''}<meta property="og:title" content="${esc(c.name)}"><link rel="icon" href="${fav}">${o.css}</head>`;
    const main = o.body.replace(/href="page:(\w+)"/g, (m, id) => { const t = items.find(x => x.id === id); return t ? `href="${o.href(t)}"` : 'href="#"'; });
    const inner = `<div class="content">${main}<footer class="sf">${foot}</footer></div>`;
    return head + '<body>' + (c.nav === 'side' ? `<div class="shell"><aside class="side-nav">${brand}${tools}${nav}</aside>${inner}</div>` : `<div class="shell"><header class="top-nav">${brand}${nav}${tools}</header>${inner}</div>`) + JS + '</body></html>';
  }
  function singleSite() {
    const c = getCfg(), items = collect();
    return shell(c, items, null, { css: `<style>${siteCss(c)}</style>`, href: x => '#' + x.slug, body: items.map(x => `<section class="pg" id="${x.slug}">${x.html}</section>`).join('') });
  }
  function multiSite() {
    const c = getCfg(), items = collect(), f = { 'style.css': siteCss(c) }, file = x => x.i ? x.slug + '.html' : 'index.html';
    items.forEach(x => { f[file(x)] = shell(c, items, x, { css: '<link rel="stylesheet" href="style.css">', href: file, body: `<main class="pg">${x.html}</main>` }); });
    f['404.html'] = shell(c, items, null, { css: '<link rel="stylesheet" href="style.css">', href: file, body: '<main class="pg"><h1>Page not found</h1><p>Sorry, that page does not exist. <a href="index.html">Go to the home page</a>.</p></main>' });
    return f;
  }
  const dl = (name, blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };

  function preview() {
    const m = modal('Website preview', `<div class="wp3-row"><button data-d="100%">🖥 Desktop</button><button data-d="768px">📱 Tablet</button><button data-d="390px">📱 Mobile</button><span style="color:var(--muted)">Sandboxed. Page links and the dark-mode switch work.</span></div><div style="background:#e8ecf3;padding:8px;display:flex;justify-content:center;border-radius:6px"><iframe id="wp3pv" class="wp3-fr" sandbox="allow-scripts allow-popups" style="height:64vh;width:100%;transition:width .2s"></iframe></div>`, 1040);
    $('wp3pv').srcdoc = singleSite(); m.onclick = e => { const d = e.target.dataset.d; if (d) $('wp3pv').style.width = d; };
  }
  function helpDlg() {
    modal('How to publish your site', `<ol style="line-height:1.8;margin:0;padding-left:20px"><li>Click <b>Export site .zip</b> and unzip it.</li><li><b>Netlify Drop</b> (free): open <i>app.netlify.com/drop</i> and drag the unzipped folder in. You get a live link in seconds.</li><li><b>GitHub Pages</b> (free): create a repository, upload the files, then turn on Pages in Settings.</li><li><b>Firebase Hosting</b> (you already use Firebase): run <code>firebase init hosting</code>, set the folder as the public directory, then <code>firebase deploy</code>.</li></ol><div style="color:var(--muted)">Tip: <b>Export .html</b> gives a single self-contained page you can email or open from a USB stick.</div>`, 520);
  }

  /* ── ribbon tab ── */
  const b = (ic, l, fn, t) => `<button class="tb-btn" onmousedown="event.preventDefault()" onclick="${fn}" title="${t || l}"><span class="tb-icon">${ic}</span>${l}</button>`;
  const sl = (label, opts, fn, w) => `<select class="tb-select" style="width:${w}px" onchange="${fn}(this.value);this.selectedIndex=0"><option value="">${label}</option>${opts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</select>`;
  const tab = document.createElement('button'); tab.className = 'tab-btn'; tab.dataset.tab = 'wpweb'; tab.textContent = '🌐 Website'; tab.onclick = () => switchTab('wpweb');
  document.querySelector('.ribbon-tabs').appendChild(tab);
  const tb = document.createElement('div'); tb.id = 'wpweb'; tb.className = 'ribbon-toolbar';
  tb.innerHTML = [
    ['Code', b('📋', 'Paste HTML', 'WP3.paste()', 'Paste HTML/CSS/JS as a web block or editable content') + b('🧾', 'Page Source', 'WP3.source()')],
    ['Site', b('⚙', 'Site Settings', 'WP3.settings()', 'Name, logo, theme, fonts, menu, footer, SEO') + b('🗂', 'Pages & Menu', 'WP3.pagesMenu()', 'Rename, hide and reorder pages') + b('🔗', 'Page Link', 'WP3.link()', 'Link text to another page')],
    ['Add content', sl('Add block', [['hero', 'Hero'], ['columns', '3 columns'], ['card', 'Card'], ['gallery', 'Photo gallery'], ['testimonial', 'Testimonial'], ['pricing', 'Pricing'], ['faq', 'FAQ'], ['contact', 'Contact'], ['social', 'Social links'], ['stats', 'Stats'], ['button', 'Button']], 'WP3.block', 110) + sl('Starter site', [['business', 'Business'], ['portfolio', 'Portfolio'], ['blog', 'Blog post'], ['event', 'Event'], ['classroom', 'Class / club']], 'WP3.site', 110),
      b('▶', 'Video', "WP3.embed('video')", 'Embed a YouTube video') + b('📍', 'Map', "WP3.embed('map')", 'Embed a Google map')],
    ['Publish', b('👁', 'Preview', 'WP3.preview()') + b('🌐', 'Export .html', "WP3.exp('html')", 'One self-contained page') + b('📦', 'Export site .zip', "WP3.exp('zip')", 'Multi-page site: index.html, pages, style.css, 404.html') + b('❓', 'How to Publish', 'WP3.help()')]
  ].map(g => `<div class="ribbon-group"><div class="ribbon-group-row">${g[1]}</div>${g[2] ? `<div class="ribbon-group-row">${g[2]}</div>` : ''}<div class="ribbon-group-label">${g[0]}</div></div>`).join('');
  document.querySelector('.find-bar').before(tb);

  window.WP3 = {
    paste: () => pasteDlg(), source: sourceDlg, preview, settings: siteDlg, pagesMenu: pagesDlg, link: linkDlg, embed, help: helpDlg,
    block: k => addHtml(BLOCKS[k]), site: k => { addHtml(SITES[k]); say('Starter inserted — replace the [placeholders]. Menu & theme: Site Settings.'); },
    async exp(kind) {
      try {
        if (kind === 'html') { dl(fname() + '.html', new Blob([singleSite()], { type: 'text/html' })); return say('Exported as a single HTML file.'); }
        say('Building .zip…');
        if (!window.JSZip) await new Promise((ok, no) => { const s = document.createElement('script'); s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js'; s.onload = ok; s.onerror = () => no(new Error('Could not load the zip library (needs internet)')); document.head.appendChild(s); });
        const z = new JSZip(), files = multiSite(); Object.keys(files).forEach(n => z.file(n, files[n]));
        dl(fname() + '-site.zip', await z.generateAsync({ type: 'blob' })); say('Website exported (' + Object.keys(files).length + ' files). See How to Publish.');
      } catch (e) { console.warn(e); say('Export failed: ' + (e.message || e)); }
    }
  };
  if (ro()) tb.querySelectorAll('button,select').forEach(x => { if (!/preview|exp|help/.test(x.getAttribute('onclick') || '')) x.disabled = true; });
  say('Website tab loaded.');
})();
