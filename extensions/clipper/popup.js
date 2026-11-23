// ContrataCR Pro clipper (NOT published). With the user's click on the toolbar button (activeTab) it reads, in the user's own
// browser, the Open Graph / schema.org data of the open product page (same reader as the in-app bookmarklet) and OPENS the
// app with ?clip=<url>#clipdata=<base64url JSON>. The hash never reaches a server. The extension never posts anything: the app
// validates the data, the owner reviews it and saves it with their normal session. Only https pages.
const APP_ORIGIN = 'https://contratacr.com'; // local testing: change to http://127.0.0.1:3185 (see README.md)
const MAX_HASH_JSON = 8192;
const lang = (chrome.i18n.getUILanguage() || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
// Mirror of CLIP_READER_SOURCE in src/lib/pro/integrations/clipper/browser-capture.ts (executed inside the page).
function readPage() {
  var d = document, m = function (k) { var e = d.querySelector('meta[property="' + k + '"],meta[name="' + k + '"],meta[itemprop="' + k + '"]'); return e ? (e.getAttribute('content') || '') : ''; };
  var p = null;
  function f(n, t) { if (!n || t > 6 || p) return; if (Array.isArray(n)) { for (var i = 0; i < n.length && i < 50; i++) f(n[i], t + 1); return; } if (typeof n !== 'object') return; var y = n['@type']; if (y === 'Product' || (Array.isArray(y) && y.indexOf('Product') > -1)) { p = n; return; } if (n['@graph']) f(n['@graph'], t + 1); }
  var s = d.querySelectorAll('script[type="application/ld+json"]');
  for (var i = 0; i < s.length && !p; i++) { try { f(JSON.parse(s[i].textContent || ''), 0); } catch (e) {} }
  var o = p && p.offers ? (Array.isArray(p.offers) ? p.offers[0] : p.offers) : null, b = p && p.brand ? (typeof p.brand === 'object' ? p.brand.name : p.brand) : '';
  var im = p && p.image ? (Array.isArray(p.image) ? p.image[0] : (typeof p.image === 'object' ? p.image.url : p.image)) : m('og:image');
  var pr = (o && (o.price || o.lowPrice)) || m('product:price:amount') || m('og:price:amount');
  var n = Number(String(pr).replace(/[^0-9.,]/g, '').replace(/,(?=[0-9]{3}([^0-9]|$))/g, '').replace(',', '.'));
  var c = String((o && o.priceCurrency) || m('product:price:currency') || m('og:price:currency') || '').toUpperCase();
  try { im = new URL(im, location.href).href; } catch (e) { im = ''; }
  return { name: String((p && p.name) || m('og:title') || d.title || '').slice(0, 160), description: String((p && p.description) || m('og:description') || m('description') || '').slice(0, 600), price: isFinite(n) && pr !== '' && n >= 0 ? Math.round(n * 100) / 100 : null, currency: c === 'CRC' || c === 'USD' || c === 'EUR' ? c : (c ? 'OTHER' : null), image: /^https:/.test(im) ? im.slice(0, 1000) : null, sku: String((p && (p.sku || p.mpn)) || '').slice(0, 80), brand: String(b || '').slice(0, 120) };
}
const text = {
  es: { title: 'Agregar a mi catálogo', note: 'Se abrirá ContrataCR Pro con los datos públicos que su navegador ya muestra. Nada se guarda hasta que usted lo revise.', send: 'Abrir en ContrataCR Pro', need: 'Abra una página de producto (https).' },
  en: { title: 'Add to my catalog', note: 'ContrataCR Pro will open with the public data your browser already shows. Nothing is saved until you review it.', send: 'Open in ContrataCR Pro', need: 'Open a product page (https).' },
}[lang];
async function currentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}
function b64url(json) {
  const bytes = new TextEncoder().encode(json); let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('title').textContent = text.title;
  document.getElementById('note').textContent = text.note;
  const button = document.getElementById('send');
  button.textContent = text.send;
  const tab = await currentTab();
  const url = tab && typeof tab.url === 'string' ? tab.url : '';
  const valid = url.startsWith('https://');
  document.getElementById('url').textContent = valid ? url : text.need;
  button.disabled = !valid;
  button.addEventListener('click', async () => {
    const target = new URL('/' + lang + '/dashboard/pro', APP_ORIGIN);
    target.searchParams.set('tab', 'pro_company');
    target.searchParams.set('empresa', 'articulos');
    target.searchParams.set('clip', url.split('#')[0].slice(0, 2000));
    let hash = '';
    try {
      const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readPage });
      const json = JSON.stringify(result && result.result ? result.result : {});
      if (json.length > 2 && json.length <= MAX_HASH_JSON) hash = '#clipdata=' + b64url(json);
    } catch (e) { /* no page data: the app falls back to reading the link on the server */ }
    chrome.tabs.create({ url: target.toString() + hash });
    window.close();
  });
});
