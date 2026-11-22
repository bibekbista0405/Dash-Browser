// Runs before first paint (classic, blocking script): applies the last-used theme to <html> so DASH's own pages never
// start in the wrong colours and then flip. The theme hook keeps this hint up to date.
(function () {
  try {
    var hint = localStorage.getItem('dash.themeHint');
    var dark = hint ? hint === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
    var c = document.documentElement.classList;
    c.remove('dark', 'light');
    c.add(dark ? 'dark' : 'light');
  } catch (e) { /* keep the default class */ }
})();
