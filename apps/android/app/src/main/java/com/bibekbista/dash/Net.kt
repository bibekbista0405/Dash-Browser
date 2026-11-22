package com.bibekbista.dash

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Handler
import android.os.Looper
import org.json.JSONArray
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.Executors

object Net {
    /** True when Android reports a connection that can actually reach the internet. */
    fun isOnline(ctx: Context): Boolean {
        val cm = ctx.getSystemService(ConnectivityManager::class.java) ?: return true
        val n = cm.activeNetwork ?: return false
        val c = cm.getNetworkCapabilities(n) ?: return false
        return c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) && c.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }
}

/**
 * Search suggestions from the search engine you chose. Only the text you typed is sent, over https, with no cookies,
 * never in Incognito, and never for things that look like web addresses. Can be turned off in Settings.
 */
object Suggest {
    private val io = Executors.newSingleThreadExecutor()
    private val main = Handler(Looper.getMainLooper())
    private var pending: Runnable? = null
    private var generation = 0

    private fun endpoint(engine: String): String? = when (engine) {
        "DuckDuckGo" -> "https://duckduckgo.com/ac/?type=list&q="
        "Google" -> "https://suggestqueries.google.com/complete/search?client=firefox&q="
        "Bing" -> "https://api.bing.com/osjson.aspx?query="
        "Brave Search" -> "https://search.brave.com/api/suggest?q="
        "Startpage" -> "https://www.startpage.com/suggestions?format=opensearch&segment=startpage.udog&q="
        else -> null
    }

    /** Waits a moment for typing to pause, then asks. [onResult] runs on the main thread, and only for the latest request. */
    fun request(engine: String, query: String, onResult: (List<String>) -> Unit) {
        cancel()
        val base = endpoint(engine) ?: return
        val gen = ++generation
        val r = Runnable {
            io.execute {
                val list = try { fetch(base + Uri.encode(query)) } catch (e: Exception) { emptyList() }
                main.post { if (gen == generation) onResult(list) }
            }
        }
        pending = r
        main.postDelayed(r, 140)
    }

    fun cancel() { pending?.let { main.removeCallbacks(it) }; pending = null; generation++ }

    private fun fetch(url: String): List<String> {
        val c = URL(url).openConnection() as HttpURLConnection
        try {
            c.connectTimeout = 2500; c.readTimeout = 2500; c.useCaches = false
            c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) DASH")
            c.setRequestProperty("Accept", "application/json")
            if (c.responseCode != 200) return emptyList()
            val text = c.inputStream.use { it.readBytes().take(60_000).toByteArray().toString(Charsets.UTF_8) }
            val arr = JSONArray(text).getJSONArray(1)
            return (0 until minOf(arr.length(), 6)).map { arr.get(it) }.filterIsInstance<String>()
        } finally { c.disconnect() }
    }
}
