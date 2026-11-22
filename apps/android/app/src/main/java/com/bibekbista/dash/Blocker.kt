package com.bibekbista.dash

import org.json.JSONArray

/**
 * Ad and tracker blocking, three layers:
 * 1. host list (the request's host is, or is under, a listed domain),
 * 2. URL patterns for ad servers that share a domain with real content,
 * 3. a page script that hides ad containers and, on YouTube, skips video ads (best effort).
 * Every request in every tab (including private tabs and iframes) goes through layers 1 and 2.
 */
object Blocker {
    private val domains = setOf(
        "doubleclick.net", "googlesyndication.com", "googleadservices.com", "google-analytics.com",
        "googletagmanager.com", "googletagservices.com", "adservice.google.com", "2mdn.net", "adtrafficquality.google",
        "scorecardresearch.com", "quantserve.com", "hotjar.com", "hotjar.io", "taboola.com", "outbrain.com",
        "criteo.com", "criteo.net", "adnxs.com", "amazon-adsystem.com", "adsrvr.org", "pubmatic.com",
        "rubiconproject.com", "openx.net", "moatads.com", "mixpanel.com", "segment.io", "segment.com",
        "amplitude.com", "fullstory.com", "mouseflow.com", "clarity.ms", "ads-twitter.com", "analytics.tiktok.com",
        "ads.yahoo.com", "yieldmo.com", "media.net", "smartadserver.com", "casalemedia.com", "adform.net",
        "bluekai.com", "krxd.net", "demdex.net", "everesttech.net", "serving-sys.com", "zedo.com",
        "chartbeat.net", "adcolony.com", "applovin.com", "unityads.unity3d.com", "ads.pinterest.com",
        "analytics.google.com", "connect.facebook.net", "pixel.facebook.com", "ads.linkedin.com", "bat.bing.com",
        "popads.net", "propellerads.com", "exoclick.com", "adsterra.com", "mgid.com", "revcontent.com",
        "adsafeprotected.com", "doubleverify.com", "teads.tv", "inmobi.com", "mopub.com", "vungle.com",
        "ironsrc.com", "supersonicads.com", "tapjoy.com", "adjust.com", "appsflyer.com", "branch.io",
        "onesignal.com", "optimizely.com", "crazyegg.com", "luckyorange.com", "heap.io", "heapanalytics.com",
        "statcounter.com", "histats.com", "yandex.ru/metrika", "mc.yandex.ru", "an.yandex.ru", "adriver.ru",
        "ad.doubleclick.net", "cdn.taboola.com", "trc.taboola.com", "sharethrough.com", "triplelift.com",
        "indexww.com", "lijit.com", "sovrn.com", "contextweb.com", "advertising.com", "adition.com",
        "bidswitch.net", "rlcdn.com", "tapad.com", "liadm.com", "id5-sync.com", "turn.com", "mathtag.com",
        "tremorhub.com", "springserve.com", "spotxchange.com", "freewheel.tv", "innovid.com", "flashtalking.com",
        "ad.gt", "adskeeper.com", "adnow.com", "clickadu.com", "juicyads.com", "trafficjunky.net", "trafficfactory.biz",
    )

    /** Ad servers that live on a domain we can't block wholesale (checked against the full URL). */
    private val urlParts = listOf(
        "/pagead/", "/pagead2.", "/adserver", "/adsbygoogle", "/ads/ga-audiences", "/gampad/", "/doubleclick/",
        "googleads.g.doubleclick", "/api/stats/ads", "/pcs/activeview", "/ptracking?", "/youtubei/v1/log_event",
        "facebook.com/tr?", "facebook.com/tr/", "/collect?v=1", "/j/collect?", "/gtag/js", "/analytics.js", "/fbevents.js",
        "/adframe.", "/ad_frame.", "/banner_ads/", "/advert.", "/adview?", "/ads.js", "/ads-min.js",
    )

    fun blocks(host: String?): Boolean {
        if (host.isNullOrEmpty()) return false
        val h = host.lowercase()
        var i = 0
        while (true) {
            if (h.substring(i) in domains) return true
            val dot = h.indexOf('.', i)
            if (dot < 0) return false
            i = dot + 1
        }
    }

    fun blocksUrl(url: String): Boolean {
        val u = url.lowercase()
        return urlParts.any { u.contains(it) }
    }

    /** Page script: hides common ad containers; on YouTube also skips video ads. Skipped on hosts where blocking is off. */
    fun pageScript(offHosts: Collection<String>, ads: Boolean = true, cookies: Boolean = false): String {
        val off = JSONArray(offHosts.toList()).toString()
        return """(function(){
try{var off=$off,h=location.hostname.replace(/^www\./,'');for(var i=0;i<off.length;i++){if(h===off[i]||h.endsWith('.'+off[i]))return;}}catch(e){}
if(window.__dashAds)return;window.__dashAds=1;
var ADS=$ads,COOKIES=$cookies;
var css=!ADS?'':'ins.adsbygoogle,.adsbygoogle,[id^="google_ads_"],[id^="div-gpt-ad"],[class*="ad-slot"],[class*="adslot"],[class*="ad-banner"],[class*="adbanner"],[class*="advert"],[id*="advert"],[class*="sponsored-"],[aria-label="Advertisement"],[data-ad-slot],[data-google-query-id],iframe[src*="doubleclick"],iframe[src*="googlesyndication"],iframe[id^="google_ads"],.ad-container,.ad-wrapper,.ads-container,.ad-unit,.adunit,#ad-container,#ad_banner,#adbanner,.taboola,.OUTBRAIN,[id*="taboola"],[class*="outbrain"]{display:none!important;visibility:hidden!important;height:0!important;min-height:0!important}';
if(COOKIES)css+='#onetrust-consent-sdk,#onetrust-banner-sdk,.onetrust-pc-dark-filter,#CybotCookiebotDialog,#CybotCookiebotDialogBodyUnderlay,#cookie-law-info-bar,#cookiescript_injected,.cc-window,.cc-banner,#cookieconsent,.cookie-consent,.cookie-banner,.cookie-notice,#cookie-notice,#cookie-banner,#cookiebanner,.cmp-container,#sp-cc,[id^="sp_message_container"],.truste_overlay,.truste_box_overlay,#truste-consent-track,#didomi-host,#qc-cmp2-container,.fc-consent-root,#usercentrics-root,#cmpbox,#cmpbox2,.evidon-banner,.osano-cm-window,#hs-eu-cookie-confirmation,.iubenda-cs-container,#iubenda-cs-banner,.gdpr-cookie-notice,[id*="cookie-consent"],[class*="cookie-consent"],[id*="cookieConsent"]{display:none!important}html.didomi-popup-open,body.didomi-popup-open,html.sp-message-open,body.sp-message-open,body.qc-cmp-ui-showing,html.qc-cmp-ui-showing{overflow:auto!important;position:static!important}';
if(ADS&&/(^|\.)youtube\.com${'$'}/.test(location.hostname)){css+=',#masthead-ad,ytd-ad-slot-renderer,ytd-in-feed-ad-layout-renderer,ytd-promoted-sparkles-web-renderer,ytd-display-ad-renderer,ytd-banner-promo-renderer,ytd-statement-banner-renderer,.ytp-ad-overlay-container,.ytp-ad-module .ytp-ad-image-overlay,.video-ads .ytp-ad-player-overlay,#player-ads,ytm-promoted-sparkles-web-renderer,ytm-companion-ad-renderer,.ad-div{display:none!important}';
setInterval(function(){try{var p=document.querySelector('.html5-video-player');var v=document.querySelector('video.html5-main-video')||document.querySelector('video');
if(p&&v&&(p.classList.contains('ad-showing')||p.classList.contains('ad-interrupting'))){v.muted=true;if(isFinite(v.duration)&&v.duration>0)v.currentTime=v.duration;}
var b=document.querySelector('.ytp-ad-skip-button,.ytp-ad-skip-button-modern,.ytp-skip-ad-button,.ytp-ad-skip-button-slot button');if(b)b.click();}catch(e){}},400);}
function add(){var s=document.createElement('style');s.textContent=css;(document.head||document.documentElement).appendChild(s);}
if(document.documentElement)add();else document.addEventListener('DOMContentLoaded',add);
})();"""
    }
}
