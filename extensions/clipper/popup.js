// ContrataCR Pro clipper (scaffold, NOT published). It never reads the page content and never calls an API with
// the user's cookies: it only opens the app's own catalog view with ?clip=<current tab URL>. The app then calls
// the same endpoint as the in-app button (/api/pro/catalog-clipper, same-origin, session of the user) and shows
// the owner review form. Only https pages are sent.
const APP_ORIGIN = 'https://contratacr.com'; // local testing: change to http://127.0.0.1:3185 (see README.md)
async function currentUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab && typeof tab.url === 'string' ? tab.url : '';
}
document.addEventListener('DOMContentLoaded', async () => {
  const url = await currentUrl();
  const valid = url.startsWith('https://');
  document.getElementById('url').textContent = valid ? url : 'Abra una página de producto (https).';
  const button = document.getElementById('send');
  button.disabled = !valid;
  button.addEventListener('click', () => {
    const target = new URL('/es/dashboard/pro', APP_ORIGIN);
    target.searchParams.set('tab', 'pro_company');
    target.searchParams.set('empresa', 'articulos');
    target.searchParams.set('clip', url.slice(0, 2000));
    chrome.tabs.create({ url: target.toString() });
    window.close();
  });
});
