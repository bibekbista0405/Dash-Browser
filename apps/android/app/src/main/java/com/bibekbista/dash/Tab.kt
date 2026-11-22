package com.bibekbista.dash

import android.graphics.Bitmap
import android.webkit.WebView

class Tab(var webView: WebView, val isPrivate: Boolean) {
    var reader: Boolean = false     // showing reading mode
    var errorUrl: String? = null   // set while this tab shows a "can't load" page, so it can retry by itself when back online
    var title = ""
    var url = ""            // empty = the DASH home page
    var desktop = false
    var loading = false
    var blocked = 0         // ads and trackers blocked on this page
    var thumb: Bitmap? = null
    var adHandle: androidx.webkit.ScriptHandler? = null
    var bgHandle: androidx.webkit.ScriptHandler? = null   // keeps the page's "visible" state true so audio keeps playing
}
