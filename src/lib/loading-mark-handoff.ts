// Runs inline, right after a server-streamed loading screen, before any React
// code exists on the page. On a cold load the root fallback, the route fallback
// and a nested fallback stream one after another; without this each one waited
// its own 600ms at opacity 0 and restarted the breath, which read as the logo
// blinking between two breaths. The first screen records when it appeared; the
// ones that follow reveal exactly when it would have and continue its breath.
// React never executes scripts it renders on the client, so client navigations
// are handled by LoadingMarkImage instead. Timings match globals.css.
export const LOADING_MARK_HANDOFF_SCRIPT =
  '(function(){var s=document.currentScript,e=s&&s.previousElementSibling;if(!e||!e.classList.contains("ccr-page-route-loading"))return;' +
  'var n=performance.now(),a=window.__ccrLoadingMarkAt;' +
  'var c=window.Capacitor;if(a==null&&c&&c.isNativePlatform&&c.isNativePlatform()){a=n-250;window.__ccrLoadingMarkAt=a}' +
  'if(a==null){window.__ccrLoadingMarkAt=n;return}' +
  'var el=n-a,r=Math.max(0,250-el),m=e.querySelector(".ccr-brand-loading-mark");' +
  'if(r>0){e.style.animationDelay=r+"ms";if(m)m.style.animationDelay=r+"ms"}' +
  'else{e.style.animation="none";e.style.opacity="1";if(m)m.style.animationDelay="-"+((el-250)%2400)+"ms"}})();';
