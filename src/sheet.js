// Mobile sheet behaviour. Button wiring (views, modes, labels, orbit) stays in main.js.
const MQ = '(max-width: 768px), ((pointer: coarse) and (max-height: 520px)), ((max-height: 480px) and (max-width: 960px))';

const ui = document.querySelector('#ui');
const sheet = document.querySelector('#sheet');
const backdrop = document.querySelector('#sheet-backdrop');
const grabber = document.querySelector('#sheet-grabber');
const mobileTop = document.querySelector('.mobile-top');
const pill = document.querySelector('#pill');
const fab = document.querySelector('#btn-controls');
const closeBtn = document.querySelector('#sheet-close');
const pillView = document.querySelector('#pill-view');
const views = document.querySelector('#views');

const mq = window.matchMedia(MQ);
const reduceMq = window.matchMedia('(prefers-reduced-motion: reduce)');
const reduce = () => reduceMq.matches;
const isMobile = () => mq.matches;

function syncPressed() {
  document.querySelectorAll('#views button, #modes button, #btn-labels, #btn-orbit').forEach((b) => {
    b.setAttribute('aria-pressed', b.classList.contains('on') ? 'true' : 'false');
  });
  const on = views?.querySelector('button.on');
  if (on && pillView) pillView.textContent = on.textContent.trim();
}

function scrollChip(btn, instant) {
  if (!btn || !views) return;
  const row = views.getBoundingClientRect();
  const box = btn.getBoundingClientRect();
  const delta = box.left - row.left - (row.width - box.width) / 2;
  views.scrollTo({ left: views.scrollLeft + delta, behavior: instant || reduce() ? 'auto' : 'smooth' });
}

function setInert(el, value) {
  if (el && 'inert' in el) el.inert = value;
}

function syncChrome() {
  const open = ui.classList.contains('open');
  const mobile = isMobile();
  pill?.setAttribute('aria-expanded', mobile && open ? 'true' : 'false');
  fab?.setAttribute('aria-expanded', mobile && open ? 'true' : 'false');
  if (mobile && open) {
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    sheet.setAttribute('aria-labelledby', 'sheet-title');
  } else {
    sheet.removeAttribute('role');
    sheet.removeAttribute('aria-modal');
    sheet.removeAttribute('aria-labelledby');
  }
  if (!mobile) {
    setInert(sheet, false);
    setInert(mobileTop, false);
    return;
  }
  const blocking = open || ui.classList.contains('closing');
  setInert(sheet, !blocking);
  setInert(mobileTop, open || ui.classList.contains('closing'));
}

let closeTimer = 0;
function finishClose() {
  ui.classList.remove('closing');
  window.clearTimeout(closeTimer);
  sheet.style.transition = '';
  sheet.style.transform = '';
  backdrop.style.transition = '';
  backdrop.style.opacity = '';
  syncChrome();
}

function onSheetEnd(e) {
  if (e.target !== sheet || e.propertyName !== 'transform') return;
  if (!ui.classList.contains('closing')) return;
  sheet.removeEventListener('transitionend', onSheetEnd);
  finishClose();
}

function closeSheet() {
  if (!ui.classList.contains('open')) return;
  ui.classList.remove('open');
  ui.classList.add('closing');
  syncChrome();
  sheet.addEventListener('transitionend', onSheetEnd);
  window.clearTimeout(closeTimer);
  closeTimer = window.setTimeout(() => {
    if (ui.classList.contains('closing')) {
      sheet.removeEventListener('transitionend', onSheetEnd);
      finishClose();
    }
  }, reduce() ? 0 : 480);
}

function openSheet() {
  if (!isMobile()) return;
  window.clearTimeout(closeTimer);
  sheet.removeEventListener('transitionend', onSheetEnd);
  ui.classList.remove('closing');
  sheet.style.transition = '';
  sheet.style.transform = '';
  backdrop.style.transition = '';
  backdrop.style.opacity = '';
  ui.classList.add('open');
  syncChrome();
  const on = views?.querySelector('button.on');
  scrollChip(on, true);
  closeBtn?.focus({ preventScroll: true });
}

pill?.addEventListener('click', openSheet);
fab?.addEventListener('click', openSheet);
closeBtn?.addEventListener('click', closeSheet);
backdrop?.addEventListener('pointerup', (e) => {
  if (e.target === backdrop) closeSheet();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.classList.contains('open')) closeSheet();
});

views?.querySelectorAll('button').forEach((b) => {
  b.addEventListener('click', () => {
    if (!isMobile()) return;
    scrollChip(b, false);
    closeSheet();
  });
});

let drag = null;
grabber?.addEventListener('pointerdown', (e) => {
  if (!ui.classList.contains('open') || e.button !== 0) return;
  drag = { y: e.clientY, t: performance.now(), dy: 0 };
  sheet.style.transition = 'none';
  backdrop.style.transition = 'none';
  grabber.setPointerCapture(e.pointerId);
  e.preventDefault();
});
grabber?.addEventListener('pointermove', (e) => {
  if (!drag) return;
  drag.dy = Math.max(0, e.clientY - drag.y);
  sheet.style.transform = `translate3d(0, ${drag.dy}px, 0)`;
  const h = sheet.getBoundingClientRect().height || 1;
  backdrop.style.opacity = String(Math.max(0, 1 - drag.dy / h));
});
function endDrag() {
  if (!drag) return;
  const { dy, t } = drag;
  drag = null;
  const dt = Math.max(1, performance.now() - t);
  const velocity = dy / dt;
  const h = sheet.getBoundingClientRect().height || 1;
  const dismiss = dy > Math.min(120, h * 0.28) || (dy > 24 && velocity > 0.45);
  if (!dismiss) {
    requestAnimationFrame(() => {
      sheet.style.transition = '';
      backdrop.style.transition = '';
      void sheet.offsetWidth;
      sheet.style.transform = '';
      backdrop.style.opacity = '';
    });
    return;
  }
  if (reduce()) {
    sheet.style.transition = 'none';
    sheet.style.transform = '';
    backdrop.style.opacity = '';
    closeSheet();
    return;
  }
  ui.classList.remove('open');
  ui.classList.add('closing');
  syncChrome();
  requestAnimationFrame(() => {
    sheet.style.transition = '';
    backdrop.style.transition = '';
    void sheet.offsetWidth;
    sheet.style.transform = '';
    backdrop.style.opacity = '';
    sheet.addEventListener('transitionend', onSheetEnd);
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => {
      if (ui.classList.contains('closing')) {
        sheet.removeEventListener('transitionend', onSheetEnd);
        finishClose();
      }
    }, 480);
  });
}
grabber?.addEventListener('pointerup', endDrag);
grabber?.addEventListener('pointercancel', endDrag);

mq.addEventListener('change', () => {
  if (!isMobile()) {
    ui.classList.remove('open', 'closing');
    sheet.style.transform = '';
    sheet.style.transition = '';
    backdrop.style.opacity = '';
    backdrop.style.transition = '';
  }
  syncChrome();
});

syncPressed();
syncChrome();
new MutationObserver(syncPressed).observe(ui, { attributes: true, subtree: true, attributeFilter: ['class'] });
