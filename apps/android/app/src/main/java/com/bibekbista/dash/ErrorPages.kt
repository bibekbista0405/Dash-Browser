package com.bibekbista.dash

import android.net.http.SslError
import android.text.TextUtils.htmlEncode
import android.webkit.WebViewClient

/** Friendly pages for when a site can't be loaded. Every button is a dash:// action handled by MainActivity. */
object ErrorPages {
    private class Info(val title: String, val message: String, val hint: String)

    private fun describe(code: Int, offline: Boolean): Info = when {
        offline -> Info("No internet connection", "DASH can't reach the internet. Check that Wi-Fi or mobile data is on.", "This page loads again by itself when you're back online.")
        code == WebViewClient.ERROR_HOST_LOOKUP -> Info("Can't find that site", "The address may be misspelled, or the site doesn't exist any more.", "Check the spelling, or search for it instead.")
        code == WebViewClient.ERROR_CONNECT || code == WebViewClient.ERROR_IO -> Info("Couldn't connect", "The site refused the connection, or the network dropped while loading.", "Try again in a moment. If other sites work, this one may be down.")
        code == WebViewClient.ERROR_TIMEOUT -> Info("Taking too long", "The site didn't answer in time.", "Your connection may be slow, or the site is busy. Try again.")
        code == WebViewClient.ERROR_REDIRECT_LOOP -> Info("Too many redirects", "This site keeps sending DASH in circles.", "Clearing this site's cookies (padlock > Clear cookies) often fixes it.")
        code == WebViewClient.ERROR_BAD_URL -> Info("That address isn't valid", "DASH can't open this address.", "Check it for typos.")
        code == WebViewClient.ERROR_FAILED_SSL_HANDSHAKE -> Info("Secure connection failed", "DASH couldn't set up a private connection with this site.", "The site may be misconfigured, or something on the network is interfering.")
        code == WebViewClient.ERROR_UNSUPPORTED_SCHEME -> Info("Can't open this link", "DASH doesn't know how to open this kind of address.", "")
        else -> Info("This page can't be loaded", "Something went wrong while loading the page.", "Try again in a moment.")
    }

    fun sslDescription(primary: Int) = when (primary) {
        SslError.SSL_EXPIRED -> "The site's certificate has expired."
        SslError.SSL_IDMISMATCH -> "The certificate was issued for a different site name."
        SslError.SSL_NOTYETVALID -> "The site's certificate isn't valid yet. Check that your phone's date and time are right."
        SslError.SSL_DATE_INVALID -> "The certificate's dates are wrong. Check that your phone's date and time are right."
        SslError.SSL_UNTRUSTED -> "The certificate was not issued by a trusted authority."
        else -> "The certificate could not be verified."
    }

    fun html(dark: Boolean, url: String, code: Int, technical: String, offline: Boolean, ssl: String? = null): String {
        val i = if (ssl != null) Info("Your connection isn't private", ssl, "DASH blocked this page to protect your information. There is no way to continue past this.") else describe(code, offline)
        val bg = if (dark) "#0B0D10" else "#FFFFFF"; val fg = if (dark) "#E8EAED" else "#14161A"
        val dim = if (dark) "#9AA0A8" else "#5F6368"; val card = if (dark) "#171A1F" else "#F1F3F4"
        val wifi = if (offline) """<a class="b2" href="dash://wifi">Wi-Fi settings</a>""" else ""
        val retry = if (ssl == null) """<a class="b" href="dash://retry">Try again</a>""" else """<a class="b" href="dash://back">Go back</a>"""
        return """<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
            body{margin:0;background:$bg;color:$fg;font:16px/1.5 system-ui,sans-serif;padding:12vh 28px 40px}
            .ic{width:64px;height:64px;border-radius:20px;background:$card;display:flex;align-items:center;justify-content:center;margin-bottom:22px}
            h2{margin:0 0 8px;font-size:24px} p{margin:0 0 10px;color:$dim}
            .host{display:inline-block;background:$card;border-radius:10px;padding:4px 10px;font-size:14px;margin:6px 0 16px;color:$fg;word-break:break-all}
            .b,.b2{display:inline-block;margin:14px 10px 0 0;padding:12px 26px;border-radius:24px;text-decoration:none;font-weight:600}
            .b{background:#5B8CFF;color:#fff}.b2{background:$card;color:$fg} small{color:$dim;opacity:.8}
            </style></head><body>
            <div class="ic"><svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="$dim" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.5"/></svg></div>
            <h2>${htmlEncode(i.title)}</h2>
            <div class="host">${htmlEncode(Omnibox.hostOf(url))}</div>
            <p>${htmlEncode(i.message)}</p>${if (i.hint.isNotEmpty()) "<p>${htmlEncode(i.hint)}</p>" else ""}
            <div>$retry$wifi</div>
            <p style="margin-top:26px"><small>${htmlEncode(technical)}</small></p></body></html>"""
    }
}
