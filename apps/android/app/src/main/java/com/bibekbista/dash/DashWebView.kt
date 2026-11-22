package com.bibekbista.dash

import android.content.Context
import android.view.View
import android.webkit.WebView

/**
 * A WebView that can keep reporting "visible" to the page while the screen is off or another app is in front.
 * Without this, Chromium tells the page it is hidden and sites such as YouTube pause their video.
 */
class DashWebView(ctx: Context) : WebView(ctx) {
    /** True while audio should keep playing in the background. */
    var keepAlive = false

    override fun onWindowVisibilityChanged(visibility: Int) {
        super.onWindowVisibilityChanged(if (keepAlive) View.VISIBLE else visibility)
    }

    override fun onVisibilityChanged(changedView: View, visibility: Int) {
        super.onVisibilityChanged(changedView, if (keepAlive && changedView === this) View.VISIBLE else visibility)
    }
}
