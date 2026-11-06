'use strict';
(() => {
  const frame = document.getElementById('screen');
  let mode = 'blue';
  const css = `
    body #dashboard #appNavigation{--preview-accent:#0066e9}
    body #dashboard #appNavigation .top-nav-selection{display:none}
    body #dashboard #appNavigation :is(.tab,.tab-sub),
    body #dashboard #appNavigation :is(.tab,.tab-sub)[aria-current=page]{background:transparent;color:#000}
    body #dashboard #appNavigation :is(.tab,.tab-sub):is(:hover,:focus-visible),
    body #dashboard #appNavigation :is(.tab,.tab-sub):not([aria-current=page]):is(:hover,:focus-visible),
    body #dashboard #appNavigation :is(.tab,.tab-sub)[aria-current=page]:is(:hover,:focus-visible){background:transparent;color:var(--preview-accent)}
    body #dashboard #appNavigation button:focus-visible{outline:2px solid var(--preview-accent);outline-offset:2px}
  `;
  function apply() {
    const doc = frame.contentDocument;
    if (!doc?.head) return;
    let style = doc.getElementById('header-color-preview');
    if (!style) {
      style = doc.createElement('style');
      style.id = 'header-color-preview';
      style.textContent = css;
      doc.head.append(style);
    }
    style.disabled = mode === 'original';
  }
  frame.addEventListener('load', apply);
  document.querySelectorAll('[data-preview]').forEach(button => {
    button.addEventListener('click', () => {
      mode = button.dataset.preview;
      document.querySelectorAll('[data-preview]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      apply();
    });
  });
})();
