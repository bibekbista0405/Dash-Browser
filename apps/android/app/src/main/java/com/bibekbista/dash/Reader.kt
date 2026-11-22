package com.bibekbista.dash

import android.text.TextUtils.htmlEncode
import org.json.JSONArray

/**
 * Reading mode: pulls the main article text out of the page, then shows it in a clean layout.
 * The page's own scripts and styles are not reused; only text and image links are copied, and all text is escaped.
 */
object Reader {
    const val EXTRACT_JS = """(function(){
var BAD=/(^|[\s_-])(nav|menu|footer|aside|sidebar|comment|comments|share|social|related|promo|newsletter|subscribe|advert|ad|cookie|breadcrumb|toolbar|widget)([\s_-]|${'$'})/i;
function bad(e,root){for(var n=e;n&&n!==root;n=n.parentElement){var t=n.tagName;if(t==='NAV'||t==='ASIDE'||t==='FOOTER'||t==='FORM'||t==='BUTTON')return true;var c=(typeof n.className==='string'?n.className:'')+' '+(n.id||'');if(BAD.test(c))return true;}return false;}
var cands=[].slice.call(document.querySelectorAll('article,main,[role=main],#content,.content,.post,.entry-content,.article-body,.story-body,body'));
var best=null,bs=0;
cands.forEach(function(c){var n=0,l=0;c.querySelectorAll('p').forEach(function(p){var k=(p.innerText||'').trim().length;if(k>60)n+=k;});c.querySelectorAll('a').forEach(function(a){l+=(a.innerText||'').length;});var s=n-l*0.5;if(c.tagName==='ARTICLE')s*=1.2;if(s>bs){bs=s;best=c;}});
if(!best||bs<400)return JSON.stringify({ok:false});
var h1=document.querySelector('h1');var out=[];
best.querySelectorAll('h1,h2,h3,h4,p,blockquote,pre,ul,ol,img').forEach(function(e){
 if(out.length>400||bad(e,best))return;var t=e.tagName;
 if(t==='IMG'){var s=e.currentSrc||e.src||'';if(/^https?:/i.test(s)&&(e.naturalWidth||e.width)>=200)out.push({t:'i',x:s,a:e.alt||''});return;}
 if(t==='UL'||t==='OL'){if(e.parentElement&&e.parentElement.closest('ul,ol'))return;var items=[].map.call(e.children,function(li){return (li.innerText||'').trim();}).filter(function(x){return x.length>0&&x.length<600;});if(items.length)out.push({t:t==='UL'?'u':'o',x:items});return;}
 if(e.closest('blockquote')&&t==='P')return;
 var x=(e.innerText||'').trim();if(!x||x.length>5000)return;
 out.push({t:t==='BLOCKQUOTE'?'q':t==='PRE'?'c':(t[0]==='H'?'h':'p'),x:x});
});
return JSON.stringify({ok:true,title:(h1&&h1.innerText||document.title||'').trim(),blocks:out});
})()"""

    fun html(dark: Boolean, host: String, title: String, blocks: JSONArray): String {
        val bg = if (dark) "#0B0D10" else "#FFFFFF"; val fg = if (dark) "#E8EAED" else "#1B1D21"
        val dim = if (dark) "#9AA0A8" else "#5F6368"; val card = if (dark) "#171A1F" else "#F1F3F4"
        val sb = StringBuilder()
        for (i in 0 until minOf(blocks.length(), 400)) {
            val b = blocks.optJSONObject(i) ?: continue
            when (b.optString("t")) {
                "h" -> if (b.optString("x") != title) sb.append("<h2>").append(htmlEncode(b.optString("x"))).append("</h2>")
                "p" -> sb.append("<p>").append(htmlEncode(b.optString("x"))).append("</p>")
                "q" -> sb.append("<blockquote>").append(htmlEncode(b.optString("x"))).append("</blockquote>")
                "c" -> sb.append("<pre>").append(htmlEncode(b.optString("x"))).append("</pre>")
                "i" -> { val s = b.optString("x"); if (s.startsWith("http")) sb.append("<img src=\"").append(htmlEncode(s)).append("\" alt=\"").append(htmlEncode(b.optString("a"))).append("\">") }
                "u", "o" -> {
                    val tag = if (b.optString("t") == "u") "ul" else "ol"
                    sb.append('<').append(tag).append('>')
                    val items = b.optJSONArray("x")
                    if (items != null) {
                        for (k in 0 until items.length()) {
                            sb.append("<li>").append(htmlEncode(items.optString(k))).append("</li>")
                        }
                    }
                    sb.append("</").append(tag).append('>')
                }
            }
        }
        return """<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="${if (dark) "dark" else "light"}"><style>
            body{margin:0;background:$bg;color:$fg;font:19px/1.7 Georgia,'Times New Roman',serif;padding:22px 20px 60px;max-width:700px;margin:0 auto}
            h1{font:700 28px/1.25 system-ui,sans-serif;margin:8px 0 6px} .src{font:14px system-ui,sans-serif;color:$dim;margin-bottom:26px}
            h2{font:700 22px/1.3 system-ui,sans-serif;margin:30px 0 4px} p{margin:0 0 1.1em} img{max-width:100%;height:auto;border-radius:10px;margin:8px 0 18px}
            blockquote{margin:1.2em 0;padding:2px 16px;border-left:3px solid #5B8CFF;color:$dim} pre{background:$card;padding:12px;border-radius:10px;overflow-x:auto;font-size:14px;line-height:1.5}
            ul,ol{padding-left:1.3em} li{margin-bottom:.4em}
            </style></head><body><h1>${htmlEncode(title)}</h1><div class="src">${htmlEncode(host)} · reading mode</div>$sb</body></html>"""
    }
}
