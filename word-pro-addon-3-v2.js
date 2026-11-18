/* Pro Document — Add-on #3 v3: Website builder ("mini Google Sites / WordPress").
   Replaces word-pro-addon-3-v2.js. Load order (last scripts before </body>):
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
  const SANDBOX = 'allow-scripts allow-popups allow-forms';
  function safe(html) {
    const d = new DOMParser().parseFromString(html, 'text/html');
    d.querySelectorAll('script,object,embed,link,meta,form,base,style,title,noscript,applet').forEach(n => n.remove());
    d.querySelectorAll('iframe').forEach(f => { if (!f.closest('.wp-web') || !f.hasAttribute('srcdoc')) return f.remove(); f.setAttribute('sandbox', SANDBOX); f.removeAttribute('src'); });
    d.querySelectorAll('*').forEach(n => [...n.attributes].forEach(a => {
      if (/^on/i.test(a.name)) n.removeAttribute(a.name);
      else if (a.name !== 'srcdoc' && /^\s*(javascript|vbscript|data:text\/html)/i.test(a.value)) n.removeAttribute(a.name);
    }));
    return d.body.innerHTML;
  }
  const safeUrl = u => { u = String(u || '').trim(); return /^(https?:\/\/|mailto:|tel:|#|\/|[\w.\-]+\.html?(#.*)?$)/i.test(u) ? u : ''; };
  const cleanCss = s => String(s || '').replace(/<\/?style[^>]*>/gi, '').replace(/@import[^;]*;?/gi, '').replace(/expression\s*\(|javascript:|behavior\s*:|-moz-binding/gi, '');

  /* ── UI styles + modal ── */
  const css = document.createElement('style');
  css.textContent = `.wp3-ov{position:fixed;inset:0;z-index:10060;background:rgba(15,30,60,.45);display:flex;align-items:center;justify-content:center}
  .wp3-dlg{background:#fff;border-radius:10px;box-shadow:0 18px 48px rgba(15,30,60,.35);display:flex;flex-direction:column;max-width:96vw;max-height:92vh;overflow:hidden;color:var(--text);font-size:13px}
  .wp3-h{background:var(--accent);color:#fff;padding:9px 12px;display:flex;justify-content:space-between;align-items:center}
  .wp3-h button{background:rgba(255,255,255,.2);border:none;color:#fff;border-radius:4px;padding:2px 8px;cursor:pointer}
  .wp3-b{padding:12px;overflow:auto;display:flex;flex-direction:column;gap:8px}
  .wp3-b textarea{width:100%;min-height:200px;font:12px Consolas,monospace;padding:8px;border:1px solid var(--border);border-radius:6px;resize:vertical}
  .wp3-b input[type=text],.wp3-b input[type=url],.wp3-b input[type=datetime-local],.wp3-b input[type=number],.wp3-b select{padding:6px 8px;border:1px solid var(--border);border-radius:6px;font:inherit;width:100%}
  .wp3-b input[type=color]{width:48px;height:30px;padding:0;border:1px solid var(--border);border-radius:6px;background:#fff;cursor:pointer}
  .wp3-b label.f{display:flex;flex-direction:column;gap:3px;font-weight:600;font-size:12px;color:var(--muted)}
  .wp3-g{display:grid;grid-template-columns:1fr 1fr;gap:10px}
  .wp3-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  .wp3-row button{border:1px solid var(--border);background:#fff;border-radius:6px;padding:5px 10px;cursor:pointer;font:inherit}
  .wp3-row button:hover{background:var(--accent-light);border-color:var(--accent)}
  .wp3-row button.pri{background:var(--accent);color:#fff;border-color:var(--accent)}
  .wp3-row button.on{background:var(--accent-light);border-color:var(--accent);font-weight:600}
  .wp3-row label{display:flex;gap:5px;align-items:center;cursor:pointer}
  .wp3-fr{width:100%;border:1px solid var(--border);border-radius:6px;background:#fff}
  .wp3-pr{display:grid;grid-template-columns:26px 1fr auto auto auto auto auto;gap:6px;align-items:center}
  .wp3-pr button{border:1px solid var(--border);background:#fff;border-radius:4px;cursor:pointer;padding:3px 7px}
  .wp3-chk{display:flex;gap:8px;align-items:flex-start;padding:6px 8px;border-radius:6px;border:1px solid var(--border)}
  .wp3-chk.ok{background:#eaf7ef;border-color:#b8e0c8}.wp3-chk.warn{background:#fff6e0;border-color:#f0d9a0}.wp3-chk.bad{background:#fdecea;border-color:#f3b8b1}
  .wp-web{margin:12px 0;border:1px solid #c9d4ea;border-radius:6px;overflow:hidden;user-select:none}
  .wp-web-bar{background:#eef3fc;padding:3px 8px;font:11px 'Segoe UI',sans-serif;color:#2b579a;display:flex;gap:6px;align-items:center}
  .wp-web-bar button{border:1px solid #c9d4ea;background:#fff;border-radius:4px;font-size:11px;padding:1px 7px;cursor:pointer}
  .wp-web iframe{display:block;width:100%;border:0;background:#fff}
  .page details{border:1px solid #d6deef;border-radius:6px;padding:8px 12px;margin:6px 0}.page summary{cursor:pointer;font-weight:600}
  .page .wp-sec{outline:1px dashed rgba(43,87,154,.25);outline-offset:2px}
  @media print{.wp-web-bar{display:none}.wp-web{border:none}.page .wp-sec{outline:none}}`;
  document.head.appendChild(css);
  const close = () => { const m = $('wp3m'); if (m) m.remove(); };
  function modal(t, body, w) {
    close(); const o = document.createElement('div'); o.id = 'wp3m'; o.className = 'wp3-ov';
    o.innerHTML = `<div class="wp3-dlg" style="width:${w || 760}px"><div class="wp3-h"><b>${esc(t)}</b><button data-x>✕</button></div><div class="wp3-b">${body}</div></div>`;
    document.body.appendChild(o); o.querySelector('[data-x]').onclick = close;
    o.addEventListener('mousedown', e => { if (e.target === o) close(); }); return o;
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
  const fld = (id, l, v, ph, ex) => `<label class="f">${l}<input type="text" id="${id}" value="${esc(v)}" placeholder="${esc(ph || '')}" ${ex || ''}></label>`;
  const sel = (id, l, opts, v) => `<label class="f">${l}<select id="${id}">${opts.map(o => `<option value="${esc(o[0])}"${String(o[0]) === String(v) ? ' selected' : ''}>${esc(o[1])}</option>`).join('')}</select></label>`;

  /* ── site + per-page settings (hidden markers inside the pages, so they save with the document) ── */
  const THEMES = {
    blue: ['Ocean blue', '#2b579a', '#16305a'], forest: ['Forest', '#2e7d4f', '#17402a'], sunset: ['Sunset', '#d9622b', '#5a2a14'],
    rose: ['Rose', '#c2447a', '#521a37'], violet: ['Violet', '#6c4fc2', '#2b1d5a'], teal: ['Teal', '#0f8b8d', '#0a3d3e'],
    gold: ['Gold', '#b7791f', '#4a3210'], slate: ['Slate', '#475569', '#1e293b'], mono: ['Mono', '#222222', '#111111']
  };
  const FONTS = { sans: ["'Segoe UI',system-ui,-apple-system,Roboto,sans-serif", 'Modern sans'], serif: ["Georgia,'Times New Roman',serif", 'Classic serif'], round: ["'Trebuchet MS','Segoe UI',sans-serif", 'Friendly'], mono: ["Consolas,'Courier New',monospace", 'Technical'], editorial: ["'Palatino Linotype',Palatino,'Book Antiqua',serif", 'Editorial'] };
  const SOC = { instagram: '📸 Instagram', facebook: '👍 Facebook', youtube: '▶ YouTube', x: '𝕏 X / Twitter', linkedin: '💼 LinkedIn', github: '💻 GitHub', whatsapp: '💬 WhatsApp', email: '✉ Email' };
  const DEF = { name: '', tag: '', theme: 'blue', font: 'sans', nav: 'top', logo: '🌐', footer: '© {year} {name}', desc: '', dark: true, darkDefault: 'light', color: '', radius: '10', width: '900', sticky: true, anim: false, ann: '', annLink: '', cta: '', ctaLink: '', social: {}, ga: '', ogImage: '', baseUrl: '', css: '' };
  function marker(p, cls, make) {
    let m = p.querySelector(':scope > .' + cls);
    if (!m && make) { m = document.createElement('div'); m.className = cls; m.contentEditable = 'false'; m.style.display = 'none'; p.insertBefore(m, p.firstChild); }
    return m;
  }
  const getCfg = () => { const m = pages[0] && marker(pages[0], 'wp-cfg'); let o = {}; try { o = JSON.parse(m.dataset.cfg); } catch (e) {} const c = { ...DEF, ...o }; if (!c.name) c.name = docTitle(); return c; };
  const setCfg = c => { marker(pages[0], 'wp-cfg', 1).dataset.cfg = JSON.stringify(c); dirty(pages[0]); };
  const getPc = i => { const m = marker(pages[i], 'wp-pcfg'); return m ? { id: m.dataset.id, t: m.dataset.t || '', h: m.dataset.h === '1', s: m.dataset.s || '', d: m.dataset.d || '', l: m.dataset.l || '' } : { id: '', t: '', h: false, s: '', d: '', l: '' }; };
  function setPc(i, o) { const m = marker(pages[i], 'wp-pcfg', 1); if (!m.dataset.id) m.dataset.id = 'p' + Math.random().toString(36).slice(2, 7); if ('t' in o) m.dataset.t = o.t; if ('h' in o) m.dataset.h = o.h ? '1' : '0'; if ('s' in o) m.dataset.s = o.s; if ('d' in o) m.dataset.d = o.d; if ('l' in o) m.dataset.l = o.l; dirty(pages[i]); return m.dataset.id; }
  const pid = i => getPc(i).id || setPc(i, {});
  const autoTitle = (p, i) => { const h = p.querySelector('h1,h2'); return (h && h.textContent.trim().slice(0, 30)) || 'Page ' + (i + 1); };
  const slugify = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
  const isHex = h => /^#[0-9a-f]{6}$/i.test(h || '');
  const mix = (h, t, p) => { const a = parseInt(h.slice(1), 16), b = parseInt(t.slice(1), 16), x = [a >> 16 & 255, a >> 8 & 255, a & 255], y = [b >> 16 & 255, b >> 8 & 255, b & 255]; return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * p).toString(16).padStart(2, '0')).join(''); };

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
    w.innerHTML = barHtml + `<iframe sandbox="${SANDBOX}" style="height:${h || 420}px" title="Web block"></iframe>`;
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
      <iframe class="wp3-fr" id="wp3p" sandbox="${SANDBOX}" style="height:240px"></iframe>
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

  /* ── Site settings dialog (tabbed) ── */
  function siteDlg() {
    if (ro()) return say('This document is view-only.');
    const c = getCfg(), tn = Object.keys(THEMES).map(k => [k, THEMES[k][0]]), fn = Object.keys(FONTS).map(k => [k, FONTS[k][1]]);
    const m = modal('Site settings', `
      <div class="wp3-row" id="s_tabs"><button data-tab="gen" class="on">General</button><button data-tab="des">Design</button><button data-tab="hdr">Header &amp; footer</button><button data-tab="seo">SEO &amp; tracking</button><button data-tab="adv">Advanced</button></div>
      <div data-p="gen" class="wp3-g">${fld('s_name', 'Site name', c.name)}${fld('s_tag', 'Tagline', c.tag)}${fld('s_logo', 'Logo (emoji or letter)', c.logo, '', 'maxlength="4"')}
        ${sel('s_nav', 'Menu position', [['top', 'Top bar'], ['side', 'Left sidebar']], c.nav)}</div>
      <div data-p="des" class="wp3-g" hidden>${sel('s_theme', 'Colour theme', tn, c.theme)}
        <label class="f">Custom brand colour<span class="wp3-row"><input type="color" id="s_color" value="${isHex(c.color) ? c.color : THEMES[c.theme] ? THEMES[c.theme][1] : '#2b579a'}"><label style="font-weight:400"><input type="checkbox" id="s_usecolor"${isHex(c.color) ? ' checked' : ''}> use instead of theme</label></span></label>
        ${sel('s_font', 'Font style', fn, c.font)}${sel('s_radius', 'Corner roundness', [['0', 'Square'], ['6', 'Subtle'], ['10', 'Rounded'], ['16', 'Soft'], ['24', 'Extra soft']], c.radius)}
        ${sel('s_width', 'Content width', [['760', 'Narrow'], ['900', 'Standard'], ['1100', 'Wide'], ['1280', 'Extra wide']], c.width)}${sel('s_dd', 'Default appearance', [['light', 'Light'], ['dark', 'Dark'], ['auto', "Follow visitor's device"]], c.darkDefault)}
        <label class="wp3-row" style="grid-column:1/-1"><input type="checkbox" id="s_dark"${c.dark ? ' checked' : ''}> Show a dark-mode switch on the site</label>
        <label class="wp3-row" style="grid-column:1/-1"><input type="checkbox" id="s_sticky"${c.sticky ? ' checked' : ''}> Keep the menu fixed while scrolling</label>
        <label class="wp3-row" style="grid-column:1/-1"><input type="checkbox" id="s_anim"${c.anim ? ' checked' : ''}> Fade content in as visitors scroll</label></div>
      <div data-p="hdr" class="wp3-g" hidden>${fld('s_ann', 'Announcement bar text', c.ann, 'e.g. New: summer batch open')}${fld('s_annl', 'Announcement link (optional)', c.annLink, 'https://…')}
        ${fld('s_cta', 'Menu button text', c.cta, 'e.g. Contact us')}${fld('s_ctal', 'Menu button link', c.ctaLink, 'https://… or #contact')}
        <label class="f" style="grid-column:1/-1">Footer text ({year} and {name} are filled in)<input type="text" id="s_footer" value="${esc(c.footer)}"></label>
        <div style="grid-column:1/-1;color:var(--muted);font-weight:600">Social links in the footer</div>
        ${Object.keys(SOC).map(k => fld('s_so_' + k, SOC[k], (c.social || {})[k] || '', k === 'email' ? 'you@example.com' : k === 'whatsapp' ? '91XXXXXXXXXX' : 'https://…')).join('')}</div>
      <div data-p="seo" class="wp3-g" hidden><label class="f" style="grid-column:1/-1">Search description (about 150 characters)<input type="text" id="s_desc" value="${esc(c.desc)}" maxlength="160"></label>
        ${fld('s_og', 'Share image URL (social previews)', c.ogImage, 'https://…/cover.jpg')}${fld('s_base', 'Website address (for sitemap)', c.baseUrl, 'https://yourname.example.com')}
        ${fld('s_ga', 'Google Analytics ID', c.ga, 'G-XXXXXXXXXX')}</div>
      <div data-p="adv" hidden><label class="f">Custom CSS (applied to the whole site)<textarea id="s_css" spellcheck="false" style="min-height:180px" placeholder=".pg h1{letter-spacing:1px}">${esc(c.css)}</textarea></label></div>
      <div class="wp3-row" style="justify-content:flex-end"><button data-a="x">Cancel</button><button data-a="pv">Save &amp; preview</button><button class="pri" data-a="ok">Save</button></div>`, 660);
    m.onclick = e => {
      const t = e.target.dataset.tab;
      if (t) { m.querySelectorAll('[data-p]').forEach(p => p.hidden = p.dataset.p !== t); m.querySelectorAll('#s_tabs button').forEach(b => b.classList.toggle('on', b === e.target)); return; }
      const a = e.target.dataset.a; if (!a) return; if (a === 'x') return close();
      const g = id => $(id).value.trim(), social = {}; Object.keys(SOC).forEach(k => { const v = g('s_so_' + k); if (v) social[k] = v; });
      const ga = g('s_ga').toUpperCase();
      setCfg({ ...c, name: g('s_name') || docTitle(), tag: g('s_tag'), logo: g('s_logo') || '🌐', theme: $('s_theme').value, color: $('s_usecolor').checked ? $('s_color').value : '', font: $('s_font').value, nav: $('s_nav').value,
        radius: $('s_radius').value, width: $('s_width').value, darkDefault: $('s_dd').value, dark: $('s_dark').checked, sticky: $('s_sticky').checked, anim: $('s_anim').checked,
        ann: g('s_ann'), annLink: g('s_annl'), cta: g('s_cta'), ctaLink: g('s_ctal'), footer: $('s_footer').value, social,
        desc: g('s_desc'), ogImage: g('s_og'), baseUrl: g('s_base').replace(/\/+$/, ''), ga: /^G-[A-Z0-9]{4,14}$/.test(ga) ? ga : '', css: $('s_css').value });
      close(); say(ga && !/^G-[A-Z0-9]{4,14}$/.test(ga) ? 'Saved — the Analytics ID was not valid (expected G-XXXXXXXXXX), so it was left out.' : 'Site settings saved.'); if (a === 'pv') preview();
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
      $('wp3list').innerHTML = pages.map((p, i) => { const c = getPc(i); return `<div class="wp3-pr" data-i="${i}"><b>${i + 1}</b><input type="text" data-k="t" value="${esc(c.t)}" placeholder="${esc(autoTitle(p, i))}"><label title="Hide from menu"><input type="checkbox" data-k="h"${c.h ? ' checked' : ''}> hide</label><button data-a="up">▲</button><button data-a="dn">▼</button><button data-a="cfg" title="Page address, description, layout">⚙</button><button data-a="go">Go</button></div>`; }).join('');
    };
    const m = modal('Pages & menu', `<div style="color:var(--muted)">Name each page as it appears in the site menu, hide pages from the menu, or reorder them. Page 1 is the home page. Use ⚙ for a page's address, search description and layout.</div><div id="wp3list" style="display:flex;flex-direction:column;gap:6px"></div><div class="wp3-row"><button data-a="add">➕ Add page</button></div>`, 640);
    draw();
    m.oninput = e => { const r = e.target.closest('[data-i]'); if (r && e.target.dataset.k === 't') setPc(+r.dataset.i, { t: e.target.value }); };
    m.onchange = e => { const r = e.target.closest('[data-i]'); if (r && e.target.dataset.k === 'h') setPc(+r.dataset.i, { h: e.target.checked }); };
    m.onclick = e => {
      const a = e.target.dataset.a; if (!a) return; const r = e.target.closest('[data-i]'), i = r ? +r.dataset.i : 0;
      if (a === 'up') movePg(i, -1); else if (a === 'dn') movePg(i, 1); else if (a === 'cfg') return pageDlg(i); else if (a === 'go') { switchPage(i); return close(); } else if (a === 'add') { addPage(); setPc(pages.length - 1, {}); }
      draw();
    };
  }
  function pageDlg(i) {
    const c = getPc(i), p = pages[i];
    const m = modal('Page settings — page ' + (i + 1), `${fld('g_t', 'Menu title', c.t, autoTitle(p, i))}
      ${fld('g_s', 'Page address (URL name)', c.s, i ? slugify(c.t || autoTitle(p, i)) : 'index', i ? '' : 'disabled title="The home page is always index"')}
      <label class="f">Search description (about 150 characters)<input type="text" id="g_d" maxlength="160" value="${esc(c.d)}"></label>
      ${sel('g_l', 'Page layout', [['', 'Boxed (site default)'], ['narrow', 'Narrow — reading column'], ['wide', 'Wide'], ['full', 'Full width']], c.l)}
      <label class="wp3-row"><input type="checkbox" id="g_h"${c.h ? ' checked' : ''}> Hide from the menu</label>
      <div class="wp3-row" style="justify-content:flex-end"><button data-a="back">← Back</button><button class="pri" data-a="ok">Save page settings</button></div>`, 520);
    m.onclick = e => {
      const a = e.target.dataset.a; if (!a) return; if (a === 'back') return pagesDlg();
      const s = $('g_s').value.trim();
      setPc(i, { t: $('g_t').value.trim(), s: i && s ? slugify(s) : '', d: $('g_d').value.trim(), l: $('g_l').value, h: $('g_h').checked }); pagesDlg(); say('Page settings saved.');
    };
  }
  function linkDlg() {
    if (ro()) return say('This document is view-only.');
    if (pages.length < 2) return say('Add a second page first (Pages & Menu ▸ Add page).');
    const sl = getSelection().toString().trim();
    const m = modal('Link to a page', `<label class="f">Page<select id="l_p">${pages.map((p, i) => `<option value="${i}">${i + 1}. ${esc(getPc(i).t || autoTitle(p, i))}</option>`).join('')}</select></label><label class="f">Link text<input type="text" id="l_t" value="${esc(sl || 'Read more')}"></label><div class="wp3-row" style="justify-content:flex-end"><button data-a="x">Cancel</button><button class="pri" data-a="ok">Insert link</button></div>`, 380);
    m.onclick = e => { const a = e.target.dataset.a; if (!a) return; if (a === 'x') return close(); const id = pid(+$('l_p').value), t = esc($('l_t').value.trim() || 'Link'); close(); if (saved) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved); } pg().focus(); document.execCommand('insertHTML', false, `<a href="page:${id}">${t}</a>&nbsp;`); say('Page link added (Ctrl+click it to jump).'); };
  }

  /* ── embeds (video / map / calendar / form / docs / any page) as sandboxed web blocks ── */
  const frameDoc = (src, h) => `<body style="margin:0"><iframe src="${esc(src)}" style="width:100%;height:100vh;border:0" allowfullscreen loading="lazy"></iframe></body>`;
  function embedSrc(kind, v) {
    v = v.trim(); if (!v) throw new Error('Enter a link or address first.');
    if (kind === 'video') { const m = v.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([\w-]{11})/), n = v.match(/vimeo\.com\/(?:video\/)?(\d+)/); if (m) return 'https://www.youtube-nocookie.com/embed/' + m[1]; if (n) return 'https://player.vimeo.com/video/' + n[1]; throw new Error('Use a YouTube or Vimeo link.'); }
    if (kind === 'map') return 'https://maps.google.com/maps?q=' + encodeURIComponent(v) + '&output=embed';
    if (kind === 'cal') return /^https:\/\/calendar\.google\.com\//.test(v) ? v : 'https://calendar.google.com/calendar/embed?src=' + encodeURIComponent(v);
    if (!/^https:\/\//i.test(v)) throw new Error('The link must start with https://');
    if (kind === 'form') return /docs\.google\.com\/forms/.test(v) ? v.replace(/\?.*$/, '').replace(/\/edit$/, '/viewform') + '?embedded=true' : v;
    if (kind === 'gdoc') return v.replace(/\/(edit|view)(\?.*)?(#.*)?$/, '/preview');
    return v;
  }
  function embedDlg(kind) {
    if (ro()) return say('This document is view-only.');
    const ph = { video: 'YouTube or Vimeo link', map: 'Address or place (e.g. Barddhaman railway station)', cal: 'Google Calendar embed link or calendar email', form: 'Google Form link', gdoc: 'Google Docs / Slides / Sheets / Drive file link', url: 'https://…' };
    const m = modal('Embed content', `${sel('e_k', 'Type', [['video', 'Video (YouTube / Vimeo)'], ['map', 'Google Map'], ['cal', 'Google Calendar'], ['form', 'Google Form'], ['gdoc', 'Google Docs / Slides / Sheets / Drive file'], ['url', 'Any web page']], kind || 'video')}
      <label class="f"><span id="e_l"></span><input type="text" id="e_v"></label>
      <label class="f">Height (px)<input type="number" id="e_h" value="420" min="120" max="2000"></label>
      <div style="color:var(--muted)">Share Google files as <i>“Anyone with the link can view”</i> first. Some websites do not allow being embedded.</div>
      <div class="wp3-row" style="justify-content:flex-end"><button data-a="x">Cancel</button><button class="pri" data-a="ok">Insert</button></div>`, 520);
    const upd = () => { $('e_l').textContent = ph[$('e_k').value]; $('e_h').value = $('e_k').value === 'video' ? 360 : 420; }; $('e_k').onchange = upd; upd();
    m.onclick = e => { const a = e.target.dataset.a; if (!a) return; if (a === 'x') return close(); try { const src = embedSrc($('e_k').value, $('e_v').value); insertNodes([webBlock(frameDoc(src), +$('e_h').value || 420)]); close(); say('Embed added.'); } catch (err) { say(err.message); } };
  }

  /* ── contact form (FormSubmit / Formspree) ── */
  function formDlg() {
    if (ro()) return say('This document is view-only.');
    const m = modal('Contact form', `<div style="color:var(--muted)">Visitors fill in the form and the message is emailed to you. Enter your email (uses FormSubmit — the first message asks you to confirm your address once) or a Formspree form URL.</div>
      ${fld('f_to', 'Your email or Formspree URL', '', 'you@example.com')}${fld('f_title', 'Form heading', 'Get in touch')}${fld('f_btn', 'Button text', 'Send message')}
      <div class="wp3-row" style="justify-content:flex-end"><button data-a="x">Cancel</button><button class="pri" data-a="ok">Insert form</button></div>`, 500);
    m.onclick = e => {
      const a = e.target.dataset.a; if (!a) return; if (a === 'x') return close();
      const to = $('f_to').value.trim(), url = /^https:\/\/formspree\.io\/f\/\w+$/.test(to) ? to : /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(to) ? 'https://formsubmit.co/' + encodeURIComponent(to) : '';
      if (!url) return say('Enter a valid email address or Formspree URL.');
      const fs = 'width:100%;padding:10px;border:1px solid #cfd6e4;border-radius:6px;font:inherit;box-sizing:border-box;margin:4px 0 12px';
      const code = `<body style="margin:0;font-family:'Segoe UI',sans-serif;color:#1a1f2b"><form action="${esc(url)}" method="POST" target="_blank" style="padding:20px;max-width:560px"><h2 style="margin:0 0 14px">${esc($('f_title').value)}</h2>
<input type="hidden" name="_subject" value="New message from your website"><input type="hidden" name="_template" value="table"><input type="text" name="_honey" style="display:none" tabindex="-1" autocomplete="off">
<label>Your name<input required name="name" style="${fs}"></label><label>Email address<input required type="email" name="email" style="${fs}"></label><label>Message<textarea required name="message" rows="5" style="${fs}"></textarea></label>
<button style="background:#2b579a;color:#fff;border:0;padding:11px 24px;border-radius:6px;font:inherit;font-weight:600;cursor:pointer">${esc($('f_btn').value)}</button></form></body>`;
      insertNodes([webBlock(code, 430)]); close(); say('Contact form added.');
    };
  }

  /* ── countdown + tabs (interactive web blocks) ── */
  function countdownDlg() {
    if (ro()) return say('This document is view-only.');
    const m = modal('Countdown timer', `<label class="f">Event date &amp; time<input type="datetime-local" id="c_d"></label>${fld('c_l', 'Label', 'our launch')}<div class="wp3-row" style="justify-content:flex-end"><button data-a="x">Cancel</button><button class="pri" data-a="ok">Insert</button></div>`, 380);
    m.onclick = e => {
      const a = e.target.dataset.a; if (!a) return; if (a === 'x') return close(); const d = new Date($('c_d').value); if (isNaN(d)) return say('Pick a date and time.');
      const code = `<body style="margin:0;font-family:'Segoe UI',sans-serif;text-align:center;padding:26px;background:#16305a;color:#fff"><div id="t" style="font-size:36px;font-weight:700;letter-spacing:1px"></div><div style="opacity:.8;margin-top:6px">until ${esc($('c_l').value)}</div><script>var T=${d.getTime()};function u(){var s=Math.floor(Math.max(0,T-Date.now())/1e3);document.getElementById("t").textContent=Math.floor(s/86400)+"d "+Math.floor(s%86400/3600)+"h "+Math.floor(s%3600/60)+"m "+(s%60)+"s"}u();setInterval(u,1000)<\/script></body>`;
      insertNodes([webBlock(code, 150)]); close(); say('Countdown added.');
    };
  }
  const TABS_CODE = `<body style="margin:0;font-family:'Segoe UI',sans-serif"><style>.t{display:flex;gap:4px;border-bottom:2px solid #d6deef}.t button{border:0;background:none;padding:10px 16px;font:600 14px inherit;font-family:inherit;cursor:pointer;color:#667085;border-bottom:3px solid transparent;margin-bottom:-2px}.t button.on{color:#2b579a;border-color:#2b579a}.p{display:none;padding:16px 4px}.p.on{display:block}</style><div class="t"><button class="on" data-i="0">Overview</button><button data-i="1">Details</button><button data-i="2">Pricing</button></div><div class="p on">[Overview content.]</div><div class="p">[Details content.]</div><div class="p">[Pricing content.]</div><script>var b=document.querySelectorAll(".t button"),p=document.querySelectorAll(".p");b.forEach(function(x){x.onclick=function(){b.forEach(function(y){y.classList.remove("on")});p.forEach(function(y){y.classList.remove("on")});x.classList.add("on");p[x.dataset.i].classList.add("on")}})<\/script></body>`;

  /* ── table of contents ── */
  function tocBlock() {
    if (ro()) return say('This document is view-only.');
    const p = pg(), hs = [...p.querySelectorAll('h2,h3')].filter(h => h.textContent.trim()); if (!hs.length) return say('Add some Heading 2 / Heading 3 titles to this page first.');
    const used = new Set([...p.querySelectorAll('[id]')].map(n => n.id));
    hs.forEach(h => { if (!h.id) { let id = 'sec-' + slugify(h.textContent).slice(0, 30), k = 2, base = id; while (used.has(id)) id = base + '-' + k++; h.id = id; used.add(id); } });
    addHtml(`<div style="${CARD};margin:12px 0"><b>On this page</b><ul style="margin:8px 0 0">${hs.map(h => `<li style="margin-left:${h.tagName === 'H3' ? 18 : 0}px"><a href="#${h.id}">${esc(h.textContent.trim())}</a></li>`).join('')}</ul></div>`);
  }

  /* ── section styling (wrap the block you are in) ── */
  function secDlg() {
    if (ro()) return say('This document is view-only.');
    const blk = topBlock(); if (!blk) return say('Click inside the block you want to style, then try again.');
    const sec = blk.classList.contains('wp-sec') ? blk : null, st = sec ? sec.style : {};
    const hex = v => { const m = String(v || '').match(/\d+/g); return m && m.length >= 3 ? '#' + m.slice(0, 3).map(x => (+x).toString(16).padStart(2, '0')).join('') : ''; };
    const bg = hex(st.backgroundColor), fg = hex(st.color);
    const m = modal('Style this section', `<div style="color:var(--muted)">Wraps the selected block in a styled section — background, text colour, spacing, shape and alignment.</div>
      <div class="wp3-g"><label class="f">Background<span class="wp3-row"><input type="color" id="x_bg" value="${bg || '#eaf1fd'}"><label style="font-weight:400"><input type="checkbox" id="x_ubg"${bg ? ' checked' : ''}> use</label></span></label>
      <label class="f">Text colour<span class="wp3-row"><input type="color" id="x_fg" value="${fg || '#1a1f2b'}"><label style="font-weight:400"><input type="checkbox" id="x_ufg"${fg ? ' checked' : ''}> use</label></span></label>
      ${sel('x_pad', 'Spacing inside', [['0', 'None'], ['12', 'Small'], ['24', 'Medium'], ['48', 'Large']], st.padding ? parseInt(st.padding) : 24)}${sel('x_rad', 'Corners', [['0', 'Square'], ['8', 'Rounded'], ['18', 'Soft']], st.borderRadius ? parseInt(st.borderRadius) : 8)}
      ${sel('x_al', 'Text alignment', [['', 'Left (default)'], ['center', 'Centred'], ['right', 'Right']], st.textAlign || '')}${sel('x_w', 'Width', [['', 'Full'], ['640px', 'Narrow, centred'], ['820px', 'Medium, centred']], st.maxWidth || '')}
      <label class="wp3-row"><input type="checkbox" id="x_bd"${st.border ? ' checked' : ''}> Border</label><label class="wp3-row"><input type="checkbox" id="x_sh"${st.boxShadow ? ' checked' : ''}> Shadow</label></div>
      <div class="wp3-row" style="justify-content:flex-end">${sec ? '<button data-a="un">Remove styling</button>' : ''}<button data-a="x">Cancel</button><button class="pri" data-a="ok">Apply</button></div>`, 520);
    m.onclick = e => {
      const a = e.target.dataset.a; if (!a) return; if (a === 'x') return close();
      if (a === 'un') { sec.replaceWith(...sec.childNodes); dirty(pg()); close(); return say('Section styling removed.'); }
      let s = sec; if (!s) { s = document.createElement('div'); s.className = 'wp-sec'; blk.before(s); s.appendChild(blk); }
      s.style.cssText = ''; const S = s.style;
      if ($('x_ubg').checked) S.backgroundColor = $('x_bg').value; if ($('x_ufg').checked) S.color = $('x_fg').value;
      S.padding = $('x_pad').value + 'px'; S.borderRadius = $('x_rad').value + 'px'; S.margin = '14px auto';
      if ($('x_al').value) S.textAlign = $('x_al').value; if ($('x_w').value) S.maxWidth = $('x_w').value;
      if ($('x_bd').checked) S.border = '1px solid rgba(127,127,127,.35)'; if ($('x_sh').checked) S.boxShadow = '0 4px 18px rgba(0,0,0,.12)';
      dirty(s); close(); say('Section styled.');
    };
  }

  /* ── building blocks & starter sites (colours follow the site theme once published) ── */
  const A = 'var(--a,#2b579a)', N = 'var(--n,#16305a)', SOFT = 'var(--soft,#eaf1fd)', LINE = 'var(--line,#d6deef)', MUT = 'var(--muted,#667085)', CBG = 'var(--card,#fff)';
  const BTN = `display:inline-block;background:${A};color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:600`;
  const BTN2 = `display:inline-block;border:2px solid ${A};color:${A};padding:8px 20px;border-radius:6px;text-decoration:none;font-weight:600`;
  const CARD = `border:1px solid ${LINE};border-radius:10px;padding:16px 18px;box-shadow:0 2px 8px rgba(0,0,0,.07);background:${CBG}`;
  const cols = (n, f) => `<table style="width:100%;border-collapse:collapse"><tr>${Array.from({ length: n }, (_, i) => `<td style="border:none;padding:8px;vertical-align:top;width:${100 / n}%">${f(i + 1)}</td>`).join('')}</tr></table>`;
  const ph = (h, t) => `<div style="background:${SOFT};border-radius:8px;height:${h}px;text-align:center;line-height:${h}px;color:${MUT}">${t}</div>`;
  const BLOCKS = {
    hero: `<div style="background:${SOFT};padding:56px 28px;text-align:center;border-radius:10px"><h1 style="font-size:32pt;margin:0 0 10px">[Your headline]</h1><p style="font-size:14pt;color:${MUT}">[One sentence describing what you offer.]</p><p><a href="#" style="${BTN}">Get started</a> &nbsp; <a href="#" style="${BTN2}">Learn more</a></p></div>`,
    herodark: `<div style="background:${N};color:#fff;padding:64px 28px;text-align:center;border-radius:10px"><p style="letter-spacing:4px;margin:0;opacity:.8">[TAGLINE]</p><h1 style="font-size:34pt;margin:8px 0;color:#fff">[Your headline]</h1><p style="font-size:14pt;opacity:.9">[Supporting sentence.]</p><p><a href="#" style="${BTN};background:#fff;color:${N}">Get started</a></p></div>`,
    split: cols(2, n => n === 1 ? ph(220, 'Replace with a photo') : `<h2 style="margin-top:0">[Section heading]</h2><p>[A few sentences that explain your story, product or service.]</p><p><a href="#" style="${BTN}">Read more</a></p>`),
    features: cols(3, n => `<div style="${CARD};text-align:center"><div style="font-size:34px">${['⚡', '🛡️', '💡'][n - 1]}</div><h3 style="margin:6px 0">Feature ${n}</h3><p style="color:${MUT};margin:0">[Short description.]</p></div>`),
    columns: cols(3, n => `<h3 style="color:${A}">Feature ${n}</h3><p>[Short description.]</p>`),
    steps: cols(3, n => `<div style="text-align:center"><div style="display:inline-block;width:44px;height:44px;line-height:44px;border-radius:50%;background:${A};color:#fff;font-weight:700;font-size:18px">${n}</div><h3 style="margin:8px 0 4px">Step ${n}</h3><p style="color:${MUT};margin:0">[What happens here.]</p></div>`),
    card: `<div style="${CARD};margin:10px 0"><h3 style="margin-top:0">[Card title]</h3><p>[Card text.]</p><a href="#">Learn more →</a></div>`,
    cards: cols(3, n => `<div style="${CARD}">${ph(110, 'Image')}<h3 style="margin:10px 0 4px">[Post title ${n}]</h3><p style="color:${MUT};margin:0 0 8px">[A one-line summary.]</p><a href="#">Read more →</a></div>`),
    gallery: cols(3, n => `${ph(120, 'Photo ' + n)}<p style="text-align:center;color:${MUT};font-size:10pt">Caption ${n}</p>`),
    carousel: `<div style="display:flex;gap:12px;overflow-x:auto;scroll-snap-type:x mandatory;padding:6px 0">${[1, 2, 3, 4].map(n => `<div style="flex:0 0 78%;scroll-snap-align:center;background:${SOFT};border-radius:10px;padding:46px 24px;text-align:center"><h3 style="margin:0">Slide ${n}</h3><p style="color:${MUT};margin:6px 0 0">[Slide text — swipe or scroll sideways.]</p></div>`).join('')}</div>`,
    testimonial: `<div style="background:${SOFT};border-left:5px solid ${A};border-radius:6px;padding:16px 20px;margin:12px 0"><p style="font-size:13pt;font-style:italic;margin:0 0 8px">“[A short, genuine quote from a happy customer.]”</p><b>[Name]</b> <span style="color:${MUT}">· [Role, company]</span></div>`,
    testimonials: cols(3, n => `<div style="${CARD}"><p style="font-style:italic;margin-top:0">“[Genuine customer quote ${n}.]”</p><b>[Name]</b><br><span style="color:${MUT}">[Role]</span></div>`),
    team: cols(3, n => `<div style="text-align:center"><div style="width:96px;height:96px;border-radius:50%;background:${SOFT};margin:0 auto 8px;line-height:96px;font-size:34px">👤</div><b>[Name ${n}]</b><br><span style="color:${MUT}">[Role]</span></div>`),
    timeline: `<div style="border-left:3px solid ${A};margin:14px 0 14px 8px;padding-left:18px">${['2022', '2023', '2024'].map(y => `<p style="margin:0 0 16px"><b style="color:${A}">${y}</b><br>[What happened this year.]</p>`).join('')}</div>`,
    logos: cols(5, n => `<div style="background:${SOFT};border-radius:8px;padding:16px 4px;text-align:center;color:${MUT};font-weight:600">Logo ${n}</div>`),
    pricing: cols(3, n => `<div style="${CARD};text-align:center"><h3 style="margin-top:0">${['Basic', 'Standard', 'Premium'][n - 1]}</h3><p style="font-size:24pt;margin:6px 0;color:${A}"><b>₹${n * 199}</b></p><p style="color:${MUT}">per month</p><p>✓ [Feature]<br>✓ [Feature]<br>✓ [Feature]</p><a href="#" style="${BTN}">Choose</a></div>`),
    stats: cols(3, n => `<p style="text-align:center;margin:0"><b style="font-size:26pt;color:${A}">${['500+', '10 yrs', '4.9★'][n - 1]}</b><br><span style="color:${MUT}">[Label]</span></p>`),
    cta: `<div style="background:${A};color:#fff;padding:36px 24px;text-align:center;border-radius:10px;margin:14px 0"><h2 style="margin:0 0 8px;color:#fff">[Ready to get started?]</h2><p style="margin:0 0 16px;opacity:.9">[A short reason to act today.]</p><a href="#" style="${BTN};background:#fff;color:${A}">Contact us</a></div>`,
    notice: `<div style="background:${SOFT};border-left:5px solid ${A};border-radius:6px;padding:12px 16px;margin:12px 0"><b>Note:</b> [Important information for visitors.]</div>`,
    faq: '<h2>Frequently asked questions</h2><details open><summary>[Question one?]</summary><p>[Answer.]</p></details><details><summary>[Question two?]</summary><p>[Answer.]</p></details><details><summary>[Question three?]</summary><p>[Answer.]</p></details>',
    contact: `<div style="${CARD};margin:12px 0"><h2 style="margin-top:0">Contact us</h2><p>📧 <a href="mailto:you@example.com">you@example.com</a><br>📞 [+91 00000 00000]<br>📍 [Address]<br>🕘 [Opening hours]</p><a href="mailto:you@example.com" style="${BTN}">Send an email</a></div>`,
    social: '<p style="text-align:center">Follow us: <a href="#">Instagram</a> · <a href="#">YouTube</a> · <a href="#">Facebook</a> · <a href="#">LinkedIn</a></p>',
    button: `<p style="text-align:center"><a href="#" style="${BTN}">[Button text]</a></p>`,
    divider: `<hr style="border:0;border-top:2px solid ${LINE};margin:26px 0">`,
    spacer: '<p><br></p><p><br></p><p><br></p>'
  };
  const BLOCK_MENU = [['Hero & banners', [['hero', 'Hero (light)'], ['herodark', 'Hero (dark)'], ['cta', 'Call-to-action band'], ['notice', 'Notice box']]],
    ['Content', [['split', 'Image + text'], ['features', 'Feature cards'], ['columns', '3 columns'], ['steps', 'Steps'], ['card', 'Card'], ['cards', 'Card grid (blog)'], ['timeline', 'Timeline'], ['faq', 'FAQ'], ['stats', 'Stats']]],
    ['Media', [['gallery', 'Photo gallery'], ['carousel', 'Slide carousel'], ['logos', 'Logo strip']]],
    ['People & proof', [['team', 'Team'], ['testimonial', 'Testimonial'], ['testimonials', '3 testimonials'], ['pricing', 'Pricing']]],
    ['Contact & links', [['contact', 'Contact card'], ['social', 'Social links'], ['button', 'Button']]],
    ['Layout', [['divider', 'Divider'], ['spacer', 'Spacer']]],
    ['Interactive', [['tabs', 'Tabs'], ['countdown', 'Countdown timer'], ['toc', 'Table of contents']]]];
  const SITES = {
    business: BLOCKS.hero + '<h2 style="text-align:center;margin-top:28px">What we do</h2>' + BLOCKS.features + BLOCKS.stats + '<h2 style="text-align:center">What clients say</h2>' + BLOCKS.testimonials + '<h2 style="text-align:center">Plans</h2>' + BLOCKS.pricing + BLOCKS.faq + BLOCKS.cta + BLOCKS.contact,
    landing: BLOCKS.herodark + BLOCKS.logos + '<h2 style="text-align:center">Why choose us</h2>' + BLOCKS.features + '<h2 style="text-align:center">How it works</h2>' + BLOCKS.steps + BLOCKS.testimonial + BLOCKS.pricing + BLOCKS.faq + BLOCKS.cta,
    portfolio: `<div style="text-align:center;padding:26px 0"><h1 style="font-size:30pt;margin:0">[Your Name]</h1><p style="color:${MUT};font-size:13pt">[Designer · Developer · Writer]</p></div>${BLOCKS.split}<h2>Projects</h2>${BLOCKS.gallery}${BLOCKS.cards}<h2>Experience</h2>${BLOCKS.timeline}<h2>Contact</h2>${BLOCKS.social}`,
    resume: `<h1 style="margin-bottom:0">[Your Name]</h1><p style="color:${MUT};margin-top:4px">[Role] · [City] · <a href="mailto:you@example.com">you@example.com</a></p>${BLOCKS.divider}<h2>Summary</h2><p>[Two or three sentences about your strengths.]</p><h2>Experience</h2>${BLOCKS.timeline}<h2>Skills</h2><p>[Skill] · [Skill] · [Skill] · [Skill]</p><h2>Education</h2><p><b>[Degree]</b> — [Institution], [Year]</p>`,
    blog: `<h1 style="font-size:28pt">[Post title]</h1><p style="color:${MUT}">By [Author] · [Date]</p><p style="font-size:13pt">[Opening paragraph that hooks the reader.]</p><h2>[Section]</h2><p>[Content.]</p><blockquote>[A pull quote.]</blockquote><h2>[Section]</h2><p>[Content.]</p>${BLOCKS.cta}`,
    agency: BLOCKS.herodark + '<h2 style="text-align:center">Services</h2>' + BLOCKS.features + '<h2 style="text-align:center">Selected work</h2>' + BLOCKS.gallery + '<h2 style="text-align:center">Our team</h2>' + BLOCKS.team + BLOCKS.testimonial + BLOCKS.cta + BLOCKS.contact,
    restaurant: `<div style="background:${N};color:#fff;padding:60px 24px;text-align:center;border-radius:10px"><p style="letter-spacing:4px;margin:0">[CUISINE] · [CITY]</p><h1 style="font-size:34pt;margin:8px 0;color:#fff">[Restaurant name]</h1><p><a href="#" style="${BTN};background:#fff;color:${N}">Reserve a table</a></p></div>${BLOCKS.split}<h2 style="text-align:center">Menu highlights</h2>${BLOCKS.cards}<h2 style="text-align:center">Gallery</h2>${BLOCKS.gallery}<h2 style="text-align:center">Visit us</h2>${BLOCKS.contact}`,
    nonprofit: BLOCKS.hero + '<h2 style="text-align:center">Our impact</h2>' + BLOCKS.stats + BLOCKS.split + '<h2 style="text-align:center">Ways to help</h2>' + BLOCKS.features + BLOCKS.testimonial + BLOCKS.cta + BLOCKS.contact,
    event: `<div style="background:${N};color:#fff;padding:50px 24px;text-align:center;border-radius:10px"><p style="letter-spacing:4px;margin:0">YOU ARE INVITED</p><h1 style="font-size:30pt;margin:8px 0;color:#fff">[Event name]</h1><p>[Date] · [Time] · [Venue]</p><p><a href="#" style="${BTN};background:#f5c518;color:#222">RSVP</a></p></div><h2>Schedule</h2><table style="width:100%;border-collapse:collapse"><tr><td style="border:1px solid #ccc;padding:6px"><b>10:00</b></td><td style="border:1px solid #ccc;padding:6px">[Opening]</td></tr><tr><td style="border:1px solid #ccc;padding:6px"><b>11:00</b></td><td style="border:1px solid #ccc;padding:6px">[Session]</td></tr></table><h2>Speakers</h2>${BLOCKS.team}<h2>Location</h2><p>[Address]</p>${BLOCKS.faq}`,
    classroom: `<h1>[Class / Club name]</h1><p style="color:${MUT}">[Teacher / organiser] · [Term]</p>${BLOCKS.features}<h2>Announcements</h2><ul><li>[Date] — [News]</li></ul><h2>Resources</h2><ul><li><a href="#">[Syllabus]</a></li><li><a href="#">[Assignments]</a></li></ul>${BLOCKS.contact}`
  };
  const SITE_MENU = [['business', 'Business'], ['landing', 'Product landing page'], ['agency', 'Agency'], ['portfolio', 'Portfolio'], ['resume', 'Resume / CV'], ['blog', 'Blog post'], ['restaurant', 'Restaurant / café'], ['nonprofit', 'Non-profit'], ['event', 'Event'], ['classroom', 'Class / club']];
  function addBlock(k) {
    if (k === 'tabs') { if (ro()) return say('This document is view-only.'); return insertNodes([webBlock(TABS_CODE, 220)]); }
    if (k === 'countdown') return countdownDlg(); if (k === 'toc') return tocBlock(); addHtml(BLOCKS[k]);
  }

  /* ── site builder (export / preview / publish) ── */
  function palette(c) { const th = THEMES[c.theme] || THEMES.blue, a = isHex(c.color) ? c.color : th[1], n = isHex(c.color) ? mix(c.color, '#000000', .6) : th[2]; return { a, n, ad: mix(a, '#ffffff', .3) }; }
  function siteCss(c) {
    const { a, n, ad } = palette(c), f = (FONTS[c.font] || FONTS.sans)[0], side = c.nav === 'side', r = +c.radius >= 0 ? +c.radius : 10, w = +c.width || 900;
    return `:root{--a:${a};--n:${n};--bg:#f3f5f9;--card:#fff;--text:#1a1f2b;--muted:#667085;--line:#e1e5ee;--soft:#eef2f9;--r:${r}px}
@supports(color:color-mix(in srgb,red,blue)){:root{--soft:color-mix(in srgb,var(--a) 10%,var(--card))}}
[data-dark]{--a:${ad};--bg:#12161d;--card:#1b222d;--text:#e6e9ef;--muted:#9aa4b5;--line:#2c3646}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:${f};color:var(--text);background:var(--bg);line-height:1.65}
.ann{background:var(--a);color:#fff;text-align:center;padding:7px 14px;font-size:14px}.ann a{color:#fff;font-weight:600}
.shell{display:${side ? 'flex' : 'block'};min-height:100vh}.side-nav,.top-nav{background:var(--n);color:#fff}
.top-nav{${c.sticky ? 'position:sticky;top:0;' : ''}z-index:20;display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:8px 18px}
.side-nav{width:250px;flex:none;padding:18px 12px;position:sticky;top:0;height:100vh;overflow:auto}
.brand{display:flex;align-items:center;gap:10px;margin-right:12px;color:#fff;text-decoration:none}.brand .lg{font-size:24px}.brand b{font-size:17px;display:block;line-height:1.1}.brand small{opacity:.75;font-size:11px}
nav.m{display:flex;gap:4px;flex-wrap:wrap;align-items:center;${side ? 'flex-direction:column;align-items:stretch;margin-top:18px' : ''}}nav.m a{color:#fff;text-decoration:none;padding:7px 13px;border-radius:7px;font-size:14px}nav.m a:hover,nav.m a.on{background:rgba(255,255,255,.18)}
nav.m a.cta{background:#fff;color:var(--n);font-weight:600;text-align:center}nav.m a.cta:hover{background:#fff;opacity:.9}
.tools{margin-left:auto;display:flex;gap:6px}.tools button{background:rgba(255,255,255,.15);color:#fff;border:none;border-radius:6px;padding:6px 10px;cursor:pointer;font-size:14px}#mn{display:none}
.content{flex:1;min-width:0}.pg{max-width:${w}px;margin:26px auto;padding:44px 40px;background:var(--card);border-radius:var(--r);box-shadow:0 2px 12px rgba(0,0,0,.07);overflow-wrap:anywhere}
.pg.narrow{max-width:680px}.pg.wide{max-width:1200px}.pg.full{max-width:none;margin:0;border-radius:0;box-shadow:none}
.pg h1,.pg h2,.pg h3{color:var(--a)}img{max-width:100%;height:auto}table{border-collapse:collapse;max-width:100%}td,th{border:1px solid var(--line);padding:6px 10px}
.pg table[style*="border-collapse"] td{border-color:transparent}
.wp-web iframe{width:100%;border:0}a{color:var(--a)}blockquote{border-left:4px solid var(--a);margin:12px 0;padding:4px 16px;color:var(--muted)}pre{background:rgba(127,127,127,.12);padding:10px;overflow:auto}
details{border:1px solid var(--line);border-radius:6px;padding:8px 12px;margin:6px 0}summary{cursor:pointer;font-weight:600}
footer.sf{text-align:center;color:var(--muted);padding:22px 12px;font-size:13px}footer.sf .soc{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;margin-bottom:10px}footer.sf .soc a{text-decoration:none;font-weight:600}
#tt{position:fixed;right:18px;bottom:18px;width:42px;height:42px;border:none;border-radius:50%;background:var(--a);color:#fff;font-size:18px;cursor:pointer;box-shadow:0 3px 12px rgba(0,0,0,.3);display:none;z-index:30}
.ra .pg>*{opacity:0;transform:translateY(14px);transition:opacity .6s,transform .6s}.ra .pg>.in{opacity:1;transform:none}
@media(max-width:760px){.shell{display:block}.side-nav{width:auto;height:auto;position:static}#mn{display:inline-block}nav.m{display:none;flex-direction:column;align-items:stretch;width:100%}body.open nav.m{display:flex}.pg{margin:0;border-radius:0;padding:22px 16px;box-shadow:none}.pg table[style*="border-collapse"] td{display:block;width:100%!important}}
@media print{.top-nav,.side-nav,#tt,.ann{display:none}.pg{box-shadow:none;margin:0}}
${cleanCss(c.css)}`;
  }
  const siteJs = () => '<script>(function(){var d=document.documentElement,b=document.getElementById("dk"),df=d.getAttribute("data-dd");try{var s=localStorage.getItem("dk");if(s==="1"||(s===null&&(df==="dark"||(df==="auto"&&window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches))))d.setAttribute("data-dark","")}catch(e){}if(b)b.onclick=function(){var o=d.toggleAttribute("data-dark");try{localStorage.setItem("dk",o?"1":"0")}catch(e){}};var m=document.getElementById("mn");if(m)m.onclick=function(){document.body.classList.toggle("open")};var t=document.getElementById("tt");if(t){t.onclick=function(){window.scrollTo({top:0,behavior:"smooth"})};window.addEventListener("scroll",function(){t.style.display=window.scrollY>400?"block":"none"})}if(d.hasAttribute("data-anim")&&"IntersectionObserver"in window){d.classList.add("ra");var o=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add("in");o.unobserve(e.target)}})},{threshold:.06});document.querySelectorAll(".pg>*").forEach(function(n){o.observe(n)})}})();<\/script>';
  function collect() {
    const used = new Set();
    return pages.map((p, i) => {
      const pc = getPc(i), title = pc.t || autoTitle(p, i); let base = i ? slugify(pc.s || title) : 'index', slug = base, k = 2; while (used.has(slug)) slug = base + '-' + k++; used.add(slug);
      const c = p.cloneNode(true);
      c.querySelectorAll('.wp-cfg,.wp-pcfg,.img-handle,#drawCanvasOverlay,.wp-web-bar,.wp-wm').forEach(n => n.remove()); c.querySelectorAll('mark.wp-hit').forEach(n => n.replaceWith(...n.childNodes));
      c.querySelectorAll('img.draggable').forEach(im => { im.style.position = 'static'; im.style.transform = ''; im.style.maxWidth = '100%'; }); c.querySelectorAll('.wp-web').forEach(w => w.removeAttribute('contenteditable'));
      c.querySelectorAll('.wp-sec').forEach(s => s.classList.remove('wp-sec'));
      return { i, id: pc.id, title, hidden: pc.h, slug, desc: pc.d, layout: pc.l, html: safe(c.innerHTML) };
    });
  }
  function shell(c, items, cur, o) {
    const year = new Date().getFullYear(), foot = esc(c.footer.replace(/\{year\}/g, year).replace(/\{name\}/g, c.name)), ext = u => /^https?:/i.test(u) ? ' target="_blank" rel="noopener"' : '';
    const cl = safeUrl(c.ctaLink), al = safeUrl(c.annLink);
    const nav = '<nav class="m">' + items.filter(x => !x.hidden || x === cur).map(x => `<a href="${o.href(x)}"${x === cur ? ' class="on"' : ''}>${esc(x.title)}</a>`).join('') + (c.cta && cl ? `<a class="cta" href="${esc(cl)}"${ext(cl)}>${esc(c.cta)}</a>` : '') + '</nav>';
    const tools = `<span class="tools">${c.dark ? '<button id="dk" title="Dark mode">🌓</button>' : ''}<button id="mn" title="Menu">☰</button></span>`;
    const brand = `<a class="brand" href="${o.href(items[0])}"><span class="lg">${esc(c.logo)}</span><span><b>${esc(c.name)}</b>${c.tag ? `<small>${esc(c.tag)}</small>` : ''}</span></a>`;
    const soc = Object.keys(SOC).map(k => { let v = ((c.social || {})[k] || '').trim(); if (!v) return ''; if (k === 'email' && /@/.test(v) && !/^mailto:/i.test(v)) v = 'mailto:' + v; else if (k === 'whatsapp' && /^\+?[\d\s-]{7,}$/.test(v)) v = 'https://wa.me/' + v.replace(/\D/g, ''); v = safeUrl(v); return v ? `<a href="${esc(v)}"${ext(v)}>${esc(SOC[k])}</a>` : ''; }).join('');
    const fav = 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">${c.logo.slice(0, 2)}</text></svg>`);
    const desc = (cur && cur.desc) || c.desc, ttl = cur && cur.i ? cur.title + ' — ' + c.name : c.name, og = /^https?:\/\//i.test(c.ogImage) ? c.ogImage : '';
    const canon = c.baseUrl && /^https?:\/\//i.test(c.baseUrl) && o.file && cur ? `<link rel="canonical" href="${esc(c.baseUrl + '/' + (cur.i ? o.file(cur) : ''))}">` : '';
    const ga = /^G-[A-Z0-9]{4,14}$/.test(c.ga || '') ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${c.ga}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag("js",new Date());gtag("config","${c.ga}")</script>` : '';
    const head = `<!DOCTYPE html><html lang="en" data-dd="${esc(c.darkDefault)}"${c.anim ? ' data-anim' : ''}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(ttl)}</title>${desc ? `<meta name="description" content="${esc(desc)}"><meta property="og:description" content="${esc(desc)}">` : ''}<meta property="og:title" content="${esc(ttl)}"><meta property="og:type" content="website"><meta name="twitter:card" content="${og ? 'summary_large_image' : 'summary'}">${og ? `<meta property="og:image" content="${esc(og)}">` : ''}${canon}<link rel="icon" href="${fav}">${o.css}${ga}</head>`;
    const main = o.body.replace(/href="page:(\w+)"/g, (m, id) => { const t = items.find(x => x.id === id); return t ? `href="${o.href(t)}"` : 'href="#"'; });
    const annBar = c.ann ? `<div class="ann">${al ? `<a href="${esc(al)}"${ext(al)}>${esc(c.ann)} →</a>` : esc(c.ann)}</div>` : '';
    const inner = `<div class="content">${main}<footer class="sf">${soc ? `<div class="soc">${soc}</div>` : ''}${foot}</footer></div>`;
    return head + '<body>' + annBar + (c.nav === 'side' ? `<div class="shell"><aside class="side-nav">${brand}${tools}${nav}</aside>${inner}</div>` : `<div class="shell"><header class="top-nav">${brand}${nav}${tools}</header>${inner}</div>`) + '<button id="tt" title="Back to top">↑</button>' + siteJs() + '</body></html>';
  }
  function singleSite() {
    const c = getCfg(), items = collect();
    return shell(c, items, null, { css: `<style>${siteCss(c)}</style>`, href: x => '#' + x.slug, body: items.map(x => `<section class="pg ${esc(x.layout)}" id="${x.slug}">${x.html}</section>`).join('') });
  }
  function multiSite() {
    const c = getCfg(), items = collect(), f = { 'style.css': siteCss(c) }, file = x => x.i ? x.slug + '.html' : 'index.html';
    items.forEach(x => { f[file(x)] = shell(c, items, x, { css: '<link rel="stylesheet" href="style.css">', href: file, file, body: `<main class="pg ${esc(x.layout)}">${x.html}</main>` }); });
    f['404.html'] = shell(c, items, null, { css: '<link rel="stylesheet" href="style.css">', href: file, body: '<main class="pg"><h1>Page not found</h1><p>Sorry, that page does not exist. <a href="index.html">Go to the home page</a>.</p></main>' });
    if (/^https?:\/\//i.test(c.baseUrl)) {
      f['sitemap.xml'] = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + items.map(x => `  <url><loc>${esc(c.baseUrl + '/' + (x.i ? file(x) : ''))}</loc></url>`).join('\n') + '\n</urlset>\n';
      f['robots.txt'] = `User-agent: *\nAllow: /\nSitemap: ${c.baseUrl}/sitemap.xml\n`;
    }
    f['README.txt'] = `${c.name}\n\nUpload every file in this folder to your host (Netlify, GitHub Pages, Firebase Hosting or any web server). index.html is the home page.\nEdit the document in Pro Document and export again to update the site.\n`;
    return f;
  }
  const dl = (name, blob) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); };

  function preview() {
    const m = modal('Website preview', `<div class="wp3-row"><button data-d="100%">🖥 Desktop</button><button data-d="768px">📱 Tablet</button><button data-d="390px">📱 Mobile</button><span style="color:var(--muted)">Sandboxed. Page links and the dark-mode switch work.</span></div><div style="background:#e8ecf3;padding:8px;display:flex;justify-content:center;border-radius:6px"><iframe id="wp3pv" class="wp3-fr" sandbox="${SANDBOX}" style="height:64vh;width:100%;transition:width .2s"></iframe></div>`, 1040);
    $('wp3pv').srcdoc = singleSite(); m.onclick = e => { const d = e.target.dataset.d; if (d) $('wp3pv').style.width = d; };
  }

  /* ── Site check: SEO, accessibility and leftover-placeholder audit ── */
  function checkDlg() {
    const c = getCfg(), items = [], add = (lv, t) => items.push([lv, t]), ids = new Set(pages.map((p, i) => getPc(i).id).filter(Boolean)), titles = {};
    pages.forEach((p, i) => {
      const cl = p.cloneNode(true); cl.querySelectorAll('.wp-cfg,.wp-pcfg,.img-handle,#drawCanvasOverlay,.wp-web').forEach(n => n.remove()); const pc = getPc(i), name = `Page ${i + 1} (${esc(pc.t || autoTitle(p, i))})`;
      const h1 = cl.querySelectorAll('h1').length; if (!h1) add('warn', `${name}: no main heading (Heading 1). Every page should have one.`); else if (h1 > 1) add('warn', `${name}: ${h1} Heading 1s — use only one per page.`);
      const noAlt = [...cl.querySelectorAll('img')].filter(im => !(im.getAttribute('alt') || '').trim()).length; if (noAlt) add('warn', `${name}: ${noAlt} image${noAlt > 1 ? 's' : ''} without alt text (needed for accessibility and search).`);
      const ph = (cl.textContent.match(/\[[A-Za-z][^\]\[]{2,60}\]/g) || []).length; if (ph) add('bad', `${name}: ${ph} placeholder${ph > 1 ? 's' : ''} like “[…]” still to replace.`);
      const hash = cl.querySelectorAll('a[href="#"]').length; if (hash) add('warn', `${name}: ${hash} link${hash > 1 ? 's' : ''} that go nowhere (“#”). Add a real address.`);
      const broken = [...cl.querySelectorAll('a[href^="page:"]')].filter(a => !ids.has(a.getAttribute('href').slice(5))).length; if (broken) add('bad', `${name}: ${broken} broken page link${broken > 1 ? 's' : ''}.`);
      if (pages.length > 1 && !pc.d && !pc.h) add('warn', `${name}: no search description (Pages &amp; Menu ▸ ⚙).`);
      const t = (pc.t || autoTitle(p, i)).toLowerCase(); (titles[t] = titles[t] || []).push(i + 1);
    });
    Object.keys(titles).forEach(t => { if (titles[t].length > 1) add('warn', `Pages ${titles[t].join(', ')} share the same menu title — give each its own.`); });
    if (!c.desc) add('warn', 'No site search description — add one in Site Settings ▸ SEO &amp; tracking.');
    if (c.name === docTitle() && /^(untitled|my website)/i.test(c.name)) add('warn', 'The site still uses a default name — set one in Site Settings.');
    if (!c.baseUrl) add('info', 'Add your website address in Site Settings ▸ SEO to include a sitemap in the .zip export.');
    const sz = singleSite().length; add(sz > MAX_HTML ? 'bad' : sz > MAX_HTML * .7 ? 'warn' : 'ok', `Site size: ${(sz / 1048576).toFixed(2)} MB of the 2 MB publishing limit.`);
    if (!items.some(x => x[0] === 'bad' || x[0] === 'warn')) add('ok', 'No problems found — your site is ready to publish.');
    const ic = { ok: '✅', warn: '⚠️', bad: '❌', info: 'ℹ️' };
    modal('Site check', items.map(x => `<div class="wp3-chk ${x[0] === 'info' ? '' : x[0]}"><span>${ic[x[0]]}</span><span>${x[1]}</span></div>`).join('') + '<div class="wp3-row" style="justify-content:flex-end"><button data-x2 onclick="document.getElementById(\'wp3m\').remove()">Close</button></div>', 620);
  }
  function helpDlg() {
    modal('How to publish your website', `<div style="line-height:1.7">
      <b>Build your site</b>
      <ol style="margin:4px 0 10px;padding-left:20px">
        <li>Pick a <b>Starter site</b> (or start blank) and replace the <code>[placeholders]</code>. Use <b>Add block</b> for hero banners, features, pricing, team, FAQ, carousels and more.</li>
        <li>Use <b>Style section</b> to change a block's background, spacing, corners and alignment. Use <b>Embed</b> for videos, maps, calendars and Google Forms, and <b>Contact form</b> to receive messages by email.</li>
        <li>Open <b>⚙ Site Settings</b> for colours, fonts, announcement bar, menu button, social links, SEO and analytics. Open <b>🗂 Pages &amp; Menu</b> to name, order, hide and configure pages (⚙ sets each page's address, description and layout).</li>
        <li>Run <b>✔ Site Check</b> to catch missing alt text, placeholders, broken links and size problems, then <b>👁 Preview</b> on Desktop, Tablet and Mobile.</li>
      </ol>
      <b>Publish to a live link (recommended)</b>
      <ol style="margin:4px 0 10px;padding-left:20px">
        <li>Click <b>🚀 Publish</b>, choose an address name (3–50 letters, numbers or hyphens, e.g. <i>my-portfolio</i>) and press <b>Publish</b>.</li>
        <li>Your link looks like <code>${esc(pub('my-portfolio'))}</code>. Use <b>Copy link</b> or <b>Open</b> to share it.</li>
      </ol>
      <b>After publishing</b>
      <ul style="margin:4px 0 10px;padding-left:20px">
        <li><b>Update live site</b>: change your document, click Publish again, and the same link shows the new version.</li>
        <li><b>Unpublish</b> hides the site (the address stays yours). <b>Republish</b> brings it back. <b>Delete</b> removes it for good.</li>
        <li>The address name cannot be changed once published. To use another, delete the site and publish again.</li>
        <li>You must be signed in to publish. Visitors do not need to sign in.</li>
      </ul>
      <b>Good to know</b>
      <ul style="margin:4px 0 10px;padding-left:20px">
        <li>All your pages are published as one website, with the menu and page links working inside it.</li>
        <li>The size limit is 2 MB, so shrink or remove very large images if you see a size message.</li>
        <li>Pasted HTML, embeds, forms and tabs run in a safe sandbox on the published site.</li>
      </ul>
      <b>Host it yourself instead (own domain)</b>
      <div style="color:var(--muted)"><b>Export .html</b> gives one self-contained page; <b>Export site .zip</b> gives separate pages (index.html, page files, style.css, 404.html, plus sitemap.xml and robots.txt when you set your website address). Upload it to Netlify, GitHub Pages or Firebase Hosting and connect your own domain there.</div></div>`, 640);
  }

  /* ── Publish to a live link: Apps Script backend (Drive storage + Firebase login check) ── */
  const SITE_API_URL = 'https://script.google.com/macros/s/AKfycbxQhtNiPY7evhP83lZDaDaFOetrh_EpUfcgvwRIhNamNeBJbva-2YHXrFuFaMEdrzJX/exec';   // ◀◀ OWNER: paste your Apps Script web-app URL here ONCE (Deploy ▸ Manage deployments ▸ Web app, ends with /exec). Users never see this.
  const FB_CFG = { apiKey: 'AIzaSyBjM_4W6DsCfOOrcUW-BoTfttU0ZBAngUQ', authDomain: 'pro-document-1723a.firebaseapp.com', projectId: 'pro-document-1723a', storageBucket: 'pro-document-1723a.firebasestorage.app', messagingSenderId: '358645984079', appId: '1:358645984079:web:6be4b45228f5f35fa0333a' };
  const MAX_HTML = 2 * 1024 * 1024, RESERVED = ['api', 'admin', 'login', 'dashboard', 'settings', 'support', 'help', 'www', 'root'];
  const PRETTY_URLS = false;   // false → https://YOURSITE/site.html?s=name (works immediately) · true → https://YOURSITE/s/name (needs the Firebase Hosting rewrite, see setup notes)
  const pub = slug => PRETTY_URLS ? location.origin + '/s/' + slug : new URL('site.html', location.href).href.split(/[?#]/)[0] + '?s=' + slug;   // the link people see: your own domain, not Google's
  let authP = null;
  const loadScript = u => new Promise((ok, no) => { const s = document.createElement('script'); s.src = u; s.onload = ok; s.onerror = () => no(new Error('Could not load Firebase (needs internet)')); document.head.appendChild(s); });
  async function getToken() {
    if (typeof window.PRODOCUMENT_GET_ID_TOKEN === 'function') return window.PRODOCUMENT_GET_ID_TOKEN();   // same bridge the Dashboard exposes
    authP = authP || (async () => {
      if (!window.firebase) { const B = 'https://www.gstatic.com/firebasejs/10.13.0/'; await loadScript(B + 'firebase-app-compat.js'); await loadScript(B + 'firebase-auth-compat.js'); }
      if (!firebase.apps.length) firebase.initializeApp(FB_CFG);
      return new Promise(r => { const off = firebase.auth().onAuthStateChanged(u => { off(); r(u); }); });
    })();
    const u = await authP; if (!u) { authP = null; throw new Error('Please sign in on the Dashboard first, then reopen this page.'); }
    return u.getIdToken();
  }
  async function api(action, extra) {
    if (!/^https:\/\/script\.google\.com\/.+\/exec$/.test(SITE_API_URL)) {
      console.error('Pro Document: SITE_API_URL is not set. Paste your Apps Script web-app URL (ending in /exec) into word-pro-addon-3-v2.js.');
      throw new Error('Publishing is not available right now. Please try again later.');   // end users never see or enter a URL
    }
    const token = await getToken();
    const r = await fetch(SITE_API_URL, { method: 'POST', body: JSON.stringify({ action, token, ...extra }) });   // no custom headers → no CORS preflight
    let j; try { j = await r.json(); } catch (e) { throw new Error('The publishing server did not answer correctly. Check the web-app deployment (access: Anyone).'); }
    if (!j.ok) throw new Error(j.error || 'Request failed.'); return j;
  }
  function cleanSlug(v) {   // mirrors the backend rules so errors show before upload
    const s = String(v || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (s.length < 3 || s.length > 50) throw new Error('Website address name must be 3–50 letters, numbers or hyphens.');
    if (RESERVED.includes(s)) throw new Error('That address name is reserved — choose another.');
    return s;
  }
  async function publishDlg() {
    if (ro()) return say('This document is view-only.');
    modal('Publish website', '<div id="pb">Connecting…</div>', 600); const box = $('pb');
    let sites = [], cur = null;
    const load = async () => { const c = getCfg(); sites = (await api('list')).websites || []; cur = sites.find(w => w.siteId === c.siteId) || sites.find(w => c.slug && w.slug === c.slug) || null; };
    try { await load(); } catch (e) { box.textContent = e.message; return; }
    const msg = (t, ok) => { const el = $('pb_st'); if (el) { el.style.color = ok === false ? '#c0392b' : ok ? '#2e7d4f' : 'var(--muted)'; el.innerHTML = t; } };
    const draw = () => {
      const live = cur && cur.status === 'published', c = getCfg(), others = sites.filter(w => !cur || w.siteId !== cur.siteId);
      box.innerHTML = `<div style="color:var(--muted)">Your site goes live at a public link anyone can open. Publish again at any time to update the same link.</div>
        <label class="f">Website address name<input type="text" id="pb_s" value="${esc(cur ? cur.slug : (c.slug || slugify(c.name).slice(0, 50)))}" maxlength="50" ${cur ? 'readonly title="The address is fixed once published"' : ''}></label>
        ${cur ? `<div style="background:${live ? '#eaf7ef' : '#f3f3f3'};border:1px solid ${live ? '#b8e0c8' : '#ddd'};border-radius:6px;padding:8px 10px;overflow-wrap:anywhere">${live ? '🟢 <b>Live</b>' : '⚪ <b>Unpublished</b>'} · <a href="${esc(pub(cur.slug))}" target="_blank" rel="noopener">${esc(pub(cur.slug))}</a></div>` : ''}
        <div id="pb_st" style="min-height:18px"></div>
        <div class="wp3-row"><button class="pri" data-a="pub">${cur ? (live ? '🔄 Update live site' : '🚀 Update &amp; republish') : '🚀 Publish'}</button>${cur ? `<button data-a="copy">📋 Copy link</button><button data-a="open">↗ Open</button><button data-a="${live ? 'un' : 're'}">${live ? 'Unpublish' : 'Republish'}</button><button data-a="del" style="color:#c0392b">Delete</button>` : ''}</div>
        ${others.length ? `<details><summary>Your other websites (${others.length})</summary>${others.map(w => `<div style="padding:3px 0">${w.status === 'published' ? '🟢' : '⚪'} <a href="${esc(pub(w.slug))}" target="_blank" rel="noopener">${esc(w.name || w.slug)}</a> <span style="color:var(--muted)">· ${esc(w.slug)}</span></div>`).join('')}</details>` : ''}`;
    };
    draw();
    box.onclick = async e => {
      const a = e.target.dataset.a; if (!a) return;
      const btns = box.querySelectorAll('button');
      try {
        if (a === 'copy') { await navigator.clipboard.writeText(pub(cur.slug)); return msg('Link copied.', true); }
        if (a === 'open') return void window.open(pub(cur.slug), '_blank', 'noopener');
        btns.forEach(x => x.disabled = true);
        if (a === 'un' || a === 're') { await api(a === 'un' ? 'unpublish' : 'republish', { siteId: cur.siteId }); await load(); draw(); return msg(a === 'un' ? 'Site unpublished.' : 'Site is live again.', true); }
        if (a === 'del') {
          if (!confirm('Delete this website permanently? The link will stop working.')) { btns.forEach(x => x.disabled = false); return; }
          await api('delete', { siteId: cur.siteId }); const c = getCfg(); delete c.siteId; delete c.slug; delete c.url; setCfg(c); await load(); draw(); return msg('Site deleted.', true);
        }
        const html = singleSite(); if (html.length > MAX_HTML) throw new Error('The site is ' + (html.length / 1048576).toFixed(1) + ' MB — the limit is 2 MB. Remove or shrink large images.');
        msg('Publishing…'); let r;
        if (cur) { r = await api('update', { siteId: cur.siteId, html }); if (cur.status !== 'published') await api('republish', { siteId: cur.siteId }); }
        else r = await api('publish', { name: getCfg().name, slug: cleanSlug($('pb_s').value), html });
        setCfg({ ...getCfg(), siteId: r.siteId, slug: r.slug || (cur && cur.slug), url: pub(r.slug || (cur && cur.slug)) });
        await load(); draw(); msg('✅ Published! Your site is live.', true); say('Website published.');
      } catch (err) { console.warn(err); btns.forEach(x => x.disabled = false); msg(esc(err.message || err), false); }
    };
  }

  /* ── ribbon tab ── */
  const b = (ic, l, fn, t) => `<button class="tb-btn" onmousedown="event.preventDefault()" onclick="${fn}" title="${t || l}"><span class="tb-icon">${ic}</span>${l}</button>`;
  const sg = (label, groups, fn, w) => `<select class="tb-select" style="width:${w}px" onchange="${fn}(this.value);this.selectedIndex=0"><option value="">${label}</option>${groups.map(g => Array.isArray(g[1]) ? `<optgroup label="${g[0]}">${g[1].map(o => `<option value="${o[0]}">${o[1]}</option>`).join('')}</optgroup>` : `<option value="${g[0]}">${g[1]}</option>`).join('')}</select>`;
  const tab = document.createElement('button'); tab.className = 'tab-btn'; tab.dataset.tab = 'wpweb'; tab.textContent = '🌐 Website'; tab.onclick = () => switchTab('wpweb');
  document.querySelector('.ribbon-tabs').appendChild(tab);
  const tb = document.createElement('div'); tb.id = 'wpweb'; tb.className = 'ribbon-toolbar';
  tb.innerHTML = [
    ['Code', b('📋', 'Paste HTML', 'WP3.paste()', 'Paste HTML/CSS/JS as a web block or editable content') + b('🧾', 'Page Source', 'WP3.source()')],
    ['Site', b('⚙', 'Site Settings', 'WP3.settings()', 'Name, logo, theme, colours, menu, footer, SEO, analytics') + b('🗂', 'Pages & Menu', 'WP3.pagesMenu()', 'Rename, hide, reorder and configure pages') + b('🔗', 'Page Link', 'WP3.link()', 'Link text to another page'), b('✔', 'Site Check', 'WP3.check()', 'Check for SEO, accessibility and leftover placeholder problems')],
    ['Add content', sg('Add block', BLOCK_MENU, 'WP3.block', 120) + sg('Starter site', SITE_MENU, 'WP3.site', 130),
      b('🎨', 'Style Section', 'WP3.section()', 'Background, spacing, corners and alignment for the current block') + b('🔌', 'Embed', 'WP3.embed()', 'Video, map, calendar, Google Form/Docs or any page') + b('✉', 'Contact Form', 'WP3.form()', 'A form that emails you')],
    ['Publish', b('👁', 'Preview', 'WP3.preview()') + b('🌐', 'Export .html', "WP3.exp('html')", 'One self-contained page') + b('📦', 'Export site .zip', "WP3.exp('zip')", 'Multi-page site: index.html, pages, style.css, 404.html, sitemap') + b('🚀', 'Publish', 'WP3.publish()', 'Publish to a live web link') + b('❓', 'How to Publish', 'WP3.help()')]
  ].map(g => `<div class="ribbon-group"><div class="ribbon-group-row">${g[1]}</div>${g[2] ? `<div class="ribbon-group-row">${g[2]}</div>` : ''}<div class="ribbon-group-label">${g[0]}</div></div>`).join('');
  document.querySelector('.find-bar').before(tb);

  window.WP3 = {
    publish: publishDlg, paste: () => pasteDlg(), source: sourceDlg, preview, settings: siteDlg, pagesMenu: pagesDlg, link: linkDlg, embed: k => embedDlg(typeof k === 'string' ? k : ''), help: helpDlg,
    check: checkDlg, section: secDlg, form: formDlg, toc: tocBlock,
    block: k => { if (k) addBlock(k); }, site: k => { if (!k) return; addHtml(SITES[k]); say('Starter inserted — replace the [placeholders]. Menu & theme: Site Settings.'); },
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
  if (ro()) tb.querySelectorAll('button,select').forEach(x => { if (!/preview|exp|help|check/.test(x.getAttribute('onclick') || x.getAttribute('onchange') || '')) x.disabled = true; });
  say('Website tab loaded.');
})();
