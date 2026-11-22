package com.bibekbista.dash

/**
 * Page script for logins. It only talks to DASH through the WebMessageListener "dashLogin" (the page cannot call anything else).
 * It never reads or sends saved passwords: DASH sends a login to the page only after you tap it in the fill sheet, and only
 * for the exact site you are on. It runs in the top frame only.
 */
object LoginScript {
    const val COUNT_VISIBLE_PASSWORD_FIELDS = "(function(){var n=0;document.querySelectorAll('input[type=password]').forEach(function(e){var r=e.getBoundingClientRect();if(r.width>0&&r.height>0)n++});return n})()"

    val JS = """
(function(){
  if (window.top !== window || !window.dashLogin) return;
  var P = window.dashLogin, last = '';
  function vis(e){ var r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; }
  function pws(){ return Array.prototype.filter.call(document.querySelectorAll('input[type=password]'), vis); }
  function userFor(pw){
    var scope = pw.form || document, list = scope.querySelectorAll('input'), idx = -1, i;
    for (i = 0; i < list.length; i++) if (list[i] === pw) { idx = i; break; }
    for (i = idx - 1; i >= 0; i--) { var t = (list[i].type || 'text').toLowerCase(); if ((t === 'text' || t === 'email' || t === 'tel') && vis(list[i])) return list[i]; }
    return null;
  }
  function send(o){ try { P.postMessage(JSON.stringify(o)); } catch (e) {} }
  function capture(){
    var a = pws();
    for (var i = 0; i < a.length; i++) if (a[i].value) {
      var u = userFor(a[i]), key = (u ? u.value : '') + '\u0000' + a[i].value;
      if (key !== last) { last = key; send({t: 'save', u: u ? u.value : '', p: a[i].value}); }
      return;
    }
  }
  document.addEventListener('submit', capture, true);
  document.addEventListener('click', function(e){ var b = e.target && e.target.closest && e.target.closest('button,input[type=submit],input[type=button],[role=button],a'); if (b) capture(); }, true);
  document.addEventListener('keydown', function(e){ if (e.key === 'Enter') capture(); }, true);
  document.addEventListener('focusin', function(e){
    var t = e.target; if (!t || t.tagName !== 'INPUT') return;
    var ty = (t.type || 'text').toLowerCase();
    var hint = ((t.autocomplete || '') + ' ' + (t.name || '') + ' ' + (t.id || '')).toLowerCase();
    var userish = (ty === 'text' || ty === 'email' || ty === 'tel') && (pws().length > 0 || /user|email|login|account/.test(hint));
    if (ty === 'password' || userish) send({t: 'focus'});
  }, true);
  function setv(el, v){ Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', {bubbles: true})); el.dispatchEvent(new Event('change', {bubbles: true})); }
  P.onmessage = function(e){
    var m; try { m = JSON.parse(e.data); } catch (x) { return; }
    if (m.t !== 'fill') return;
    var ae = document.activeElement, a = pws();
    var pw = (ae && ae.type === 'password') ? ae : a[0];
    var u = pw ? userFor(pw) : ((ae && ae.tagName === 'INPUT') ? ae : null);
    if (u && m.u) setv(u, m.u);
    if (pw && m.p) setv(pw, m.p);
  };
})();
"""
}
