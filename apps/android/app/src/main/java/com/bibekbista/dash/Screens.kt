package com.bibekbista.dash

import android.app.DownloadManager
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.net.Uri
import android.text.Editable
import android.text.TextWatcher
import android.text.format.DateUtils
import android.text.format.Formatter
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.animation.AnimationUtils
import android.view.inputmethod.InputMethodManager
import android.webkit.CookieManager
import android.webkit.WebStorage
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.PopupWindow
import android.widget.ScrollView
import android.widget.TextView
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.materialswitch.MaterialSwitch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** The menu, site-info sheet and the full-screen pages (history, bookmarks, downloads, settings). */
class Screens(private val a: MainActivity) {
    private var queryHandler: ((String) -> Unit)? = null
    private var menu: PopupWindow? = null

    init {
        a.screenBack().setOnClickListener { backFromScreen() }
        a.screenSearch.setOnClickListener {
            val showing = a.screenQuery.visibility == View.VISIBLE
            a.screenQuery.visibility = if (showing) View.GONE else View.VISIBLE
            if (showing) { a.screenQuery.setText(""); a.hideKeyboard() } else {
                a.screenQuery.requestFocus()
                (a.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showSoftInput(a.screenQuery, 0)
            }
        }
        a.screenQuery.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, st: Int, c: Int, af: Int) {}
            override fun onTextChanged(s: CharSequence?, st: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) { queryHandler?.invoke(s?.toString() ?: "") }
        })
        listOf(a.screenSearch, a.screenAction, a.screenBack()).forEach { it.setColorFilter(a.color(R.color.dash_text), PorterDuff.Mode.SRC_IN) }
    }

    private fun MainActivity.screenBack(): ImageView = findViewById(R.id.screenBack)

    /** A folder inside Bookmarks goes back to the folder list; everything else closes the screen. */
    private var parentScreen: (() -> Unit)? = null

    fun backFromScreen(): Boolean {
        if (a.screenRoot.visibility != View.VISIBLE) return false
        val p = parentScreen
        if (p != null) { parentScreen = null; p(); return true }
        return closeScreen()
    }

    fun closeScreen(): Boolean {
        if (a.screenRoot.visibility != View.VISIBLE) return false
        a.hideKeyboard()
        a.screenRoot.visibility = View.GONE
        a.screenBody.removeAllViews()
        queryHandler = null
        return true
    }

    private fun openScreen(title: String, searchable: Boolean, actionRes: Int, onAction: (() -> Unit)?, build: (FrameLayout) -> ((String) -> Unit)?) {
        menu?.dismiss()
        parentScreen = null
        a.screenTitle.text = title
        a.screenSearch.visibility = if (searchable) View.VISIBLE else View.GONE
        a.screenQuery.setText(""); a.screenQuery.visibility = View.GONE
        if (onAction != null) {
            a.screenAction.visibility = View.VISIBLE; a.screenAction.setImageResource(actionRes)
            a.screenAction.setOnClickListener { onAction() }
        } else a.screenAction.visibility = View.GONE
        a.screenBody.removeAllViews()
        queryHandler = build(a.screenBody)
        if (a.screenRoot.visibility != View.VISIBLE) {
            a.screenRoot.visibility = View.VISIBLE
            a.screenRoot.startAnimation(AnimationUtils.loadAnimation(a, R.anim.screen_in))
        }
    }

    private fun emptyText(msg: String) = TextView(a).apply {
        text = msg; textSize = 15f; gravity = Gravity.CENTER; setPadding(a.dp(32), a.dp(32), a.dp(32), a.dp(32))
        setTextColor(a.color(R.color.dash_dim))
        layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER)
    }

    private fun listBody(body: FrameLayout, empty: String): Pair<RowAdapter, TextView> {
        val rv = RecyclerView(a).apply {
            layoutManager = LinearLayoutManager(a); clipToPadding = false; setPadding(0, 0, 0, a.dp(16))
            layoutAnimation = AnimationUtils.loadLayoutAnimation(a, R.anim.layout_cards)
        }
        val adapter = RowAdapter()
        rv.adapter = adapter
        val emptyView = emptyText(empty)
        body.addView(rv, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        body.addView(emptyView)
        return adapter to emptyView
    }

    // ---------- main menu ----------
    fun showMenu(anchor: View) {
        val t = a.current ?: return
        val card = LinearLayout(a).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundResource(R.drawable.bg_menu)
            elevation = a.dp(12).toFloat()
            setPadding(0, a.dp(8), 0, a.dp(8))
        }
        val popup = PopupWindow(card, a.dp(280), ViewGroup.LayoutParams.WRAP_CONTENT, true)
        popup.elevation = a.dp(12).toFloat()
        popup.animationStyle = R.style.PopupAnim
        popup.setBackgroundDrawable(null)
        menu = popup

        val hasPage = t.url.isNotEmpty()
        val bookmarked = hasPage && a.store.isBookmarked(t.url)
        val iconRow = LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER; setPadding(a.dp(6), 0, a.dp(6), a.dp(6)) }
        fun iconBtn(res: Int, desc: String, enabled: Boolean, tint: Int, action: () -> Unit) {
            val v = ImageView(a).apply {
                setImageResource(res); contentDescription = desc
                setColorFilter(if (enabled) tint else a.color(R.color.dash_divider), PorterDuff.Mode.SRC_IN)
                setPadding(a.dp(12), a.dp(12), a.dp(12), a.dp(12))
                isEnabled = enabled
                setOnClickListener { popup.dismiss(); action() }
            }
            iconRow.addView(v, LinearLayout.LayoutParams(0, a.dp(48), 1f))
        }
        iconBtn(R.drawable.ic_back, "Back", t.webView.canGoBack(), a.color(R.color.dash_text)) { t.webView.goBack() }
        iconBtn(R.drawable.ic_forward, "Forward", t.webView.canGoForward(), a.color(R.color.dash_text)) { t.webView.goForward() }
        iconBtn(if (bookmarked) R.drawable.ic_star else R.drawable.ic_star_border, "Bookmark", hasPage,
            a.color(if (bookmarked) R.color.dash_accent else R.color.dash_text)) {
            val added = a.store.toggleBookmark(t.url, t.title); a.toast(if (added) "Bookmark added" else "Bookmark removed")
        }
        iconBtn(R.drawable.ic_share, "Share", hasPage, a.color(R.color.dash_text)) {
            a.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, t.url), "Share link"))
        }
        iconBtn(R.drawable.ic_refresh, "Reload", hasPage, a.color(R.color.dash_text)) { t.webView.reload() }
        card.addView(iconRow)

        fun divider() = View(a).apply {
            setBackgroundColor(a.color(R.color.dash_divider))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 1).apply { setMargins(0, a.dp(4), 0, a.dp(4)) }
        }
        val list = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL }
        fun item(icon: Int, label: String, checked: Boolean = false, enabled: Boolean = true, action: () -> Unit) {
            val row = LinearLayout(a).apply {
                orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL
                setPadding(a.dp(18), 0, a.dp(18), 0); alpha = if (enabled) 1f else 0.4f
                val out = android.util.TypedValue(); a.theme.resolveAttribute(android.R.attr.selectableItemBackground, out, true)
                setBackgroundResource(out.resourceId)
                isEnabled = enabled
                setOnClickListener { popup.dismiss(); action() }
            }
            row.addView(ImageView(a).apply { setImageResource(icon); setColorFilter(a.color(R.color.dash_dim), PorterDuff.Mode.SRC_IN) }, LinearLayout.LayoutParams(a.dp(24), a.dp(24)))
            row.addView(TextView(a).apply { text = label; textSize = 15f; setTextColor(a.color(R.color.dash_text)) },
                LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = a.dp(16) })
            if (checked) row.addView(ImageView(a).apply { setImageResource(R.drawable.ic_check); setColorFilter(a.color(R.color.dash_accent), PorterDuff.Mode.SRC_IN) }, LinearLayout.LayoutParams(a.dp(22), a.dp(22)))
            list.addView(row, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, a.dp(50)))
        }
        item(R.drawable.ic_new_tab, "New tab") { a.newTab(null) }
        item(R.drawable.ic_incognito, "New Incognito tab") { a.newTab(null, isPrivate = true) }
        list.addView(divider())
        item(R.drawable.ic_history, "History") { showHistory() }
        item(R.drawable.ic_new_tab, "Recently closed", enabled = a.store.closedTabs().isNotEmpty()) { showRecentlyClosed() }
        item(R.drawable.ic_download, "Downloads") { showDownloads() }
        item(R.drawable.ic_bookmark, "Bookmarks") { showBookmarks() }
        list.addView(divider())
        item(R.drawable.ic_find, "Find in page", enabled = hasPage) { a.openFind() }
        item(R.drawable.ic_info, if (t.reader) "Exit reading mode" else "Reading mode", enabled = hasPage && t.url.startsWith("http")) { a.readingMode() }
        item(R.drawable.ic_open, "Translate page", enabled = hasPage && t.url.startsWith("http")) { a.translatePage() }
        item(R.drawable.ic_download, "Print / Save as PDF", enabled = hasPage) { a.printPage() }
        item(R.drawable.ic_home, "Add to Home screen", enabled = hasPage) { addToHomeScreen(t) }
        item(R.drawable.ic_desktop, "Desktop site", checked = t.desktop, enabled = hasPage) { a.setDesktop(t, !t.desktop) }
        list.addView(divider())
        item(R.drawable.ic_settings, "Settings") { showSettings() }

        val scroll = ScrollView(a).apply { addView(list); isVerticalScrollBarEnabled = false }
        card.addView(scroll, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        val maxH = (a.resources.displayMetrics.heightPixels * 0.85f).toInt()
        card.measure(View.MeasureSpec.makeMeasureSpec(a.dp(280), View.MeasureSpec.EXACTLY), View.MeasureSpec.UNSPECIFIED)
        if (card.measuredHeight > maxH) popup.height = maxH
        popup.showAsDropDown(anchor, 0, -a.dp(8), Gravity.END)
    }

    private fun addToHomeScreen(t: Tab) {
        val host = Omnibox.hostOf(t.url)
        val size = 192
        val bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        val p = Paint(Paint.ANTI_ALIAS_FLAG)
        p.color = badgeColor(host); c.drawCircle(size / 2f, size / 2f, size / 2f, p)
        p.color = Color.WHITE; p.textSize = size * 0.5f; p.textAlign = Paint.Align.CENTER; p.isFakeBoldText = true
        c.drawText(host.take(1).uppercase(), size / 2f, size / 2f - (p.descent() + p.ascent()) / 2f, p)
        val info = ShortcutInfoCompat.Builder(a, "site-$host")
            .setShortLabel(host)
            .setIcon(IconCompat.createWithBitmap(bmp))
            .setIntent(Intent(a, MainActivity::class.java).setAction(Intent.ACTION_VIEW).setData(Uri.parse(t.url)))
            .build()
        if (ShortcutManagerCompat.isRequestPinShortcutSupported(a)) ShortcutManagerCompat.requestPinShortcut(a, info, null)
        else a.toast("Your launcher can't add shortcuts")
    }

    // ---------- site information ----------
    fun showSiteInfo() {
        val t = a.current ?: return
        if (t.url.isEmpty()) return
        val host = Omnibox.hostOf(t.url)
        val secure = t.url.startsWith("https://")
        val sheet = BottomSheetDialog(a)
        val col = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL; setPadding(a.dp(20), a.dp(20), a.dp(20), a.dp(28)) }

        val head = LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL }
        head.addView(TextView(a).apply { gravity = Gravity.CENTER; textSize = 20f; setTypeface(null, android.graphics.Typeface.BOLD); setBadge(host) },
            LinearLayout.LayoutParams(a.dp(48), a.dp(48)))
        val names = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL }
        names.addView(TextView(a).apply { text = host; textSize = 18f; setTypeface(null, android.graphics.Typeface.BOLD); setTextColor(a.color(R.color.dash_text)) })
        names.addView(TextView(a).apply {
            text = if (secure) "Connection is secure" else "Connection is not secure"
            textSize = 14f; setTextColor(a.color(if (secure) R.color.dash_dim else R.color.dash_danger))
        })
        head.addView(names, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f).apply { marginStart = a.dp(14) })
        col.addView(head)

        val stat = TextView(a).apply {
            text = "${t.blocked} ads and trackers blocked on this page"
            textSize = 15f; setTextColor(a.color(R.color.dash_text)); setPadding(a.dp(16), a.dp(14), a.dp(16), a.dp(14))
            setBackgroundResource(R.drawable.bg_card)
        }
        col.addView(stat, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { topMargin = a.dp(18) })

        col.addView(switchRow("Block ads and trackers on this site", "", !a.store.blockingOff(host)) { on ->
            a.store.setBlockingOff(host, !on); a.refreshAdScripts(); t.webView.reload()
        })
        if (secure) {
            col.addView(TextView(a).apply { text = "Permissions"; textSize = 13f; setTypeface(null, android.graphics.Typeface.BOLD); setTextColor(a.color(R.color.dash_accent)); setPadding(0, a.dp(14), 0, a.dp(2)) })
            SitePermissions.KINDS.forEach { kind ->
                val v = TextView(a).apply {
                    textSize = 15f; setTextColor(a.color(R.color.dash_text)); setPadding(0, a.dp(10), 0, a.dp(10))
                    fun upd() { text = "${SitePermissions.label(kind)}: ${SitePermissions.stateLabel(a.store.sitePerm(host, kind))}" }
                    upd()
                    setOnClickListener { pickPermState(host, kind) { upd() } }
                }
                col.addView(v)
            }
        }
        val clear = TextView(a).apply {
            text = "Clear cookies for this site"; textSize = 15f; setTextColor(a.color(R.color.dash_accent))
            setPadding(0, a.dp(14), 0, a.dp(6))
            setOnClickListener {
                val cm = CookieManager.getInstance()
                cm.getCookie(t.url)?.split(";")?.forEach { c ->
                    val n = c.substringBefore("=").trim()
                    cm.setCookie(t.url, "$n=; Max-Age=0; Path=/")
                    cm.setCookie(t.url, "$n=; Max-Age=0; Path=/; Domain=$host")
                }
                cm.flush(); a.toast("Cookies cleared for $host"); sheet.dismiss()
            }
        }
        col.addView(clear)
        sheet.setContentView(col)
        sheet.show()
    }

    private fun switchRow(title: String, sub: String, checked: Boolean, onChange: (Boolean) -> Unit): View {
        val row = LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(0, a.dp(10), 0, a.dp(10)) }
        val texts = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL }
        texts.addView(TextView(a).apply { text = title; textSize = 16f; setTextColor(a.color(R.color.dash_text)) })
        if (sub.isNotEmpty()) texts.addView(TextView(a).apply { text = sub; textSize = 13f; setTextColor(a.color(R.color.dash_dim)) })
        row.addView(texts, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        val sw = MaterialSwitch(a).apply { isChecked = checked; setOnCheckedChangeListener { _, on -> onChange(on) } }
        row.addView(sw)
        row.setOnClickListener { sw.toggle() }
        return row
    }

    // ---------- history, bookmarks, downloads ----------
    private fun dayLabel(time: Long): String = when {
        DateUtils.isToday(time) -> "Today"
        DateUtils.isToday(time + DateUtils.DAY_IN_MILLIS) -> "Yesterday"
        else -> SimpleDateFormat("EEEE, d MMMM", Locale.getDefault()).format(Date(time))
    }

    fun showHistory() {
        openScreen("History", true, R.drawable.ic_delete, {
            MaterialAlertDialogBuilder(a).setTitle("Clear history?").setMessage("This removes all browsing history on this phone.")
                .setPositiveButton("Clear") { _, _ -> a.store.clearHistory(); a.reloadHomeTabs(); showHistory() }
                .setNegativeButton("Cancel", null).show()
        }) { body ->
            val (adapter, empty) = listBody(body, "No history yet.\nPages you visit show up here.")
            lateinit var refresh: (String) -> Unit
            refresh = { q ->
                val rows = mutableListOf<Row>()
                var lastDay = ""
                a.store.history.filter { q.isBlank() || it.title.contains(q, true) || it.url.contains(q, true) }.take(400).forEach { e ->
                    val day = dayLabel(e.time)
                    if (day != lastDay) { rows.add(Row(title = day, header = true)); lastDay = day }
                    val host = Omnibox.hostOf(e.url)
                    rows.add(Row(
                        title = e.title, subtitle = host, badgeHost = host, trailingRes = R.drawable.ic_close,
                        onClick = { closeScreen(); a.openUrlInCurrent(e.url) },
                        onLong = { closeScreen(); a.newTab(e.url) },
                        onTrailing = { a.store.history.remove(e); a.store.flush(); refresh(a.screenQuery.text.toString()) },
                    ))
                }
                adapter.submit(rows)
                empty.visibility = if (rows.isEmpty()) View.VISIBLE else View.GONE
            }
            refresh("")
            refresh
        }
    }

    fun showBookmarks(folder: String? = null) {
        openScreen(folder ?: "Bookmarks", true, R.drawable.ic_more, { showBookmarkOptions() }) { body ->
            if (folder != null) parentScreen = { showBookmarks() }
            val (adapter, empty) = listBody(body, if (folder != null) "This folder is empty." else "No bookmarks yet.\nTap the star in the menu to save a page.")
            lateinit var refresh: (String) -> Unit
            refresh = { q ->
                val search = q.isNotBlank()
                val rows = mutableListOf<Row>()
                if (!search && folder == null) a.store.bookmarkFolders().forEach { f ->
                    val n = a.store.bookmarks.count { it.folder == f }
                    rows.add(Row(title = f, subtitle = if (n == 1) "1 bookmark" else "$n bookmarks", iconRes = R.drawable.ic_folder, trailingRes = R.drawable.ic_more,
                        onClick = { showBookmarks(f) }, onLong = { folderActions(f) { refresh("") } }, onTrailing = { folderActions(f) { refresh("") } }))
                }
                val items = a.store.bookmarks.filter {
                    if (search) it.title.contains(q, true) || it.url.contains(q, true) else if (folder == null) it.folder.isBlank() else it.folder == folder
                }
                items.forEach { e ->
                    val host = Omnibox.hostOf(e.url)
                    rows.add(Row(
                        title = e.title, subtitle = if (search && e.folder.isNotBlank()) "$host  ·  ${e.folder}" else host, badgeHost = host, trailingRes = R.drawable.ic_close,
                        onClick = { closeScreen(); a.openUrlInCurrent(e.url) },
                        onLong = { bookmarkActions(e) { refresh(a.screenQuery.text.toString()) } },
                        onTrailing = { a.store.bookmarks.remove(e); a.store.flush(); refresh(a.screenQuery.text.toString()) },
                    ))
                }
                adapter.submit(rows)
                empty.visibility = if (rows.isEmpty()) View.VISIBLE else View.GONE
            }
            refresh("")
            refresh
        }
    }

    private fun bookmarkActions(e: Store.Entry, after: () -> Unit) {
        MaterialAlertDialogBuilder(a).setTitle(e.title.ifBlank { e.url })
            .setItems(arrayOf("Open in new tab", "Open in Incognito tab", "Move to folder", "Delete")) { _, i ->
                when (i) {
                    0 -> { closeScreen(); a.newTab(e.url) }
                    1 -> { closeScreen(); a.newTab(e.url, isPrivate = true) }
                    2 -> moveToFolder(e, after)
                    3 -> { a.store.bookmarks.remove(e); a.store.flush(); after() }
                }
            }.show()
    }

    private fun moveToFolder(e: Store.Entry, after: () -> Unit) {
        val folders = a.store.bookmarkFolders()
        val labels = arrayOf("No folder") + folders.toTypedArray() + arrayOf("New folder…")
        MaterialAlertDialogBuilder(a).setTitle("Move to").setItems(labels) { _, i ->
            when {
                i == 0 -> { a.store.moveBookmark(e.url, ""); after() }
                i <= folders.size -> { a.store.moveBookmark(e.url, folders[i - 1]); after() }
                else -> askText("New folder", "Folder name", "") { name -> a.store.moveBookmark(e.url, name); after() }
            }
        }.show()
    }

    private fun folderActions(name: String, after: () -> Unit) {
        MaterialAlertDialogBuilder(a).setTitle(name).setItems(arrayOf("Rename", "Remove folder (keep bookmarks)", "Delete folder and bookmarks")) { _, i ->
            when (i) {
                0 -> askText("Rename folder", "Folder name", name) { n -> a.store.renameFolder(name, n); after() }
                1 -> { a.store.removeFolder(name, false); after() }
                2 -> MaterialAlertDialogBuilder(a).setTitle("Delete \"$name\"?").setMessage("${a.store.bookmarks.count { it.folder == name }} bookmarks in it will be deleted.")
                    .setPositiveButton("Delete") { _, _ -> a.store.removeFolder(name, true); after() }.setNegativeButton("Cancel", null).show()
            }
        }.show()
    }

    private fun askText(title: String, hint: String, initial: String, onOk: (String) -> Unit) {
        val input = android.widget.EditText(a).apply { this.hint = hint; setText(initial); setSingleLine(); setSelection(text.length) }
        val box = FrameLayout(a).apply { setPadding(a.dp(24), a.dp(8), a.dp(24), 0); addView(input) }
        MaterialAlertDialogBuilder(a).setTitle(title).setView(box)
            .setPositiveButton("OK") { _, _ -> input.text.toString().trim().takeIf { it.isNotEmpty() }?.let(onOk) }
            .setNegativeButton("Cancel", null).show()
    }

    fun showDownloads() {
        openScreen("Downloads", false, 0, null) { body ->
            val (adapter, empty) = listBody(body, "No downloads yet.\nFiles you download from websites show up here.")
            val dm = a.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            lateinit var refresh: () -> Unit
            refresh = {
                val rows = mutableListOf<Row>()
                var active = false
                dm.query(DownloadManager.Query()).use { c ->
                    val iId = c.getColumnIndexOrThrow(DownloadManager.COLUMN_ID)
                    val iTitle = c.getColumnIndexOrThrow(DownloadManager.COLUMN_TITLE)
                    val iStatus = c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)
                    val iSize = c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)
                    val iDone = c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)
                    val iReason = c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON)
                    val iUri = c.getColumnIndexOrThrow(DownloadManager.COLUMN_URI)
                    while (c.moveToNext()) {
                        val id = c.getLong(iId); val status = c.getInt(iStatus); val size = c.getLong(iSize); val done = c.getLong(iDone)
                        val reason = c.getInt(iReason); val uri = c.getString(iUri) ?: ""
                        val ok = status == DownloadManager.STATUS_SUCCESSFUL
                        val running = status == DownloadManager.STATUS_RUNNING || status == DownloadManager.STATUS_PENDING
                        if (running || status == DownloadManager.STATUS_PAUSED) active = true
                        val sub = when (status) {
                            DownloadManager.STATUS_SUCCESSFUL -> "Done  ·  " + Formatter.formatShortFileSize(a, size)
                            DownloadManager.STATUS_FAILED -> "Failed  ·  tap to try again"
                            DownloadManager.STATUS_PAUSED -> when (reason) {
                                DownloadManager.PAUSED_QUEUED_FOR_WIFI -> "Waiting for Wi-Fi"
                                DownloadManager.PAUSED_WAITING_FOR_NETWORK -> "Waiting for a connection"
                                else -> "Paused, will continue by itself"
                            }
                            DownloadManager.STATUS_PENDING -> "Starting…"
                            else -> if (size > 0) "${(done * 100 / size).toInt()}%  ·  ${Formatter.formatShortFileSize(a, done)} of ${Formatter.formatShortFileSize(a, size)}"
                                    else Formatter.formatShortFileSize(a, done) + " so far"
                        }
                        rows.add(Row(
                            title = c.getString(iTitle) ?: "Download", subtitle = sub, iconRes = R.drawable.ic_download, trailingRes = R.drawable.ic_close,
                            onClick = {
                                when {
                                    ok -> try {
                                        a.startActivity(Intent(Intent.ACTION_VIEW).setDataAndType(dm.getUriForDownloadedFile(id), dm.getMimeTypeForDownloadedFile(id)).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION))
                                    } catch (e: Exception) { a.toast("No app can open this file") }
                                    status == DownloadManager.STATUS_FAILED && uri.startsWith("http") -> { dm.remove(id); a.retryDownload(uri) ; refresh() }
                                }
                            },
                            onLong = if (ok) ({
                                try {
                                    a.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType(dm.getMimeTypeForDownloadedFile(id) ?: "*/*")
                                        .putExtra(Intent.EXTRA_STREAM, dm.getUriForDownloadedFile(id)).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION), "Share file"))
                                } catch (e: Exception) { a.toast("Can't share this file") }
                            }) else null,
                            onTrailing = {
                                if (running || status == DownloadManager.STATUS_PAUSED) { dm.remove(id); refresh() }
                                else MaterialAlertDialogBuilder(a).setTitle("Delete this file?")
                                    .setMessage("It is removed from your phone, not only from this list.")
                                    .setPositiveButton("Delete") { _, _ -> dm.remove(id); refresh() }.setNegativeButton("Cancel", null).show()
                            },
                        ))
                    }
                }
                adapter.submit(rows.reversed())
                empty.visibility = if (rows.isEmpty()) View.VISIBLE else View.GONE
                // keep progress live while something is downloading and this screen is still showing
                if (active) body.postDelayed({ if (body.isAttachedToWindow) refresh() }, 900)
            }
            refresh()
            null
        }
    }

    // ---------- settings ----------
    fun showSettings() {
        openScreen("Settings", false, 0, null) { body ->
            val scroll = ScrollView(a)
            val col = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL; setPadding(a.dp(20), a.dp(8), a.dp(20), a.dp(32)) }
            scroll.addView(col)
            body.addView(scroll, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
            lateinit var build: () -> Unit
            fun section(title: String) = TextView(a).apply {
                text = title; textSize = 13f; setTypeface(null, android.graphics.Typeface.BOLD)
                setTextColor(a.color(R.color.dash_accent)); setPadding(0, a.dp(22), 0, a.dp(6))
            }
            fun valueRow(title: String, value: String, onClick: () -> Unit): View {
                val r = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL; setPadding(0, a.dp(12), 0, a.dp(12)); setOnClickListener { onClick() } }
                r.addView(TextView(a).apply { text = title; textSize = 16f; setTextColor(a.color(R.color.dash_text)) })
                if (value.isNotEmpty()) r.addView(TextView(a).apply { text = value; textSize = 13f; setTextColor(a.color(R.color.dash_dim)) })
                return r
            }
            fun choose(title: String, options: Array<String>, selected: Int, onPick: (Int) -> Unit) {
                MaterialAlertDialogBuilder(a).setTitle(title).setSingleChoiceItems(options, selected) { d, w -> d.dismiss(); onPick(w) }.show()
            }
            build = {
                col.removeAllViews()
                col.addView(section("General"))
                col.addView(valueRow("Search engine", a.store.searchEngine) {
                    val names = Omnibox.ENGINES.keys.toTypedArray()
                    choose("Search engine", names, names.indexOf(a.store.searchEngine)) { i -> a.store.searchEngine = names[i]; a.reloadHomeTabs(); build() }
                })
                col.addView(valueRow("Theme", a.store.theme.replaceFirstChar { it.uppercase() }) {
                    val opts = arrayOf("Dark", "Light", "System")
                    choose("Theme", opts, opts.indexOf(a.store.theme.replaceFirstChar { it.uppercase() })) { i -> a.store.theme = opts[i].lowercase(); a.applyTheme() }
                })
                col.addView(section("Privacy and security"))
                col.addView(switchRow("Block ads and trackers", "${a.store.blockedTotal} blocked so far", a.store.blockAds) { a.store.blockAds = it; a.refreshAdScripts() })
                col.addView(switchRow("Search suggestions", "Shows suggestions from ${a.store.searchEngine} as you type. Sends only what you type, never in Incognito.", a.store.searchSuggestions) { a.store.searchSuggestions = it })
                col.addView(switchRow("Hide cookie popups", "Hides common consent banners. Hiding is not the same as rejecting: the site then uses its default choice.", a.store.hideCookiePopups) { a.store.hideCookiePopups = it; a.refreshAdScripts() })
                col.addView(switchRow("Keep audio playing in the background", "Video and music (YouTube included) keep playing when you lock the screen or switch apps, with play/pause on the lock screen. Not used in Incognito.", a.store.backgroundAudio) { on ->
                    a.store.backgroundAudio = on; a.refreshAdScripts(); if (on) a.askNotificationPermission()
                })
                col.addView(switchRow("Always use HTTPS", "Upgrade http:// sites when possible", a.store.httpsUpgrade) { a.store.httpsUpgrade = it })
                col.addView(switchRow("Block third-party cookies", "Stops cookies from other sites following you. Some logins may need this off.", a.store.thirdPartyCookies.not()) {
                    a.store.thirdPartyCookies = !it; a.applySettingsToTabs()
                })
                col.addView(switchRow("Send Global Privacy Control", "Tells sites not to sell or share your data", a.store.sendGpc) { a.store.sendGpc = it })
                col.addView(switchRow("App lock", "Ask for fingerprint, face or screen lock", a.store.appLock) { on ->
                    if (on && !a.canLock()) { a.toast("Set a screen lock in Android settings first"); build() }
                    else { a.store.appLock = on; a.updateSecureFlag() }
                })
                col.addView(switchRow("Dark mode for web pages", "Darkens sites that don't have their own dark theme (needs a recent WebView)", a.store.webDark) { a.store.webDark = it; a.applySettingsToTabs() })
                col.addView(valueRow("Passwords", "${a.logins.vault.count()} saved on this phone") { showPasswords() })
                col.addView(switchRow("Offer to save passwords", "Asks after you sign in. Never in Incognito.", a.store.offerPasswords) { a.store.offerPasswords = it })
                col.addView(valueRow("Site settings", "Camera, microphone and location per site") { showSiteSettings() })
                col.addView(valueRow("Clear browsing data", "History, cookies, cache, bookmarks") { showClearData() })
                col.addView(section("Your data"))
                col.addView(valueRow("Import bookmarks", "From an HTML file exported by Chrome, Firefox or DASH") { a.importBookmarks() })
                col.addView(valueRow("Export bookmarks", "Save all bookmarks as an HTML file") { a.exportBookmarks() })
                col.addView(valueRow("Save encrypted backup", "Bookmarks, settings and site choices in one passphrase-protected file that desktop DASH can open too") { a.saveBackup() })
                col.addView(valueRow("Restore backup", "Merge a .dashbackup file made on this phone or on desktop") { a.restoreBackup() })
                col.addView(section("Accessibility"))
                col.addView(valueRow("Text size", "${a.store.textZoom}%") {
                    val sizes = intArrayOf(80, 90, 100, 115, 130, 150)
                    choose("Text size", sizes.map { "$it%" }.toTypedArray(), sizes.indexOf(a.store.textZoom)) { i -> a.store.textZoom = sizes[i]; a.applySettingsToTabs(); build() }
                })
                col.addView(section("About"))
                col.addView(valueRow("DASH for Android 0.1.0", "Privacy-first browser by Bibek Bista. No accounts, no analytics, everything stays on this phone.") {})
                col.addView(valueRow("Known limits", "Tap to read") {
                    MaterialAlertDialogBuilder(a).setTitle("Known limits")
                        .setMessage("• Ad blocking is host-based, so ads from a site's own domain (like YouTube video ads) are not blocked.\n• Camera, microphone and location work only on https sites you allow.\n• Google refuses sign-in in embedded browsers like this one.\n• No extensions or desktop sync yet.")
                        .setPositiveButton("OK", null).show()
                })
            }
            build()
            null
        }
    }

    // ---------- recently closed ----------
    fun showRecentlyClosed() {
        openScreen("Recently closed", false, R.drawable.ic_delete, { a.store.clearClosed(); showRecentlyClosed() }) { body ->
            val (adapter, empty) = listBody(body, "No recently closed tabs.\nTabs you close show up here.")
            val rows = a.store.closedTabs().map { (url, title) ->
                val host = Omnibox.hostOf(url)
                Row(
                    title = title.ifBlank { url }, subtitle = host, badgeHost = host, trailingRes = R.drawable.ic_close,
                    onClick = { a.store.removeClosed(url); closeScreen(); a.newTab(url) },
                    onTrailing = { a.store.removeClosed(url); showRecentlyClosed() },
                )
            }
            adapter.submit(rows)
            empty.visibility = if (rows.isEmpty()) View.VISIBLE else View.GONE
            null
        }
    }

    // ---------- bookmarks import / export ----------
    private fun showBookmarkOptions() {
        val items = arrayOf("Import bookmarks", "Export bookmarks")
        MaterialAlertDialogBuilder(a).setItems(items) { _, i -> if (i == 0) a.importBookmarks() else a.exportBookmarks() }.show()
    }

    // ---------- passwords ----------
    fun showPasswords() {
        openScreen("Passwords", true, R.drawable.ic_more, { showPasswordOptions() }) { body ->
            val (adapter, empty) = listBody(body, "No saved passwords.\nWhen you sign in to a site, DASH offers to save it here.")
            lateinit var refresh: (String) -> Unit
            refresh = { q ->
                val rows = a.logins.vault.all().filter { q.isBlank() || it.host.contains(q, true) || it.user.contains(q, true) }.map { l ->
                    Row(title = l.host, subtitle = l.user.ifBlank { "No username" }, badgeHost = l.host, trailingRes = R.drawable.ic_more,
                        onClick = { showLoginActions(l) { refresh(a.screenQuery.text.toString()) } },
                        onTrailing = { showLoginActions(l) { refresh(a.screenQuery.text.toString()) } })
                }
                adapter.submit(rows)
                empty.visibility = if (rows.isEmpty()) View.VISIBLE else View.GONE
            }
            refresh("")
            refresh
        }
    }

    private fun showLoginActions(l: Login, after: () -> Unit) {
        val items = arrayOf("Show password", "Copy password", "Copy username", "Open site", "Delete")
        MaterialAlertDialogBuilder(a).setTitle("${l.host}\n${l.user}").setItems(items) { _, i ->
            when (i) {
                0 -> a.logins.showPassword(l)
                1 -> a.logins.confirm("Copy password") { a.logins.copySecret("Password", l.pass) }
                2 -> a.logins.copySecret("Username", l.user, 30)
                3 -> { closeScreen(); a.newTab("https://${l.host}") }
                4 -> MaterialAlertDialogBuilder(a).setTitle("Delete this password?").setMessage("${l.user.ifBlank { l.host }} on ${l.host}")
                    .setPositiveButton("Delete") { _, _ -> a.logins.vault.delete(l.id); after() }.setNegativeButton("Cancel", null).show()
            }
        }.show()
    }

    private fun showPasswordOptions() {
        MaterialAlertDialogBuilder(a).setItems(arrayOf("Add password", "Delete all passwords")) { _, i ->
            if (i == 0) addPasswordDialog() else MaterialAlertDialogBuilder(a).setTitle("Delete all saved passwords?")
                .setMessage("${a.logins.vault.count()} passwords will be removed from this phone. This cannot be undone.")
                .setPositiveButton("Delete all") { _, _ -> a.logins.confirm("Delete all passwords") { a.logins.vault.deleteAll(); showPasswords() } }
                .setNegativeButton("Cancel", null).show()
        }.show()
    }

    private fun addPasswordDialog() {
        val col = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL; setPadding(a.dp(24), a.dp(8), a.dp(24), 0) }
        fun field(hint: String, type: Int) = android.widget.EditText(a).apply { this.hint = hint; inputType = type; setSingleLine() }
        val site = field("Website (example.com)", android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_URI)
        val user = field("Username or email", android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS)
        val pass = field("Password", android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD)
        col.addView(site); col.addView(user); col.addView(pass)
        val dlg = MaterialAlertDialogBuilder(a).setTitle("Add password").setView(col).setPositiveButton("Save", null).setNegativeButton("Cancel", null).create()
        dlg.setOnShowListener { dlg.getButton(android.content.DialogInterface.BUTTON_POSITIVE).setOnClickListener {
            val host = Omnibox.hostOf(Omnibox.resolve(site.text.toString(), "DuckDuckGo"))
            when {
                host.isBlank() || !Omnibox.looksLikeUrl(site.text.toString()) -> site.error = "Enter a website address"
                pass.text.isEmpty() -> pass.error = "Enter a password"
                else -> { a.logins.vault.add(host, user.text.toString().trim(), pass.text.toString()); dlg.dismiss(); showPasswords() }
            }
        } }
        dlg.show()
    }

    // ---------- site settings ----------
    private fun pickPermState(host: String, kind: String, after: () -> Unit) {
        val states = arrayOf("ask", "allow", "block")
        MaterialAlertDialogBuilder(a).setTitle("${SitePermissions.label(kind)} for $host")
            .setSingleChoiceItems(states.map { SitePermissions.stateLabel(it) }.toTypedArray(), states.indexOf(a.store.sitePerm(host, kind))) { d, w ->
                a.store.setSitePerm(host, kind, states[w]); d.dismiss(); after()
            }.show()
    }

    fun showSiteSettings() {
        openScreen("Site settings", false, 0, null) { body ->
            val (adapter, empty) = listBody(body, "No saved site choices yet.\nWhen a site asks to use your camera, microphone or location, your answer is kept here.")
            lateinit var refresh: () -> Unit
            refresh = {
                val rows = a.store.sitePermHosts().map { (host, perms) ->
                    Row(
                        title = host, badgeHost = host, trailingRes = R.drawable.ic_close,
                        subtitle = perms.entries.joinToString(" · ") { "${SitePermissions.label(it.key)} ${SitePermissions.stateLabel(it.value).lowercase()}" },
                        onClick = {
                            val kinds = SitePermissions.KINDS
                            MaterialAlertDialogBuilder(a).setTitle(host)
                                .setItems(kinds.map { "${SitePermissions.label(it)}: ${SitePermissions.stateLabel(a.store.sitePerm(host, it))}" }.toTypedArray()) { _, i ->
                                    pickPermState(host, kinds[i]) { refresh() }
                                }.show()
                        },
                        onTrailing = { a.store.resetSitePerms(host); refresh() },
                    )
                }
                adapter.submit(rows)
                empty.visibility = if (rows.isEmpty()) View.VISIBLE else View.GONE
            }
            refresh()
            null
        }
    }

    /** Asks for a passphrase. With confirm = true it must be typed twice and be at least 8 characters. */
    fun askBackupPassphrase(title: String, message: String, confirm: Boolean = false, onPass: (CharArray) -> Unit) {
        val col = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL; setPadding(a.dp(24), a.dp(8), a.dp(24), 0) }
        fun field(hint: String) = android.widget.EditText(a).apply {
            this.hint = hint; inputType = android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        val one = field("Passphrase"); col.addView(one)
        val two = field("Type it again"); if (confirm) col.addView(two)
        val dlg = MaterialAlertDialogBuilder(a).setTitle(title).setMessage(message).setView(col)
            .setPositiveButton("Continue", null).setNegativeButton("Cancel", null).create()
        dlg.setOnShowListener {
            dlg.getButton(android.content.DialogInterface.BUTTON_POSITIVE).setOnClickListener {
                val p = one.text.toString()
                when {
                    p.isEmpty() -> one.error = "Enter a passphrase"
                    confirm && p.length < 8 -> one.error = "Use at least 8 characters"
                    confirm && p != two.text.toString() -> two.error = "Doesn't match"
                    else -> { dlg.dismiss(); onPass(p.toCharArray()) }
                }
            }
        }
        dlg.show()
    }

    private fun showClearData() {
        val labels = arrayOf("Browsing history", "Cookies and site data", "Cached images and files", "Bookmarks")
        val checked = booleanArrayOf(true, true, true, false)
        MaterialAlertDialogBuilder(a).setTitle("Clear browsing data")
            .setMultiChoiceItems(labels, checked) { _, i, on -> checked[i] = on }
            .setPositiveButton("Clear") { _, _ ->
                if (checked[0]) { a.store.history.clear(); a.store.openTabs = emptyList(); a.store.clearClosed() }
                if (checked[1]) { CookieManager.getInstance().removeAllCookies(null); WebStorage.getInstance().deleteAllData() }
                if (checked[2]) a.tabs.forEach { it.webView.clearCache(true) }
                if (checked[3]) a.store.bookmarks.clear()
                a.store.flush(); a.reloadHomeTabs(); a.toast("Cleared")
            }
            .setNegativeButton("Cancel", null).show()
    }
}
