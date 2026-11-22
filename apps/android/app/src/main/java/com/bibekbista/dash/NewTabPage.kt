package com.bibekbista.dash

import android.text.TextUtils

object NewTabPage {
    private val COLORS = listOf("#5B8CFF", "#34A853", "#E8710A", "#A142F4", "#D93025", "#12B5CB", "#E52592", "#7A8B99")

    private const val SEARCH_SVG = """<svg width="22" height="22" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>"""
    private const val INCOGNITO_SVG = """<svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 2C9.5 2 7.4 3.7 6.8 6H4.5L3 11h2.1c-.1.3-.1.7-.1 1 0 2.8 2.2 5 5 5h4c2.8 0 5-2.2 5-5 0-.3 0-.7-.1-1H21l-1.5-5h-2.3c-.6-2.3-2.7-4-5.2-4zM8 12.5c0-.8.7-1.5 1.5-1.5s1.5.7 1.5 1.5S10.3 14 9.5 14 8 13.3 8 12.5zm5 0c0-.8.7-1.5 1.5-1.5s1.5.7 1.5 1.5-.7 1.5-1.5 1.5-1.5-.7-1.5-1.5zM12 19c-3.3 0-6 1-6 2h12c0-1-2.7-2-6-2z"/></svg>"""
    private const val HISTORY_SVG = """<svg width="20" height="20" viewBox="0 0 24 24"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg>"""
    private const val BOOKMARK_SVG = """<svg width="20" height="20" viewBox="0 0 24 24"><path d="M17 3H7c-1.1 0-1.99.9-1.99 2L5 21l7-3 7 3V5c0-1.1-.9-2-2-2z"/></svg>"""

    fun html(store: Store, dark: Boolean, private: Boolean, logo: String): String {
        val bg = if (private) (if (dark) "#2A2142" else "#EFE7FF") else if (dark) "#0B0D10" else "#FFFFFF"
        val fg = if (dark) "#E8EAED" else "#14161A"
        val dim = if (dark) "#9AA0A8" else "#5A6068"
        val field = if (private) (if (dark) "#3B2F63" else "#E0D2FB") else if (dark) "#252A32" else "#E4E8F2"
        val card = if (private) (if (dark) "#33295A" else "#E6DAFB") else if (dark) "#15181D" else "#F1F3F9"
        val accent = if (private) (if (dark) "#A78BFA" else "#7C3AED") else (if (dark) "#5B8CFF" else "#3B64DC")
        val engine = TextUtils.htmlEncode(store.searchEngine)

        val chips = """<div class="chips">
<a class="chip" href="dash://incognito">$INCOGNITO_SVG<span>Incognito</span></a>
<a class="chip" href="dash://bookmarks">$BOOKMARK_SVG<span>Bookmarks</span></a>
<a class="chip" href="dash://history">$HISTORY_SVG<span>History</span></a></div>"""

        val body = if (private) {
            """<div class="priv"><div class="pi">$INCOGNITO_SVG</div><h2>You've gone Incognito</h2>
<p>DASH won't save your browsing history, searches or cookies from Incognito tabs. They are deleted when you close the last Incognito tab.</p>
<p><b>Still visible to:</b> the sites you visit, your network, and your internet provider. Downloads and bookmarks you make are kept.</p>
<p>Screenshots are blocked while an Incognito tab is open.</p></div>"""
        } else {
            val tiles = store.topSites().joinToString("") { (host, _) ->
                val h = TextUtils.htmlEncode(host)
                val letter = TextUtils.htmlEncode(host.take(1).uppercase())
                val c = COLORS[(host.hashCode() and 0x7fffffff) % COLORS.size]
                val icon = store.iconDataUri(host)
                val glyph = if (icon != null) """<img src="$icon" width="30" height="30" alt="">""" else """<span style="color:$c">$letter</span>"""
                """<div class="tile" id="t-$h"><a href="https://$h/"><span class="ic">$glyph</span><span class="nm">$h</span></a><button class="rm" aria-label="Remove $h" onclick="rm('$h')">&#10005;</button></div>"""
            }
            val shortcuts = if (tiles.isEmpty()) """<p class="hint">Sites you use often will show up here.</p>""" else """<div class="card grid">$tiles</div>"""
            """$shortcuts
<div class="stat"><b>${store.blockedTotal}</b><span>ads and trackers blocked on this phone</span></div>"""
        }
        return """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
body{margin:0;background:$bg;color:$fg;font:16px system-ui,sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:7vh 16px 28px}
.brand{display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:26px}
.brand img{width:68px;height:68px;border-radius:18px;box-shadow:0 4px 18px rgba(0,0,0,.25)}
.brand b{font-size:26px;letter-spacing:.34em;padding-left:.34em;font-weight:700}
.sb{width:100%;max-width:560px;display:flex;align-items:center;height:58px;border-radius:29px;background:$field;padding:0 22px;gap:14px;color:$dim;font-size:16px;border:0;text-align:left}
.sb svg{flex:none;fill:$dim}
.chips{display:flex;gap:10px;margin-top:14px;width:100%;max-width:560px}
.chip{flex:1;display:flex;align-items:center;justify-content:center;gap:8px;height:48px;border-radius:24px;background:$field;color:$fg;text-decoration:none;font-size:14px;font-weight:600}
.chip svg{fill:$fg;flex:none}
.card{margin-top:18px;width:100%;max-width:560px;border-radius:26px;background:$card;padding:22px 8px}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:20px 4px}
.tile{position:relative;text-align:center}.tile a{color:$fg;text-decoration:none;display:block}
.ic{display:flex;align-items:center;justify-content:center;width:56px;height:56px;margin:0 auto 8px;border-radius:50%;background:$field;font-size:23px;font-weight:700}
.ic img{border-radius:6px}
.nm{font-size:12px;color:$dim;display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:0 4px}
.rm{position:absolute;top:-8px;right:4px;width:26px;height:26px;border-radius:50%;border:0;background:$field;color:$dim;font-size:11px;opacity:0;transition:opacity .15s}
.tile:active .rm,.tile:focus-within .rm{opacity:1}
.hint{color:$dim;font-size:14px;margin-top:34px}
.stat{margin-top:18px;padding:16px 22px;border-radius:22px;background:$card;display:flex;flex-direction:column;align-items:center;gap:2px;width:100%;max-width:560px}
.stat b{font-size:26px;color:$accent}.stat span{font-size:13px;color:$dim}
.priv{margin-top:26px;max-width:520px;padding:0 6px}.priv h2{margin:14px 0 10px;color:$accent;font-size:22px}.priv p{color:$dim;line-height:1.55;margin:0 0 12px;font-size:15px}.priv b{color:$fg}
.pi{width:64px;height:64px;border-radius:50%;background:$field;display:flex;align-items:center;justify-content:center}.pi svg{width:34px;height:34px;fill:$accent}
.tile.gone{opacity:0;transform:scale(.8);transition:.2s}
.fade{animation:f .35s ease-out both}@keyframes f{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
</style></head><body class="fade">
<div class="brand"><img src="$logo" alt=""><b>DASH</b></div>
<button class="sb" onclick="location.href='dash://focus'">$SEARCH_SVG<span>Search $engine or type URL</span></button>
$chips
$body
<script>
function rm(h){var t=document.getElementById('t-'+h);if(t)t.classList.add('gone');setTimeout(function(){if(t)t.remove()},200);location.href='dash://hide?host='+encodeURIComponent(h)}
</script></body></html>"""
    }
}
