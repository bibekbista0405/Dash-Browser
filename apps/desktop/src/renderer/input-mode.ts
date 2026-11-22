/**
 * Focus rings follow how the person is working: after a mouse click or touch no ring is drawn anywhere; after
 * Tab or the arrow keys, `data-kbd` is set on <html> and the soft keyboard ring appears. (Chrome behaves the same.)
 */
const root = document.documentElement;
window.addEventListener('pointerdown', () => root.removeAttribute('data-kbd'), true);
window.addEventListener(
  'keydown',
  (e) => {
    if (e.key === 'Tab' || e.key.startsWith('Arrow') || e.key === 'Home' || e.key === 'End') root.setAttribute('data-kbd', '');
  },
  true
);
