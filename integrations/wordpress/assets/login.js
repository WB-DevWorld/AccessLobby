/* Theme-independent adapter for supported core/WooCommerce forms, including modal mounts. */
(() => {
  'use strict';
  const config = window.accessLobbyWordPress;
  if (!config) return;
  const selector = 'form#loginform, form.woocommerce-form-login, form.login';
  const start = () => {
    const url = new URL(config.start);
    url.searchParams.set('redirect_to', window.location.href);
    return url.href;
  };
  const visible = (element) => element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  let leaving = false;
  const redirect = () => {
    if (!leaving) { leaving = true; window.location.assign(start()); }
  };
  const mount = () => {
    document.querySelectorAll(selector).forEach((form) => {
      // A generic class name alone cannot turn an unrelated form into a login surface.
      if (!form.querySelector('input[type="password"]') || !form.querySelector('[name="log"], [name="username"]')) return;
      let link = form.querySelector('[data-accesslobby-start]');
      if (!link) {
        link = document.createElement('a');
        link.href = start(); link.textContent = config.label;
        link.className = 'button accesslobby-button'; link.dataset.accesslobbyStart = '';
        const row = document.createElement('p'); row.className = 'accesslobby-login';
        row.append(link); form.prepend(row);
      }
      if (config.mode === 'enforced' && visible(form)) redirect();
    });
  };
  document.addEventListener('submit', (event) => {
    if (config.mode === 'enforced' && event.target.matches(selector)) {
      event.preventDefault(); event.stopImmediatePropagation(); redirect();
    }
  }, true);
  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; mount(); });
  };
  new MutationObserver(schedule).observe(document.documentElement, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-hidden']});
  document.addEventListener('click', schedule);
  mount();
})();
