package com.bibekbista.dash

import android.net.Uri

object Omnibox {
    val ENGINES = linkedMapOf(
        "DuckDuckGo" to "https://duckduckgo.com/?q=%s",
        "Google" to "https://www.google.com/search?q=%s",
        "Bing" to "https://www.bing.com/search?q=%s",
        "Brave Search" to "https://search.brave.com/search?q=%s",
        "Startpage" to "https://www.startpage.com/do/search?q=%s",
    )

    private val SCHEME = Regex("^([a-zA-Z][a-zA-Z0-9+.-]*)://")
    private val HOST = Regex("^(?:[\\p{L}\\d](?:[\\p{L}\\d-]*[\\p{L}\\d])?\\.)+\\p{L}{2,24}(?::\\d{1,5})?(?:[/?#]\\S*)?$")
    private val IPV4 = Regex("^\\d{1,3}(?:\\.\\d{1,3}){3}(?::\\d{1,5})?(?:[/?#]\\S*)?$")
    private val LOCALHOST = Regex("^localhost(?::\\d{1,5})?(?:[/?#]\\S*)?$", RegexOption.IGNORE_CASE)
    private val PRIVATE_IP = Regex("^(10|127|192\\.168|172\\.(1[6-9]|2\\d|3[01]))\\..*")

    fun searchUrl(text: String, engine: String): String =
        (ENGINES[engine] ?: ENGINES.getValue("DuckDuckGo")).replace("%s", Uri.encode(text.trim()))

    /** Turns what was typed into an address: a web address stays one, anything else becomes a search. Only http(s) is opened. */
    fun resolve(input: String, engine: String): String {
        val t = input.trim()
        if (t.isEmpty()) return ""
        SCHEME.find(t)?.let { m -> return if (m.groupValues[1].lowercase() in setOf("http", "https")) t else searchUrl(t, engine) }
        if (t.contains(' ') || t.contains('\n')) return searchUrl(t, engine)
        if (LOCALHOST.matches(t) || IPV4.matches(t)) {
            return (if (t.startsWith("localhost", true) || PRIVATE_IP.containsMatchIn(t)) "http://" else "https://") + t
        }
        if (HOST.matches(t)) return "https://$t"
        return searchUrl(t, engine)
    }

    fun looksLikeUrl(input: String): Boolean {
        val t = input.trim()
        if (t.isEmpty() || t.contains(' ')) return false
        SCHEME.find(t)?.let { return it.groupValues[1].lowercase() in setOf("http", "https") }
        return LOCALHOST.matches(t) || IPV4.matches(t) || HOST.matches(t)
    }

    private val ENGINE_HOSTS = setOf("duckduckgo.com", "google.com", "bing.com", "search.brave.com", "startpage.com")

    /** If this address is a results page of a known search engine, the text that was searched (shown instead of the long address). */
    fun searchQuery(url: String): String? = try {
        val u = Uri.parse(url)
        if (u.host?.removePrefix("www.") in ENGINE_HOSTS) u.getQueryParameter("q")?.takeIf { it.isNotBlank() } else null
    } catch (e: Exception) { null }

    fun hostOf(url: String): String = try { Uri.parse(url).host?.removePrefix("www.") ?: url } catch (e: Exception) { url }
}
