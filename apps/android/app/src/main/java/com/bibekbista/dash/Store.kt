package com.bibekbista.dash

import android.content.Context
import android.net.Uri
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** Everything DASH remembers lives in this app's private storage. Nothing is sent anywhere. */
class Store(private val ctx: Context) {
    data class Entry(val url: String, val title: String, val time: Long, val folder: String = "")

    private val prefs = ctx.getSharedPreferences("dash", Context.MODE_PRIVATE)
    private val historyFile = File(ctx.filesDir, "history.json")
    private val bookmarksFile = File(ctx.filesDir, "bookmarks.json")
    val history = mutableListOf<Entry>()   // newest first
    val bookmarks = mutableListOf<Entry>()

    var searchEngine: String
        get() = prefs.getString("engine", "DuckDuckGo") ?: "DuckDuckGo"
        set(v) = prefs.edit().putString("engine", v).apply()
    var blockAds: Boolean
        get() = prefs.getBoolean("blockAds", true)
        set(v) = prefs.edit().putBoolean("blockAds", v).apply()
    var httpsUpgrade: Boolean
        get() = prefs.getBoolean("https", true)
        set(v) = prefs.edit().putBoolean("https", v).apply()
    var appLock: Boolean
        get() = prefs.getBoolean("lock", false)
        set(v) = prefs.edit().putBoolean("lock", v).apply()
    /** "dark" (default), "light" or "system". */
    var theme: String
        get() = prefs.getString("theme", "dark") ?: "dark"
        set(v) = prefs.edit().putString("theme", v).apply()
    var thirdPartyCookies: Boolean
        get() = prefs.getBoolean("3pc", false)
        set(v) = prefs.edit().putBoolean("3pc", v).apply()
    var sendGpc: Boolean
        get() = prefs.getBoolean("gpc", true)
        set(v) = prefs.edit().putBoolean("gpc", v).apply()
    /** Page text size in percent (accessibility). */
    var textZoom: Int
        get() = prefs.getInt("textZoom", 100)
        set(v) = prefs.edit().putInt("textZoom", v).apply()
    private var blockOff: Set<String>
        get() = prefs.getStringSet("blockOff", emptySet()) ?: emptySet()
        set(v) = prefs.edit().putStringSet("blockOff", v).apply()
    fun blockOffList(): Set<String> = blockOff
    var webDark: Boolean
        get() = prefs.getBoolean("webDark", false)
        set(v) = prefs.edit().putBoolean("webDark", v).apply()
    fun blockingOff(host: String) = host in blockOff
    fun setBlockingOff(host: String, off: Boolean) { blockOff = if (off) blockOff + host else blockOff - host }
    /** Ask the search engine for suggestions while typing (sends only what you type, never in Incognito). */
    var searchSuggestions: Boolean
        get() = prefs.getBoolean("searchSuggestions", true)
        set(v) = prefs.edit().putBoolean("searchSuggestions", v).apply()
    /** Offer to save passwords after signing in (never in Incognito). */
    var offerPasswords: Boolean
        get() = prefs.getBoolean("offerPasswords", true)
        set(v) = prefs.edit().putBoolean("offerPasswords", v).apply()
    /** Hide common cookie-consent banners (hiding is not the same as choosing "reject"). */
    var hideCookiePopups: Boolean
        get() = prefs.getBoolean("hideCookiePopups", true)
        set(v) = prefs.edit().putBoolean("hideCookiePopups", v).apply()
    /** Keep audio playing when you leave DASH (a notification with Stop is shown). */
    var backgroundAudio: Boolean
        get() = prefs.getBoolean("backgroundAudio", true)
        set(v) = prefs.edit().putBoolean("backgroundAudio", v).apply()
    var translateAck: Boolean
        get() = prefs.getBoolean("translateAck", false)
        set(v) = prefs.edit().putBoolean("translateAck", v).apply()
    var introDone: Boolean
        get() = prefs.getBoolean("introDone", false)
        set(v) = prefs.edit().putBoolean("introDone", v).apply()
    var blockedTotal: Long
        get() = prefs.getLong("blockedTotal", 0)
        set(v) = prefs.edit().putLong("blockedTotal", v).apply()
    private var hidden: Set<String>
        get() = prefs.getStringSet("hiddenHosts", emptySet()) ?: emptySet()
        set(v) = prefs.edit().putStringSet("hiddenHosts", v).apply()

    var openTabs: List<String>
        get() = (prefs.getString("tabs", "[]") ?: "[]").let { s -> JSONArray(s).let { a -> (0 until a.length()).map { a.getString(it) } } }
        set(v) = prefs.edit().putString("tabs", JSONArray(v).toString()).apply()
    var activeTab: Int
        get() = prefs.getInt("activeTab", 0)
        set(v) = prefs.edit().putInt("activeTab", v).apply()

    // ---------- recently closed tabs (normal tabs only, newest first) ----------
    fun closedTabs(): List<Pair<String, String>> = try {
        JSONArray(prefs.getString("closed", "[]") ?: "[]").let { a -> (0 until a.length()).map { a.getJSONObject(it).let { o -> o.getString("u") to o.optString("t") } } }
    } catch (e: Exception) { emptyList() }
    private fun saveClosed(l: List<Pair<String, String>>) =
        prefs.edit().putString("closed", JSONArray(l.map { JSONObject().put("u", it.first).put("t", it.second) }).toString()).apply()
    fun pushClosed(url: String, title: String) {
        if (!url.startsWith("http")) return
        saveClosed((listOf(url to title) + closedTabs().filter { it.first != url }).take(15))
    }
    fun removeClosed(url: String) = saveClosed(closedTabs().filter { it.first != url })
    fun clearClosed() = saveClosed(emptyList())

    // ---------- per-site permissions: camera, microphone, location ----------
    /** "ask" (default), "allow" or "block". */
    fun sitePerm(host: String, kind: String): String = try {
        JSONObject(prefs.getString("sitePerms", "{}") ?: "{}").optJSONObject(host)?.optString(kind, "ask") ?: "ask"
    } catch (e: Exception) { "ask" }
    fun setSitePerm(host: String, kind: String, value: String) {
        val all = try { JSONObject(prefs.getString("sitePerms", "{}") ?: "{}") } catch (e: Exception) { JSONObject() }
        val o = all.optJSONObject(host) ?: JSONObject()
        if (value == "ask") o.remove(kind) else o.put(kind, value)
        if (o.length() == 0) all.remove(host) else all.put(host, o)
        prefs.edit().putString("sitePerms", all.toString()).apply()
    }
    fun resetSitePerms(host: String) {
        val all = try { JSONObject(prefs.getString("sitePerms", "{}") ?: "{}") } catch (e: Exception) { JSONObject() }
        all.remove(host); prefs.edit().putString("sitePerms", all.toString()).apply()
    }
    /** Hosts that have at least one saved decision, with those decisions. */
    fun sitePermHosts(): Map<String, Map<String, String>> = try {
        val all = JSONObject(prefs.getString("sitePerms", "{}") ?: "{}")
        all.keys().asSequence().sorted().associateWith { h -> all.getJSONObject(h).let { o -> o.keys().asSequence().associateWith { k -> o.getString(k) } } }
    } catch (e: Exception) { emptyMap() }

    // ---------- bookmark import / export (standard Netscape bookmark HTML, the format Chrome and Firefox use) ----------
    private fun esc(s: String) = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;")
    private fun unesc(s: String) = s.replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", "\"").replace("&#39;", "'").replace("&amp;", "&")

    fun exportBookmarksHtml(): String {
        val sb = StringBuilder("<!DOCTYPE NETSCAPE-Bookmark-file-1>\n<META HTTP-EQUIV=\"Content-Type\" CONTENT=\"text/html; charset=UTF-8\">\n<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n")
        fun link(b: Entry, indent: String) = sb.append(indent).append("<DT><A HREF=\"").append(esc(b.url)).append("\" ADD_DATE=\"").append(b.time / 1000).append("\">").append(esc(b.title)).append("</A>\n")
        for (b in bookmarks.filter { it.folder.isBlank() }) link(b, "    ")
        for (f in bookmarkFolders()) {
            sb.append("    <DT><H3>").append(esc(f)).append("</H3>\n    <DL><p>\n")
            for (b in bookmarks.filter { it.folder == f }) link(b, "        ")
            sb.append("    </DL><p>\n")
        }
        return sb.append("</DL><p>\n").toString()
    }

    /** Adds bookmarks found in an exported HTML file, keeping one level of folders (nested ones use their own name). Returns how many were new. Only http(s) links are kept. */
    fun importBookmarksHtml(html: String): Int {
        val token = Regex("<H3[^>]*>(.*?)</H3>|<A\\s[^>]*?HREF=\"([^\"]+)\"[^>]*>(.*?)</A>|<DL[^>]*>|</DL>", setOf(RegexOption.IGNORE_CASE, RegexOption.DOT_MATCHES_ALL))
        var added = 0
        val have = bookmarks.map { it.url }.toHashSet()
        val fresh = mutableListOf<Entry>()
        val stack = ArrayDeque<String>()
        var nextFolder = ""
        for (m in token.findAll(html)) {
            val t = m.value
            when {
                t.startsWith("<H3", true) -> nextFolder = unesc(m.groupValues[1].replace(Regex("<[^>]*>"), "")).trim().take(80)
                t.startsWith("<DL", true) -> { stack.addLast(nextFolder); nextFolder = "" }
                t.startsWith("</DL", true) -> if (stack.isNotEmpty()) stack.removeLast()
                else -> {
                    val url = unesc(m.groupValues[2]).trim()
                    if (!(url.startsWith("http://") || url.startsWith("https://")) || url in have) continue
                    have.add(url)
                    val title = unesc(m.groupValues[3].replace(Regex("<[^>]*>"), "")).trim().ifBlank { url }
                    fresh.add(Entry(url, title, System.currentTimeMillis(), stack.lastOrNull { it.isNotBlank() } ?: "")); added++
                }
            }
        }
        bookmarks.addAll(fresh); flush()
        return added
    }

    // ---------- bookmark folders (a folder exists while it holds bookmarks) ----------
    fun bookmarkFolders(): List<String> = bookmarks.map { it.folder }.filter { it.isNotBlank() }.distinct().sortedBy { it.lowercase() }
    fun moveBookmark(url: String, folder: String) {
        val i = bookmarks.indexOfFirst { it.url == url }
        if (i >= 0) { bookmarks[i] = bookmarks[i].copy(folder = folder.trim().take(80)); flush() }
    }
    fun renameFolder(old: String, new: String) {
        val n = new.trim().take(80); if (n.isEmpty()) return
        for (i in bookmarks.indices) if (bookmarks[i].folder == old) bookmarks[i] = bookmarks[i].copy(folder = n)
        flush()
    }
    fun removeFolder(name: String, deleteBookmarks: Boolean) {
        if (deleteBookmarks) bookmarks.removeAll { it.folder == name }
        else for (i in bookmarks.indices) if (bookmarks[i].folder == name) bookmarks[i] = bookmarks[i].copy(folder = "")
        flush()
    }

    // ---------- backup (same JSON the desktop app writes; the file is encrypted by Backup.kt) ----------
    private val engineIds = mapOf("DuckDuckGo" to "duckduckgo", "Google" to "google", "Bing" to "bing", "Brave Search" to "brave")
    private val permNames = mapOf("camera" to "camera", "microphone" to "microphone", "location" to "geolocation")

    data class RestoreResult(val bookmarks: Int, val settings: Int, val permissions: Int, val skippedPasswords: Int, val skippedOther: Boolean)

    fun backupJson(passwords: List<JSONObject>? = null): String {
        val settings = JSONObject()
        engineIds[searchEngine]?.let { settings.put("searchEngine", it) }
        settings.put("theme", theme).put("adBlockingEnabled", blockAds.toString()).put("httpsOnlyMode", httpsUpgrade.toString())
            .put("blockThirdPartyCookies", (!thirdPartyCookies).toString()).put("sendPrivacySignals", sendGpc.toString())
            .put("blockingOffHosts", blockOff.sorted().joinToString("\n"))
        val perms = JSONArray()
        sitePermHosts().forEach { (host, m) -> m.forEach { (kind, v) ->
            val name = permNames[kind]
            if (name != null) perms.put(JSONObject().put("origin", "https://$host").put("permission", name).put("decision", if (v == "allow") "granted" else "denied"))
        } }
        return JSONObject()
            .put("settings", settings)
            .put("bookmarks", JSONArray(bookmarks.map { JSONObject().put("url", it.url).put("title", it.title).put("folder", if (it.folder.isBlank()) JSONObject.NULL else it.folder).put("createdAt", it.time) }))
            .put("siteZoom", JSONArray()).put("customShortcuts", JSONArray())
            .put("hiddenSites", JSONArray(hidden.toList())).put("permissions", perms).put("notes", JSONArray())
            .put("createdAt", System.currentTimeMillis()).also { if (passwords != null) it.put("passwords", JSONArray(passwords)) }.toString()
    }

    /** Merges a backup from this phone or from the desktop app. Passwords, notes, shortcuts and per-site zoom in the file are not used on Android. */
    fun restoreBackup(json: String): RestoreResult {
        val o = JSONObject(json)
        var settingsApplied = 0
        o.optJSONObject("settings")?.let { s ->
            val e = prefs.edit()
            val engineName = s.optString("searchEngine").let { id -> engineIds.entries.firstOrNull { it.value == id }?.key }
            if (engineName != null) { e.putString("engine", engineName); settingsApplied++ }
            s.optString("theme").takeIf { it in setOf("dark", "light", "system") }?.let { e.putString("theme", it); settingsApplied++ }
            fun flag(k: String, f: (Boolean) -> Unit) { s.optString(k).takeIf { it == "true" || it == "false" }?.let { f(it == "true"); settingsApplied++ } }
            flag("adBlockingEnabled") { e.putBoolean("blockAds", it) }
            flag("httpsOnlyMode") { e.putBoolean("https", it) }
            flag("blockThirdPartyCookies") { e.putBoolean("3pc", !it) }
            flag("sendPrivacySignals") { e.putBoolean("gpc", it) }
            if (s.has("blockingOffHosts")) { e.putStringSet("blockOff", s.optString("blockingOffHosts").split("\n").map { it.trim() }.filter { it.isNotEmpty() }.toSet()); settingsApplied++ }
            e.apply()
        }
        val have = bookmarks.map { it.url }.toHashSet()
        var addedB = 0
        o.optJSONArray("bookmarks")?.let { a -> for (i in 0 until a.length()) {
            val b = a.optJSONObject(i) ?: continue
            val u = b.optString("url")
            if (!(u.startsWith("http://") || u.startsWith("https://")) || !have.add(u)) continue
            bookmarks.add(Entry(u, b.optString("title", u).ifBlank { u }, b.optLong("createdAt", System.currentTimeMillis()), if (b.isNull("folder")) "" else b.optString("folder").take(80))); addedB++
        } }
        o.optJSONArray("hiddenSites")?.let { a -> hidden = hidden + (0 until a.length()).map { a.optString(it) }.filter { it.isNotEmpty() && it.length <= 255 } }
        var permsApplied = 0
        o.optJSONArray("permissions")?.let { a -> for (i in 0 until a.length()) {
            val p = a.optJSONObject(i) ?: continue
            val origin = p.optString("origin"); if (!origin.startsWith("https://")) continue
            val host = Uri.parse(origin).host ?: continue
            val kind = permNames.entries.firstOrNull { it.value == p.optString("permission") }?.key ?: continue
            when (p.optString("decision")) { "granted" -> setSitePerm(host, kind, "allow"); "denied" -> setSitePerm(host, kind, "block"); else -> continue }
            permsApplied++
        } }
        flush()
        val skippedPw = o.optJSONArray("passwords")?.length() ?: 0
        val skippedOther = (o.optJSONArray("notes")?.length() ?: 0) > 0 || (o.optJSONArray("customShortcuts")?.length() ?: 0) > 0 || (o.optJSONArray("siteZoom")?.length() ?: 0) > 0
        return RestoreResult(addedB, settingsApplied, permsApplied, skippedPw, skippedOther)
    }

    init {
        load(historyFile, history)
        load(bookmarksFile, bookmarks)
    }

    private fun load(f: File, into: MutableList<Entry>) {
        try {
            if (!f.exists()) return
            val a = JSONArray(f.readText())
            for (i in 0 until a.length()) {
                val o = a.getJSONObject(i)
                into.add(Entry(o.getString("u"), o.optString("t"), o.optLong("d"), o.optString("f")))
            }
        } catch (e: Exception) { /* a damaged file just starts empty */ }
    }

    private fun save(f: File, from: List<Entry>) {
        try {
            val a = JSONArray()
            from.forEach { a.put(JSONObject().put("u", it.url).put("t", it.title).put("d", it.time).put("f", it.folder)) }
            f.writeText(a.toString())
        } catch (e: Exception) { /* storage full: keep running */ }
    }

    fun flush() { save(historyFile, history); save(bookmarksFile, bookmarks) }

    fun addHistory(url: String, title: String) {
        val now = System.currentTimeMillis()
        val last = history.firstOrNull()
        if (last != null && last.url == url && now - last.time < 3000) return
        history.add(0, Entry(url, title.ifBlank { url }, now))
        while (history.size > 5000) history.removeAt(history.size - 1)
    }

    fun clearHistory() { history.clear(); flush() }

    fun isBookmarked(url: String) = bookmarks.any { it.url == url }
    fun toggleBookmark(url: String, title: String): Boolean {
        val had = bookmarks.removeAll { it.url == url }
        if (!had) bookmarks.add(0, Entry(url, title.ifBlank { url }, System.currentTimeMillis()))
        flush()
        return !had
    }

    /** Home-page shortcuts: only sites you really use (5 or more visits), never ones you removed. */
    fun topSites(max: Int = 8): List<Pair<String, Int>> =
        history.mapNotNull { e -> Omnibox.hostOf(e.url).takeIf { e.url.startsWith("http") } }
            .groupingBy { it }.eachCount()
            .filter { it.value >= 5 && it.key !in hidden }
            .toList().sortedByDescending { it.second }.take(max)

    /** Address-bar suggestions from this phone only: bookmarks first, then history. Empty query = recent pages. */
    fun suggest(query: String, max: Int = 6): List<Entry> {
        val q = query.trim().lowercase()
        val pool = if (q.isEmpty()) history.take(max * 3) else bookmarks + history
        return pool.filter { q.isEmpty() || it.url.lowercase().contains(q) || it.title.lowercase().contains(q) }
            .distinctBy { it.url }.take(max)
    }

    // ----- site icons: taken from the pages you visit (no extra network requests), kept only on this phone -----
    private val iconDir = File(ctx.filesDir, "icons").also { it.mkdirs() }
    private val iconCache = HashMap<String, String?>()

    fun saveIcon(host: String, bmp: android.graphics.Bitmap) {
        try {
            val small = android.graphics.Bitmap.createScaledBitmap(bmp, 64, 64, true)
            File(iconDir, safeName(host) + ".png").outputStream().use { small.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
            iconCache.remove(host)
        } catch (e: Exception) { /* no icon for this site */ }
    }

    /** A data: URI for the site's saved icon, or null. */
    fun iconDataUri(host: String): String? = iconCache.getOrPut(host) {
        try {
            val f = File(iconDir, safeName(host) + ".png")
            if (f.exists()) "data:image/png;base64," + android.util.Base64.encodeToString(f.readBytes(), android.util.Base64.NO_WRAP) else null
        } catch (e: Exception) { null }
    }

    private fun safeName(host: String) = host.replace(Regex("[^a-zA-Z0-9._-]"), "_")

    fun hideSite(host: String) { hidden = hidden + host }

    fun clearAll() {
        history.clear(); bookmarks.clear(); hidden = emptySet(); openTabs = emptyList(); blockedTotal = 0
        iconDir.listFiles()?.forEach { it.delete() }; iconCache.clear()
        flush()
    }
}
