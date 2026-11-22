package com.bibekbista.dash

import android.annotation.SuppressLint
import android.view.MotionEvent
import android.app.DownloadManager
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.graphics.PorterDuff
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Bundle
import android.os.Environment
import android.text.Editable
import android.text.TextWatcher
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.inputmethod.EditorInfo
import android.view.inputmethod.InputMethodManager
import android.webkit.*
import android.widget.*
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.app.AppCompatDelegate
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.core.view.WindowCompat
import androidx.webkit.ProfileStore
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

class MainActivity : AppCompatActivity() {
    lateinit var store: Store
    private lateinit var screens: Screens

    private lateinit var toolbar: View
    private lateinit var pill: View
    private lateinit var homeBrand: View
    private lateinit var siteIcon: ImageView
    lateinit var address: EditText
    private lateinit var clearBtn: ImageView
    private lateinit var offlineBar: TextView
    private lateinit var micBtn: ImageView
    private lateinit var qrBtn: ImageView
    private var keepAudio = false
    private var suppressAddressWatcher = false
    private var suggestQuery = ""
    private var localRows: List<Row> = emptyList()
    private lateinit var reloadBtn: ImageView
    private lateinit var tabsCount: TextView
    private lateinit var progress: ProgressBar
    private lateinit var container: FrameLayout
    private lateinit var swipe: SwipeRefreshLayout
    private lateinit var suggestBox: View
    private lateinit var findBar: View
    private lateinit var findInput: EditText
    private lateinit var findCount: TextView
    private lateinit var switcher: View
    private lateinit var tabGrid: RecyclerView
    private lateinit var tabEmpty: TextView
    private lateinit var chipNormal: TextView
    private lateinit var chipPrivate: TextView
    lateinit var screenRoot: View
    lateinit var screenTitle: TextView
    lateinit var screenSearch: ImageView
    lateinit var screenAction: ImageView
    lateinit var screenQuery: EditText
    lateinit var screenBody: FrameLayout
    private lateinit var lockOverlay: View

    val tabs = mutableListOf<Tab>()
    var current: Tab? = null
    private var switcherPrivate = false
    private val suggestAdapter = RowAdapter()
    private lateinit var tabAdapter: TabCardAdapter
    private var customView: View? = null
    private var customCb: WebChromeClient.CustomViewCallback? = null
    private var chooserCb: ValueCallback<Array<Uri>>? = null
    private var unlocked = false
    private var authenticating = false
    private var intro: Intro? = null

    val sitePerms = SitePermissions(this)
    val logins = Logins(this)
    var identityCheck = false   // true while a fingerprint/screen-lock prompt for passwords is open, so it does not trigger the app lock

    private val exportLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("text/html")) { uri ->
        if (uri != null) try {
            contentResolver.openOutputStream(uri)?.use { it.write(store.exportBookmarksHtml().toByteArray(Charsets.UTF_8)) }
            toast("Exported ${store.bookmarks.size} bookmarks")
        } catch (e: Exception) { toast("Couldn't write the file") }
    }
    private val importLauncher = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) try {
            val text = contentResolver.openInputStream(uri)?.use { it.readBytes().take(20_000_000).toByteArray().toString(Charsets.UTF_8) } ?: ""
            val n = store.importBookmarksHtml(text)
            toast(if (n > 0) "Imported $n bookmarks" else "No new bookmarks found in that file")
            screens.showBookmarks()
        } catch (e: Exception) { toast("Couldn't read that file") }
    }
    // ---- encrypted backup (same .dashbackup file as the desktop app) ----
    private var backupPass: CharArray? = null
    private val backupSaveLauncher = registerForActivityResult(ActivityResultContracts.CreateDocument("application/octet-stream")) { uri ->
        val pass = backupPass; backupPass = null
        if (uri != null && pass != null) {
            toast("Saving backup...")
            Thread {
                try {
                    val enc = Backup.encrypt(store.backupJson(if (backupWithPasswords) logins.backupItems() else null), pass)
                    contentResolver.openOutputStream(uri)?.use { it.write(enc.toByteArray(Charsets.UTF_8)) }
                    runOnUiThread { toast("Backup saved. It opens in DASH on desktop too.") }
                } catch (e: Exception) { runOnUiThread { toast("Couldn't save the backup") } }
            }.start()
        }
    }
    private val backupOpenLauncher = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) try {
            val text = contentResolver.openInputStream(uri)?.use { it.readBytes().take(64_000_000).toByteArray().toString(Charsets.UTF_8) } ?: ""
            screens.askBackupPassphrase("Restore backup", "Enter the passphrase you used when saving it.") { pass ->
                toast("Opening backup...")
                Thread {
                    val json = try { Backup.decrypt(text, pass) } catch (e: Backup.BackupException) { runOnUiThread { toast(e.message ?: "Couldn't open the backup") }; null } catch (e: Exception) { runOnUiThread { toast("That backup couldn't be read") }; null }
                    if (json != null) runOnUiThread {
                        val result = try { store.restoreBackup(json) } catch (e: Exception) { toast("That backup couldn't be read"); return@runOnUiThread }
                        reloadHomeTabs(); applyTheme()
                        val extra = buildString {
                            if (result.skippedPasswords > 0) append(" ${logins.importFrom(json)} of ${result.skippedPasswords} saved passwords imported (https sites only).")
                            if (result.skippedOther) append(" Notes, shortcuts and page zoom are desktop-only.")
                        }
                        com.google.android.material.dialog.MaterialAlertDialogBuilder(this).setTitle("Backup restored")
                            .setMessage("${result.bookmarks} new bookmarks, ${result.settings} settings and ${result.permissions} site choices applied.$extra")
                            .setPositiveButton("OK", null).show()
                    }
                }.start()
            }
        } catch (e: Exception) { toast("Couldn't read that file") }
    }
    private var backupWithPasswords = false
    fun saveBackup() {
        val n = logins.vault.count()
        if (n == 0) { backupWithPasswords = false; askBackupPassphraseAndSave(); return }
        com.google.android.material.dialog.MaterialAlertDialogBuilder(this).setTitle("Include saved passwords?")
            .setMessage("$n saved passwords can go into the backup. They are protected by your passphrase. Anyone with the file and the passphrase can read them.")
            .setPositiveButton("Include") { _, _ -> backupWithPasswords = true; askBackupPassphraseAndSave() }
            .setNegativeButton("Leave out") { _, _ -> backupWithPasswords = false; askBackupPassphraseAndSave() }.show()
    }
    private fun askBackupPassphraseAndSave() = screens.askBackupPassphrase("Save encrypted backup", "Choose a passphrase. There is no way to recover it if you forget it.", confirm = true) { pass ->
        backupPass = pass; backupSaveLauncher.launch("dash-backup-${java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US).format(java.util.Date())}.dashbackup")
    }
    fun restoreBackup() = backupOpenLauncher.launch(arrayOf("*/*"))
    fun exportBookmarks() = exportLauncher.launch("dash-bookmarks.html")
    fun importBookmarks() = importLauncher.launch(arrayOf("*/*"))

    private val chooser = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        chooserCb?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(r.resultCode, r.data))
        chooserCb = null
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        store = Store(this)
        applyTheme()
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        toolbar = findViewById(R.id.toolbar); pill = findViewById(R.id.pill); homeBrand = findViewById(R.id.homeBrand)
        siteIcon = findViewById(R.id.siteIcon); address = findViewById(R.id.address)
        clearBtn = findViewById(R.id.clearBtn); reloadBtn = findViewById(R.id.reloadBtn)
        tabsCount = findViewById(R.id.tabsCount); progress = findViewById(R.id.progress); offlineBar = findViewById(R.id.offlineBar); micBtn = findViewById(R.id.micBtn); qrBtn = findViewById(R.id.qrBtn)
        container = findViewById(R.id.container); swipe = findViewById(R.id.swipe)
        suggestBox = findViewById(R.id.suggestBox); findBar = findViewById(R.id.findBar)
        findInput = findViewById(R.id.findInput); findCount = findViewById(R.id.findCount)
        switcher = findViewById(R.id.switcher); tabGrid = findViewById(R.id.tabGrid); tabEmpty = findViewById(R.id.tabEmpty)
        chipNormal = findViewById(R.id.chipNormal); chipPrivate = findViewById(R.id.chipPrivate)
        screenRoot = findViewById(R.id.screen); screenTitle = findViewById(R.id.screenTitle)
        screenSearch = findViewById(R.id.screenSearch); screenAction = findViewById(R.id.screenAction)
        screenQuery = findViewById(R.id.screenQuery); screenBody = findViewById(R.id.screenBody)
        lockOverlay = findViewById(R.id.lockOverlay)
        screens = Screens(this)
        deletePrivateProfile() // anything an earlier Incognito session left behind
        window.navigationBarColor = color(R.color.dash_bg)
        applyBars()

        setupAddressBar()
        setupTabSwipe()
        listOf<View>(findViewById(R.id.tabsBtn), findViewById(R.id.menuBtn), reloadBtn).forEach { it.pressable() }
        setupFindBar()
        setupSwitcher()

        findViewById<View>(R.id.menuBtn).setOnClickListener { screens.showMenu(it) }
        findViewById<View>(R.id.tabsBtn).setOnClickListener { showSwitcher() }
        findViewById<View>(R.id.btnUnlock).setOnClickListener { authenticate() }
        siteIcon.setOnClickListener { if (!address.hasFocus()) screens.showSiteInfo() }
        reloadBtn.setOnClickListener {
            val t = current ?: return@setOnClickListener
            if (t.loading) t.webView.stopLoading() else if (t.url.isEmpty()) openHome(t) else t.webView.reload()
        }
        swipe.setColorSchemeColors(color(R.color.dash_accent))
        swipe.setProgressBackgroundColorSchemeColor(color(R.color.dash_surface))
        swipe.setOnRefreshListener { current?.let { t -> if (t.url.isNotEmpty()) t.webView.reload() }; swipe.isRefreshing = false }
        swipe.setOnChildScrollUpCallback { _, _ -> (current?.webView?.scrollY ?: 0) > 0 }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val t = current
                when {
                    intro?.showing() == true -> { if (!intro!!.back()) moveTaskToBack(true) }
                    customView != null -> hideCustomView()
                    screens.backFromScreen() -> Unit
                    switcher.visibility == View.VISIBLE -> hideSwitcher()
                    findBar.visibility == View.VISIBLE -> closeFind()
                    address.hasFocus() -> address.clearFocus()
                    t != null && t.webView.canGoBack() -> t.webView.goBack()
                    t != null && tabs.size > 1 -> closeTab(t)
                    else -> finish()
                }
            }
        })

        PlaybackService.onStop = { runOnUiThread { (current?.webView as? DashWebView)?.keepAlive = false; current?.webView?.evaluateJavascript("document.querySelectorAll('video,audio').forEach(function(x){x.pause()})", null); current?.webView?.onPause(); keepAudio = false } }
        restoreTabs()
        handleIntent(intent)
        if (!store.introDone) {
            val i = Intro(this, findViewById<ViewGroup>(android.R.id.content)) { themeChanged -> intro = null; reloadHomeTabs(); if (themeChanged) applyTheme(); askNotificationPermission() }
            intro = i; i.start()
        }
        if (store.appLock) { unlocked = false; lockOverlay.visibility = View.VISIBLE }
        updateSecureFlag()
    }

    override fun onDestroy() {
        PlaybackService.onStop = null; PlaybackService.onToggle = null
        super.onDestroy()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    /** Links, shared text and "Search with DASH" from other apps each open in a new tab. */
    private fun handleIntent(intent: Intent?) {
        if (intent == null) return
        when (intent.action) {
            Intent.ACTION_VIEW -> intent.data?.let { if (it.scheme == "http" || it.scheme == "https") newTab(it.toString()) }
            Intent.ACTION_SEND -> openSharedText(intent.getStringExtra(Intent.EXTRA_TEXT))
            Intent.ACTION_PROCESS_TEXT -> openSharedText(intent.getCharSequenceExtra(Intent.EXTRA_PROCESS_TEXT)?.toString(), searchOnly = true)
            Intent.ACTION_WEB_SEARCH -> openSharedText(intent.getStringExtra(android.app.SearchManager.QUERY), searchOnly = true)
        }
        setIntent(Intent())   // handled: a rotation or theme change must not open it again
    }

    private fun openSharedText(text: String?, searchOnly: Boolean = false) {
        val t = text?.trim().orEmpty()
        if (t.isEmpty()) return
        if (!searchOnly) {
            // a shared page usually comes as "Title https://site/page": open the link inside it
            val m = android.util.Patterns.WEB_URL.matcher(t)
            if (m.find()) { newTab(Omnibox.resolve(m.group(), store.searchEngine)); return }
        }
        newTab(Omnibox.resolve(t.take(300), store.searchEngine))
    }

    // ---------- theme, lock, secure flag ----------
    fun applyTheme() {
        AppCompatDelegate.setDefaultNightMode(
            when (store.theme) { "light" -> AppCompatDelegate.MODE_NIGHT_NO; "system" -> AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM; else -> AppCompatDelegate.MODE_NIGHT_YES }
        )
    }

    private val logoUri: String by lazy {
        "data:image/png;base64," + android.util.Base64.encodeToString(resources.openRawResource(R.raw.logo_tile).readBytes(), android.util.Base64.NO_WRAP)
    }

    /** Status and navigation bar icons follow the theme, so they stay readable in light and dark. */
    private fun applyBars() {
        val c = WindowCompat.getInsetsController(window, window.decorView)
        c.isAppearanceLightStatusBars = !isDark()
        c.isAppearanceLightNavigationBars = !isDark()
    }

    fun isDark() = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    override fun onStop() {
        super.onStop()
        saveTabs(); store.flush()
        Suggest.cancel()
        try { getSystemService(ConnectivityManager::class.java)?.unregisterNetworkCallback(netCallback) } catch (e: Exception) { /* was not registered */ }
        tabs.forEach { if (!(keepAudio && it === current)) it.webView.onPause() }
        if (store.appLock && !identityCheck) { unlocked = false; lockOverlay.visibility = View.VISIBLE }
    }

    private val netCallback = object : ConnectivityManager.NetworkCallback() {
        override fun onAvailable(network: Network) {
            window.decorView.postDelayed({ updateOffline(); if (Net.isOnline(this@MainActivity)) retryFailedTabs() }, 700)
        }
        override fun onLost(network: Network) { runOnUiThread { updateOffline() } }
        override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) { runOnUiThread { updateOffline() } }
    }

    /** Offline, pages you visited before open from the saved copy instead of failing. Incognito never uses saved copies. */
    private fun applyCacheMode() {
        val off = !Net.isOnline(this)
        tabs.forEach { it.webView.settings.cacheMode = if (it.isPrivate) WebSettings.LOAD_NO_CACHE else if (off) WebSettings.LOAD_CACHE_ELSE_NETWORK else WebSettings.LOAD_DEFAULT }
    }

    private fun updateOffline() {
        val off = !Net.isOnline(this)
        applyCacheMode()
        if (off && offlineBar.visibility != View.VISIBLE) { offlineBar.alpha = 0f; offlineBar.visibility = View.VISIBLE; offlineBar.animate().alpha(1f).setDuration(200).start() }
        else if (!off && offlineBar.visibility == View.VISIBLE) offlineBar.animate().alpha(0f).setDuration(200).withEndAction { offlineBar.visibility = View.GONE }.start()
    }

    /** When the connection comes back, every tab that was showing a "can't load" page tries again by itself. */
    private fun retryFailedTabs() {
        tabs.filter { it.errorUrl != null }.toList().forEach { t -> t.errorUrl?.let { load(t, it) } }
    }

    override fun onPause() {
        armBackgroundAudio()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        disarmBackgroundAudio()
    }

    /**
     * Called whenever DASH loses the screen (lock button, home, another app). If the current tab is playing sound,
     * the page keeps "visible", a foreground service keeps the process alive and a media notification appears.
     */
    private fun armBackgroundAudio() {
        val t = current ?: return
        if (keepAudio || isChangingConfigurations || !store.backgroundAudio || t.isPrivate) return
        val audio = getSystemService(android.media.AudioManager::class.java)
        if (audio?.isMusicActive != true) return
        (t.webView as? DashWebView)?.keepAlive = true
        PlaybackService.title = t.title
        PlaybackService.playing = true
        PlaybackService.onToggle = { runOnUiThread { toggleMedia() } }
        try { startForegroundService(Intent(this, PlaybackService::class.java)); keepAudio = true } catch (e: Exception) { keepAudio = false; (t.webView as? DashWebView)?.keepAlive = false }
    }

    private fun disarmBackgroundAudio() {
        if (!keepAudio) return
        keepAudio = false
        tabs.forEach { (it.webView as? DashWebView)?.keepAlive = false }
        try { stopService(Intent(this, PlaybackService::class.java)) } catch (e: Exception) { /* not running */ }
    }

    /** Play/pause from the notification or the lock screen: toggles every media element on the current page. */
    private fun toggleMedia() {
        val wv = current?.webView ?: return
        wv.evaluateJavascript("(function(){var m=[].slice.call(document.querySelectorAll('video,audio'));var any=m.some(function(x){return !x.paused});m.forEach(function(x){if(any){x.pause()}else{var p=x.play();if(p&&p.catch)p.catch(function(){})}});return !any})()") { r ->
            PlaybackService.update(isPlaying = r == "true")
        }
    }

    override fun onStart() {
        super.onStart()
        try { getSystemService(ConnectivityManager::class.java)?.registerDefaultNetworkCallback(netCallback) } catch (e: Exception) { /* offline detection is a bonus */ }
        updateOffline()
        if (keepAudio) { stopService(Intent(this, PlaybackService::class.java)); keepAudio = false }
        current?.webView?.onResume()
        if (store.appLock && !unlocked) { lockOverlay.visibility = View.VISIBLE; authenticate() } else lockOverlay.visibility = View.GONE
    }

    val authenticators = BIOMETRIC_WEAK or DEVICE_CREDENTIAL

    fun canLock(): Boolean = BiometricManager.from(this).canAuthenticate(authenticators) == BiometricManager.BIOMETRIC_SUCCESS

    private fun authenticate() {
        if (authenticating) return
        if (!canLock()) {
            store.appLock = false; unlocked = true; lockOverlay.visibility = View.GONE
            toast("App lock turned off: set a screen lock in Android settings first.")
            return
        }
        authenticating = true
        val info = BiometricPrompt.PromptInfo.Builder().setTitle("Unlock DASH").setAllowedAuthenticators(authenticators).build()
        BiometricPrompt(this, ContextCompat.getMainExecutor(this), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                authenticating = false; unlocked = true; lockOverlay.visibility = View.GONE
            }
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) { authenticating = false }
        }).authenticate(info)
    }

    /** Private tabs and app lock keep the page out of screenshots and the app switcher. */
    fun updateSecureFlag() {
        if (current?.isPrivate == true || store.appLock) window.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)
        else window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }

    fun toast(msg: String) = Toast.makeText(this, msg, Toast.LENGTH_SHORT).show()

    // ---------- address bar ----------
    private fun setupAddressBar() {
        address.setOnEditorActionListener { _, id, _ ->
            if (id == EditorInfo.IME_ACTION_GO || id == EditorInfo.IME_ACTION_DONE || id == EditorInfo.IME_ACTION_SEARCH) { go(address.text.toString()); true } else false
        }
        address.setOnKeyListener { _, code, ev ->   // hardware keyboards
            if (code == KeyEvent.KEYCODE_ENTER && ev.action == KeyEvent.ACTION_UP) { go(address.text.toString()); true } else code == KeyEvent.KEYCODE_ENTER
        }
        address.setOnFocusChangeListener { _, focused ->
            if (focused) {
                suggestBox.visibility = View.VISIBLE
                pill.setBackgroundResource(R.drawable.bg_address_focus)
                suppressAddressWatcher = true
                address.setText(current?.url ?: ""); address.selectAll()
                suppressAddressWatcher = false
                refreshSuggestions("")
            } else {
                Suggest.cancel()
                suggestBox.visibility = View.GONE
                pill.setBackgroundResource(R.drawable.bg_address)
                refreshChrome()
            }
            updateAddressButtons()
        }
        address.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, st: Int, c: Int, a: Int) {}
            override fun onTextChanged(s: CharSequence?, st: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) {
                if (address.hasFocus() && !suppressAddressWatcher) { refreshSuggestions(s?.toString() ?: ""); updateAddressButtons() }
            }
        })
        clearBtn.setOnClickListener { address.setText(""); address.requestFocus() }
        micBtn.setOnClickListener { voiceSearch() }
        qrBtn.setOnClickListener { scanQr() }
        val rv = findViewById<RecyclerView>(R.id.suggestList)
        rv.layoutManager = LinearLayoutManager(this)
        rv.adapter = suggestAdapter
        rv.addOnScrollListener(object : RecyclerView.OnScrollListener() {   // scrolling the list puts the keyboard away
            override fun onScrollStateChanged(r: RecyclerView, state: Int) { if (state == RecyclerView.SCROLL_STATE_DRAGGING) hideKeyboard() }
        })
    }

    private fun updateAddressButtons() {
        val focused = address.hasFocus()
        clearBtn.visibility = if (focused && address.text.isNotEmpty()) View.VISIBLE else View.GONE
        micBtn.visibility = if (focused && address.text.isEmpty()) View.VISIBLE else View.GONE
        qrBtn.visibility = if (focused && address.text.isEmpty()) View.VISIBLE else View.GONE
        reloadBtn.visibility = if (focused || current?.url.isNullOrEmpty()) View.GONE else View.VISIBLE
    }

    /** Rows: what you typed (go / search), then matches from this phone, then the search engine's own suggestions. */
    private fun refreshSuggestions(query: String) {
        val q = query.trim()
        suggestQuery = q
        val rows = mutableListOf<Row>()
        if (q.isNotEmpty()) {
            val isUrl = Omnibox.looksLikeUrl(q)
            rows.add(Row(
                title = q, subtitle = if (isUrl) "Go to this address" else "Search ${store.searchEngine}",
                iconRes = if (isUrl) R.drawable.ic_open else R.drawable.ic_search, onClick = { go(q) },
            ))
        }
        store.suggest(q, if (q.isEmpty()) 8 else 4).forEach { e ->
            val bookmarked = store.isBookmarked(e.url)
            rows.add(Row(
                title = e.title, subtitle = Omnibox.hostOf(e.url), iconRes = if (bookmarked) R.drawable.ic_bookmark else R.drawable.ic_history,
                trailingRes = R.drawable.ic_arrow_up_left, onClick = { go(e.url) },
                onTrailing = { address.setText(e.url); address.setSelection(address.text.length) },
            ))
        }
        localRows = rows
        suggestAdapter.submit(rows)
        val priv = current?.isPrivate == true
        if (q.isEmpty() || priv || !store.searchSuggestions || Omnibox.looksLikeUrl(q) || !Net.isOnline(this)) { Suggest.cancel(); return }
        Suggest.request(store.searchEngine, q) { online ->
            if (!address.hasFocus() || suggestQuery != q) return@request
            val shown = rows.map { it.title.lowercase() }.toSet()
            val extra = online.filter { it.lowercase() !in shown && it.lowercase() != q.lowercase() }.take(5).map { s ->
                Row(title = s, iconRes = R.drawable.ic_search, trailingRes = R.drawable.ic_arrow_up_left,
                    onClick = { goSearch(s) },
                    onTrailing = { address.setText(s); address.setSelection(address.text.length) })
            }
            if (extra.isNotEmpty()) suggestAdapter.submit(localRows + extra)
        }
    }

    private fun go(input: String) {
        val t = current ?: return
        val url = Omnibox.resolve(input, store.searchEngine)
        if (url.isEmpty()) return
        Suggest.cancel(); hideKeyboard(); address.clearFocus()
        load(t, url)
    }

    private fun goSearch(text: String) {
        val t = current ?: return
        Suggest.cancel(); hideKeyboard(); address.clearFocus()
        load(t, Omnibox.searchUrl(text, store.searchEngine))
    }

    /** Opens the address bar with suggestions (used by the home page search box). */
    fun focusAddress() {
        pill.visibility = View.VISIBLE; homeBrand.visibility = View.GONE
        address.requestFocus()
        (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showSoftInput(address, 0)
    }

    fun hideKeyboard() {
        (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).hideSoftInputFromWindow(address.windowToken, 0)
    }

    /** Updates the toolbar to match the current tab. */
    fun refreshChrome() {
        val t = current ?: return
        val priv = t.isPrivate
        toolbar.setBackgroundColor(color(if (priv) R.color.dash_private_bg else R.color.dash_surface))
        window.statusBarColor = color(if (priv) R.color.dash_private_bg else R.color.dash_surface)
        tabsCount.text = tabs.size.toString()
        (tabsCount.background.mutate() as GradientDrawable).apply { setColor(Color.TRANSPARENT); setStroke(dp(2), color(if (priv) R.color.dash_private else R.color.dash_text)) }
        tabsCount.setTextColor(color(if (priv) R.color.dash_private else R.color.dash_text))
        if (!address.hasFocus()) {
            val q = Omnibox.searchQuery(t.url)
            address.setText(if (t.url.isEmpty()) "" else q ?: Omnibox.hostOf(t.url))
            address.hint = if (priv) "Incognito tab" else "Search or type URL"
            address.setTextColor(color(if (priv) R.color.dash_private else R.color.dash_text))
            val (icon, tint) = when {
                q != null -> R.drawable.ic_search to R.color.dash_dim
                t.url.startsWith("https://") -> R.drawable.ic_lock to R.color.dash_text
                t.url.startsWith("http://") -> R.drawable.ic_warning to R.color.dash_danger
                priv -> R.drawable.ic_incognito to R.color.dash_private
                else -> R.drawable.ic_search to R.color.dash_dim
            }
            siteIcon.setImageResource(icon); siteIcon.setColorFilter(color(tint), PorterDuff.Mode.SRC_IN)
        } else {
            siteIcon.setImageResource(R.drawable.ic_search); siteIcon.setColorFilter(color(R.color.dash_dim), PorterDuff.Mode.SRC_IN)
        }
        reloadBtn.setImageResource(if (t.loading) R.drawable.ic_close else R.drawable.ic_refresh)
        reloadBtn.setColorFilter(color(R.color.dash_text), PorterDuff.Mode.SRC_IN)
        clearBtn.setColorFilter(color(R.color.dash_dim), PorterDuff.Mode.SRC_IN)
        findViewById<ImageView>(R.id.menuBtn).setColorFilter(color(R.color.dash_text), PorterDuff.Mode.SRC_IN)
        swipe.isEnabled = t.url.isNotEmpty()
        val home = t.url.isEmpty() && !address.hasFocus()   // like Chrome: no address pill on the home page, the search box is the address bar
        pill.visibility = if (home) View.GONE else View.VISIBLE
        homeBrand.visibility = if (home) View.VISIBLE else View.GONE
        applyBars()
        updateAddressButtons()
    }

    // ---------- find in page ----------
    private fun setupFindBar() {
        findInput.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, st: Int, c: Int, a: Int) {}
            override fun onTextChanged(s: CharSequence?, st: Int, b: Int, c: Int) {}
            override fun afterTextChanged(s: Editable?) {
                val q = s?.toString() ?: ""
                if (q.isEmpty()) { current?.webView?.clearMatches(); findCount.text = "" } else current?.webView?.findAllAsync(q)
            }
        })
        findViewById<View>(R.id.findNext).setOnClickListener { current?.webView?.findNext(true) }
        findViewById<View>(R.id.findPrev).setOnClickListener { current?.webView?.findNext(false) }
        findViewById<View>(R.id.findClose).setOnClickListener { closeFind() }
        listOf(R.id.findNext, R.id.findPrev, R.id.findClose).forEach { findViewById<ImageView>(it).setColorFilter(color(R.color.dash_text), PorterDuff.Mode.SRC_IN) }
    }

    fun openFind() {
        val t = current ?: return
        if (t.url.isEmpty()) { toast("Open a page first"); return }
        t.webView.setFindListener { active, total, done ->
            if (done) findCount.text = if (findInput.text.isEmpty()) "" else if (total == 0) "0/0" else "${active + 1}/$total"
        }
        findBar.visibility = View.VISIBLE
        findInput.requestFocus()
        (getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager).showSoftInput(findInput, 0)
    }

    private fun closeFind() {
        current?.webView?.clearMatches()
        findInput.setText(""); findCount.text = ""
        findBar.visibility = View.GONE
        hideKeyboard()
    }

    // ---------- tabs ----------
    private fun restoreTabs() {
        val saved = store.openTabs
        if (saved.isEmpty()) { newTab(null); return }
        saved.forEach { newTab(it.ifEmpty { null }, select = false) }
        select(tabs[store.activeTab.coerceIn(0, tabs.size - 1)])
    }

    private fun saveTabs() {
        val normal = tabs.filter { !it.isPrivate }
        store.openTabs = normal.map { it.url }
        store.activeTab = normal.indexOf(current).coerceAtLeast(0)
    }

    fun newTab(url: String?, isPrivate: Boolean = false, select: Boolean = true): Tab {
        val wv = createWebView(isPrivate)
        val tab = Tab(wv, isPrivate)
        wv.tag = tab
        tabs.add(tab)
        installAdScript(tab)
        if (select) select(tab)
        if (url.isNullOrEmpty()) openHome(tab) else load(tab, url)
        refreshChrome()
        return tab
    }

    fun select(tab: Tab) {
        captureThumb(current)
        closeFindQuiet()
        current = tab
        container.removeAllViews()
        (tab.webView.parent as? ViewGroup)?.removeView(tab.webView)
        container.addView(tab.webView, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        tab.webView.onResume()
        container.alpha = 0f; container.animate().alpha(1f).setDuration(160).start()
        progress.visibility = if (tab.loading) View.VISIBLE else View.INVISIBLE
        updateSecureFlag()
        refreshChrome()
    }

    private fun closeFindQuiet() { if (findBar.visibility == View.VISIBLE) { findBar.visibility = View.GONE; findInput.setText("") } }

    fun closeTab(tab: Tab) {
        val idx = tabs.indexOf(tab)
        tabs.remove(tab)
        if (!tab.isPrivate && tab.url.startsWith("http")) store.pushClosed(tab.url, tab.title)
        container.removeView(tab.webView)
        tab.webView.destroy()
        if (tab.isPrivate && tabs.none { it.isPrivate }) deletePrivateProfile()
        if (tabs.isEmpty()) { finish(); return }  // closing the last tab closes DASH, like on desktop
        if (current === tab) {
            val same = tabs.filter { it.isPrivate == tab.isPrivate }
            select(same.lastOrNull() ?: tabs[(idx - 1).coerceAtLeast(0)])
        }
        refreshChrome()
    }

    fun load(tab: Tab, url: String) {
        val target = if (store.httpsUpgrade && url.startsWith("http://") && !isLocalHost(url)) "https://" + url.removePrefix("http://") else url
        tab.url = target; tab.blocked = 0; tab.errorUrl = null; tab.reader = false
        if (!tab.isPrivate) tab.webView.settings.cacheMode = if (Net.isOnline(this)) WebSettings.LOAD_DEFAULT else WebSettings.LOAD_CACHE_ELSE_NETWORK
        if (store.sendGpc) tab.webView.loadUrl(target, mapOf("Sec-GPC" to "1")) else tab.webView.loadUrl(target)
        if (tab === current) refreshChrome()
    }

    fun openUrlInCurrent(url: String) { current?.let { load(it, url) } }

    fun isLocalHost(url: String): Boolean {
        val h = Uri.parse(url).host ?: return false
        return h == "localhost" || h.endsWith(".local") || Regex("^(10|127|192\\.168|172\\.(1[6-9]|2\\d|3[01]))\\..*").containsMatchIn(h)
    }

    fun openHome(tab: Tab) {
        tab.url = ""; tab.title = ""; tab.blocked = 0
        tab.webView.loadDataWithBaseURL("https://dash.invalid/", NewTabPage.html(store, isDark(), tab.isPrivate, logoUri), "text/html", "utf-8", null)
        if (tab === current) refreshChrome()
    }

    fun reloadHomeTabs() { tabs.filter { it.url.isEmpty() }.forEach { openHome(it) } }

    private fun captureThumb(tab: Tab?) {
        if (tab == null || tab.isPrivate || tab.webView.width == 0 || tab.webView.height == 0) return
        try {
            val w = tab.webView.width / 3; val h = tab.webView.height / 3
            val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
            val c = Canvas(bmp); c.scale(1f / 3f, 1f / 3f)
            tab.webView.draw(c)
            tab.thumb = bmp
        } catch (e: Exception) { /* no preview for this tab */ }
    }

    // ---------- tab switcher ----------
    private fun setupSwitcher() {
        tabAdapter = TabCardAdapter(
            onSelect = { t -> select(t); hideSwitcher() },
            onClose = { t -> closeWithUndo(t) },
        )
        tabGrid.layoutManager = GridLayoutManager(this, 2)
        tabGrid.adapter = tabAdapter
        // swipe a tab card sideways to close it
        androidx.recyclerview.widget.ItemTouchHelper(object : androidx.recyclerview.widget.ItemTouchHelper.SimpleCallback(0, androidx.recyclerview.widget.ItemTouchHelper.LEFT or androidx.recyclerview.widget.ItemTouchHelper.RIGHT) {
            override fun onMove(rv: RecyclerView, vh: RecyclerView.ViewHolder, target: RecyclerView.ViewHolder) = false
            override fun onSwiped(vh: RecyclerView.ViewHolder, dir: Int) {
                val t = tabAdapter.tabAt(vh.bindingAdapterPosition)
                if (t == null) { tabAdapter.notifyDataSetChanged(); return }
                closeWithUndo(t)
            }
            override fun onChildDraw(c: android.graphics.Canvas, rv: RecyclerView, vh: RecyclerView.ViewHolder, dX: Float, dY: Float, state: Int, active: Boolean) {
                super.onChildDraw(c, rv, vh, dX, dY, state, active)
                vh.itemView.alpha = 1f - (kotlin.math.abs(dX) / vh.itemView.width).coerceIn(0f, 1f) * 0.7f
            }
            override fun clearView(rv: RecyclerView, vh: RecyclerView.ViewHolder) { super.clearView(rv, vh); vh.itemView.alpha = 1f }
        }).attachToRecyclerView(tabGrid)
        chipNormal.setOnClickListener { switcherPrivate = false; refreshSwitcher() }
        chipPrivate.setOnClickListener { switcherPrivate = true; refreshSwitcher() }
        findViewById<View>(R.id.switcherDone).setOnClickListener { hideSwitcher() }
        findViewById<View>(R.id.switcherNew).setOnClickListener { newTab(null, isPrivate = switcherPrivate); hideSwitcher() }
        findViewById<View>(R.id.switcherMore).setOnClickListener { v ->
            val pm = PopupMenu(this, v)
            pm.menu.add(0, 1, 0, "Close all tabs in this list")
            pm.setOnMenuItemClickListener {
                tabs.filter { t -> t.isPrivate == switcherPrivate }.toList().forEach { t -> if (!isFinishing) closeTab(t) }
                if (!isFinishing) refreshSwitcher()
                true
            }
            pm.show()
        }
        findViewById<ImageView>(R.id.switcherMore).setColorFilter(color(R.color.dash_text), PorterDuff.Mode.SRC_IN)
    }

    /** Closes a tab and offers to bring it back. Incognito tabs are never remembered, so they have no Undo. */
    private fun closeWithUndo(t: Tab) {
        val url = t.url; val title = t.title; val canUndo = !t.isPrivate && url.startsWith("http")
        val wasLast = tabs.size == 1
        closeTab(t)
        if (isFinishing) return
        refreshSwitcher()
        window.decorView.tick()
        if (canUndo && !wasLast) {
            val bar = com.google.android.material.snackbar.Snackbar.make(findViewById(android.R.id.content), "Tab closed", com.google.android.material.snackbar.Snackbar.LENGTH_LONG)
            bar.setAction("Undo") { newTab(url, select = false).also { it.title = title }; refreshSwitcher() }
            bar.show()
        }
    }

    /** Swiping the address bar sideways moves to the previous or next tab. */
    @SuppressLint("ClickableViewAccessibility")
    private fun setupTabSwipe() {
        val gd = android.view.GestureDetector(this, object : android.view.GestureDetector.SimpleOnGestureListener() {
            override fun onFling(e1: MotionEvent?, e2: MotionEvent, vx: Float, vy: Float): Boolean {
                if (e1 == null || address.hasFocus()) return false
                val dx = e2.x - e1.x
                if (kotlin.math.abs(dx) < dp(80) || kotlin.math.abs(vx) < kotlin.math.abs(vy) * 2) return false
                val same = tabs.filter { it.isPrivate == current?.isPrivate }
                val i = same.indexOf(current)
                val to = same.getOrNull(if (dx < 0) i + 1 else i - 1) ?: return false
                address.tick(); select(to)
                return true
            }
        })
        address.setOnTouchListener { _, e -> gd.onTouchEvent(e) && e.actionMasked == MotionEvent.ACTION_UP }
    }

    private fun showSwitcher() {
        hideKeyboard(); address.clearFocus()
        captureThumb(current)
        switcherPrivate = current?.isPrivate == true
        refreshSwitcher()
        switcher.alpha = 0f; switcher.scaleX = 0.96f; switcher.scaleY = 0.96f; switcher.visibility = View.VISIBLE
        switcher.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(220).start()
        tabGrid.layoutAnimation = android.view.animation.AnimationUtils.loadLayoutAnimation(this, R.anim.layout_cards)
        tabGrid.scheduleLayoutAnimation()
    }

    private fun hideSwitcher() {
        switcher.animate().alpha(0f).setDuration(120).withEndAction { switcher.visibility = View.GONE }.start()
    }

    private fun refreshSwitcher() {
        val list = tabs.filter { it.isPrivate == switcherPrivate }
        val nNormal = tabs.count { !it.isPrivate }; val nPrivate = tabs.count { it.isPrivate }
        chipNormal.text = "Tabs  $nNormal"; chipPrivate.text = "Incognito  $nPrivate"
        chipNormal.setBackgroundResource(if (!switcherPrivate) R.drawable.bg_chip_sel else R.drawable.bg_chip)
        chipPrivate.setBackgroundResource(if (switcherPrivate) R.drawable.bg_chip_private else R.drawable.bg_chip)
        tabAdapter.submit(list, current)
        tabEmpty.visibility = if (list.isEmpty()) View.VISIBLE else View.GONE
        tabEmpty.text = if (switcherPrivate) "No Incognito tabs.\nIncognito tabs aren't saved to history, and their cookies are removed when you close the last one." else "No tabs open."
        refreshChrome()
    }

    // ---------- the browser engine ----------
    private val desktopUa = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"

    fun mobileUa(): String = WebSettings.getDefaultUserAgent(this).replace("; wv", "").replace(Regex("Version/\\d+\\.\\d+\\s"), "")

    fun setDesktop(t: Tab, on: Boolean) {
        t.desktop = on
        t.webView.settings.apply {
            userAgentString = if (on) desktopUa else mobileUa()
            useWideViewPort = on; loadWithOverviewMode = on
        }
        t.webView.reload()
    }

    fun applySettingsToTabs() {
        tabs.forEach {
            it.webView.settings.textZoom = store.textZoom
            CookieManager.getInstance().setAcceptThirdPartyCookies(it.webView, store.thirdPartyCookies)
            applyWebDark(it.webView)
        }
    }

    private fun applyWebDark(wv: WebView) {
        try {
            if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) WebSettingsCompat.setAlgorithmicDarkeningAllowed(wv.settings, store.webDark && isDark())
        } catch (e: Exception) { /* older WebView: pages stay as the site made them */ }
    }

    /** (Re)installs the ad-hiding page script on every tab; call after the ad-blocking settings change. */
    fun refreshAdScripts() { tabs.forEach { installAdScript(it) } }

    private val keepVisibleScript = """(function(){try{
var d=Document.prototype,h=Object.getOwnPropertyDescriptor(d,'hidden'),v=Object.getOwnPropertyDescriptor(d,'visibilityState');
Object.defineProperty(d,'hidden',{configurable:true,get:function(){return false}});
Object.defineProperty(d,'visibilityState',{configurable:true,get:function(){return 'visible'}});
var stop=function(e){e.stopImmediatePropagation()};
document.addEventListener('visibilitychange',stop,true);document.addEventListener('webkitvisibilitychange',stop,true);
}catch(e){}})();"""

    /** Lets audio and video keep playing with the screen off: the page is told it is always visible. Not used in Incognito. */
    private fun installBackgroundScript(tab: Tab) {
        try { tab.bgHandle?.remove() } catch (e: Exception) { /* already gone */ }
        tab.bgHandle = null
        if (!store.backgroundAudio || tab.isPrivate || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
        try { tab.bgHandle = WebViewCompat.addDocumentStartJavaScript(tab.webView, keepVisibleScript, setOf("*")) } catch (e: Exception) { /* audio may pause when hidden */ }
    }

    private fun installAdScript(tab: Tab) {
        installBackgroundScript(tab)
        try { tab.adHandle?.remove() } catch (e: Exception) { /* already gone */ }
        tab.adHandle = null
        if (!(store.blockAds || store.hideCookiePopups) || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
        try { tab.adHandle = WebViewCompat.addDocumentStartJavaScript(tab.webView, Blocker.pageScript(store.blockOffList(), store.blockAds, store.hideCookiePopups), setOf("*")) } catch (e: Exception) { /* falls back to onPageStarted */ }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun createWebView(isPrivate: Boolean): WebView {
        val wv = DashWebView(this)
        try { wv.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false) } catch (e: Exception) { /* default priority */ }
        if (isPrivate && WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) {
            try { WebViewCompat.setProfile(wv, "dash_private") } catch (e: Exception) { /* falls back to the shared store */ }
        } else if (isPrivate) {
            Toast.makeText(this, "This phone's WebView can't keep Incognito tabs separate. Nothing is saved to history, but cookies are shared.", Toast.LENGTH_LONG).show()
        }
        if (store.sendGpc && WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            try {
                WebViewCompat.addDocumentStartJavaScript(wv, "try{Object.defineProperty(Navigator.prototype,'globalPrivacyControl',{get:function(){return true},configurable:true})}catch(e){}", setOf("*"))
            } catch (e: Exception) { /* header still goes out on typed navigations */ }
        }
        wv.setBackgroundColor(color(R.color.dash_bg))
        wv.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            setSupportMultipleWindows(false)
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            allowFileAccess = false
            allowContentAccess = false
            safeBrowsingEnabled = true
            builtInZoomControls = true
            displayZoomControls = false
            textZoom = store.textZoom
            setGeolocationEnabled(false)
            userAgentString = mobileUa()  // look like Chrome, not like an embedded WebView
            if (isPrivate) cacheMode = WebSettings.LOAD_NO_CACHE
        }
        applyWebDark(wv)
        CookieManager.getInstance().setAcceptCookie(true)
        CookieManager.getInstance().setAcceptThirdPartyCookies(wv, store.thirdPartyCookies)

        wv.setDownloadListener { url, ua, cd, mime, _ -> startDownload(url, ua, cd, mime) }
        wv.setOnLongClickListener { v ->
            val r = (v as WebView).hitTestResult
            val extra = r.extra
            when {
                extra == null -> false
                r.type == WebView.HitTestResult.SRC_ANCHOR_TYPE || r.type == WebView.HitTestResult.SRC_IMAGE_ANCHOR_TYPE -> { showLinkMenu(extra, false); true }
                r.type == WebView.HitTestResult.IMAGE_TYPE -> { showLinkMenu(extra, true); true }
                else -> false
            }
        }

        wv.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                when (uri.scheme) {
                    "dash" -> { handleDash(view.tag as Tab, uri); return true }
                    "http", "https" -> {
                        if (request.isForMainFrame && store.httpsUpgrade && uri.scheme == "http" && !isLocalHost(uri.toString())) {
                            view.loadUrl(uri.buildUpon().scheme("https").build().toString()); return true
                        }
                        return false
                    }
                    "about", "data", "blob" -> return false
                    else -> {
                        try { startActivity(Intent(Intent.ACTION_VIEW, uri)) } catch (e: Exception) { /* nothing can open it */ }
                        return true
                    }
                }
            }

            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val tab = view.tag as? Tab ?: return null
                if (store.blockAds && !store.blockingOff(Omnibox.hostOf(tab.url)) && (Blocker.blocks(request.url.host) || Blocker.blocksUrl(request.url.toString()))) {
                    runOnUiThread { tab.blocked += 1; store.blockedTotal += 1 }
                    return WebResourceResponse("text/plain", "utf-8", java.io.ByteArrayInputStream(ByteArray(0)))
                }
                return null
            }

            override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) {
                val t = view.tag as Tab
                t.loading = true
                if ((store.blockAds || store.hideCookiePopups) && t.adHandle == null && !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) view.evaluateJavascript(Blocker.pageScript(store.blockOffList(), store.blockAds, store.hideCookiePopups), null)
                if (!url.startsWith("https://dash.invalid") && !url.startsWith("data:")) t.url = url
                if (t === current) { progress.progress = 0; progress.visibility = View.VISIBLE; refreshChrome() }
            }

            override fun onPageFinished(view: WebView, url: String) {
                val t = view.tag as Tab
                t.loading = false
                if (t === current) { progress.visibility = View.INVISIBLE; swipe.isRefreshing = false; refreshChrome() }
                logins.onPageFinished(t, url)
                if (!t.isPrivate && t.errorUrl == null && !t.reader && t.url.startsWith("http") && url == t.url) store.addHistory(url, view.title ?: "")
            }

            override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                if (!request.isForMainFrame) return
                val desc = error.description?.toString() ?: ""
                // A navigation that was replaced by another, or handed to the downloader, is not an error.
                if (desc.contains("ERR_ABORTED") || error.errorCode == WebViewClient.ERROR_UNSUPPORTED_SCHEME) return
                val t = view.tag as? Tab ?: return
                val u = request.url.toString()
                t.errorUrl = u; t.loading = false
                view.loadDataWithBaseURL(u, ErrorPages.html(isDark(), u, error.errorCode, desc, !Net.isOnline(this@MainActivity)), "text/html", "utf-8", u)
                if (t === current) { progress.visibility = View.INVISIBLE; swipe.isRefreshing = false }
            }

            override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: android.net.http.SslError) {
                handler.cancel() // never click through a bad certificate
                val t = view.tag as? Tab ?: return
                // only the page itself gets an error page; a blocked picture or script on it just fails quietly
                if (Uri.parse(error.url).host != Uri.parse(t.url).host) return
                t.errorUrl = error.url; t.loading = false
                view.loadDataWithBaseURL(error.url, ErrorPages.html(isDark(), error.url, 0, "SSL error ${error.primaryError}", false, ErrorPages.sslDescription(error.primaryError)), "text/html", "utf-8", error.url)
                if (t === current) { progress.visibility = View.INVISIBLE; swipe.isRefreshing = false }
            }

            // The page's process died (crash, or Android took its memory): replace the tab's view instead of closing DASH.
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                val t = view.tag as? Tab ?: return true
                runOnUiThread { recoverTab(t, detail.didCrash()) }
                return true
            }
        }

        wv.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                if (view.tag === current) progress.progress = newProgress
            }
            override fun onReceivedTitle(view: WebView, title: String?) { val t = view.tag as Tab; t.title = title ?: ""; if (keepAudio && t === current) PlaybackService.update(newTitle = t.title) }
            override fun onReceivedIcon(view: WebView, icon: Bitmap?) {
                val t = view.tag as? Tab ?: return
                if (icon != null && !t.isPrivate && t.url.startsWith("http")) store.saveIcon(Omnibox.hostOf(t.url), icon)
            }
            override fun onShowFileChooser(w: WebView, cb: ValueCallback<Array<Uri>>, params: FileChooserParams): Boolean {
                chooserCb?.onReceiveValue(null); chooserCb = cb
                return try { chooser.launch(params.createIntent()); true } catch (e: Exception) { chooserCb = null; false }
            }
            // Camera, microphone and location: asked per site, remembered in Site settings (never in Incognito).
            override fun onPermissionRequest(request: PermissionRequest) = sitePerms.onWebRequest(request, current?.isPrivate == true)
            override fun onPermissionRequestCanceled(request: PermissionRequest) = sitePerms.cancel()
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) =
                sitePerms.onGeolocation(origin, callback, current?.isPrivate == true)
            override fun onGeolocationPermissionsHidePrompt() = sitePerms.cancel()
            override fun onShowCustomView(view: View, callback: CustomViewCallback) {
                customView = view; customCb = callback
                if (android.os.Build.VERSION.SDK_INT >= 31) try { setPictureInPictureParams(android.app.PictureInPictureParams.Builder().setAspectRatio(android.util.Rational(16, 9)).setAutoEnterEnabled(true).build()) } catch (e: Exception) { /* optional */ }
                (window.decorView as ViewGroup).addView(view, ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
                WindowInsetsControllerCompat(window, window.decorView).apply {
                    hide(WindowInsetsCompat.Type.systemBars()); systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                }
            }
            override fun onHideCustomView() = hideCustomView()
        }
        logins.attach(wv)
        return wv
    }

    // ---------- voice search, QR codes ----------
    private val voiceLauncher = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { r ->
        r.data?.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS)?.firstOrNull()?.let { go(it) }
    }
    private val qrLauncher = registerForActivityResult(com.journeyapps.barcodescanner.ScanContract()) { r -> r.contents?.let { handleScanned(it) } }

    /** Speech is recognised by the phone's own speech service (usually Google's), not by DASH. */
    fun voiceSearch() {
        try {
            voiceLauncher.launch(Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT, "Search"))
        } catch (e: Exception) { toast("No speech recognition app found on this phone") }
    }

    fun scanQr() {
        try {
            qrLauncher.launch(com.journeyapps.barcodescanner.ScanOptions().setDesiredBarcodeFormats(com.journeyapps.barcodescanner.ScanOptions.QR_CODE)
                .setPrompt("Point at a QR code").setBeepEnabled(false).setOrientationLocked(false))
        } catch (e: Exception) { toast("Can't open the camera scanner") }
    }

    private fun handleScanned(text: String) {
        if (Omnibox.looksLikeUrl(text)) { go(text); return }
        // plain text may be private (a Wi-Fi password, for example), so it is never searched without asking
        com.google.android.material.dialog.MaterialAlertDialogBuilder(this).setTitle("QR code").setMessage(text.take(500))
            .setPositiveButton("Search") { _, _ -> goSearch(text.take(300)) }
            .setNeutralButton("Copy") { _, _ -> copy(text) }.setNegativeButton("Close", null).show()
    }

    // ---------- reading mode, translate ----------
    fun readingMode() {
        val t = current ?: return
        if (t.reader) { load(t, t.url); return }
        t.webView.evaluateJavascript(Reader.EXTRACT_JS) { raw ->
            try {
                val o = org.json.JSONObject(org.json.JSONTokener(raw).nextValue() as? String ?: throw IllegalStateException())
                if (!o.optBoolean("ok")) { toast("No article found on this page"); return@evaluateJavascript }
                val page = Reader.html(isDark(), Omnibox.hostOf(t.url), o.optString("title"), o.getJSONArray("blocks"))
                t.reader = true
                t.webView.loadDataWithBaseURL(t.url, page, "text/html", "utf-8", t.url)
            } catch (e: Exception) { toast("Can't open reading mode on this page") }
        }
    }

    /** Uses Google Translate's web page, so Google sees the address of the page. DASH explains that before the first use. */
    fun translatePage() {
        val t = current ?: return
        if (!t.url.startsWith("http")) return
        val go = {
            val lang = java.util.Locale.getDefault().language.ifEmpty { "en" }
            load(t, "https://translate.google.com/translate?sl=auto&tl=$lang&u=" + Uri.encode(t.url))
        }
        if (store.translateAck) { go(); return }
        com.google.android.material.dialog.MaterialAlertDialogBuilder(this).setTitle("Translate this page?")
            .setMessage("DASH has no translator of its own. The page opens through Google Translate, so Google will see the address of the page you translate.")
            .setPositiveButton("Translate") { _, _ -> store.translateAck = true; go() }.setNegativeButton("Cancel", null).show()
    }

    // ---------- picture-in-picture and background audio ----------
    private val notificationPermission = registerForActivityResult(ActivityResultContracts.RequestPermission()) { }
    fun askNotificationPermission() {
        if (android.os.Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED)
            notificationPermission.launch(android.Manifest.permission.POST_NOTIFICATIONS)
    }

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        if (customView != null) {   // a full-screen video keeps playing in a small window
            try { enterPictureInPictureMode(android.app.PictureInPictureParams.Builder().setAspectRatio(android.util.Rational(16, 9)).build()) } catch (e: Exception) { /* not supported here */ }
            return
        }
        armBackgroundAudio()
    }

    /** Android's print dialog: print, or choose "Save as PDF" as the printer. */
    fun printPage() {
        val t = current ?: return
        try {
            val name = t.title.ifBlank { Omnibox.hostOf(t.url) }.ifBlank { "page" }
            (getSystemService(Context.PRINT_SERVICE) as android.print.PrintManager)
                .print("DASH - $name", t.webView.createPrintDocumentAdapter(name), android.print.PrintAttributes.Builder().build())
        } catch (e: Exception) { toast("Can't print this page") }
    }

    fun retryDownload(url: String) = startDownload(url, current?.webView?.settings?.userAgentString, null, null)

    private fun startDownload(url: String, ua: String?, cd: String?, mime: String?) {
        try {
            val name = URLUtil.guessFileName(url, cd, mime)
            val req = DownloadManager.Request(Uri.parse(url))
                .setTitle(name)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, name)
            if (!mime.isNullOrEmpty()) req.setMimeType(mime)
            if (!ua.isNullOrEmpty()) req.addRequestHeader("User-Agent", ua)
            CookieManager.getInstance().getCookie(url)?.let { req.addRequestHeader("Cookie", it) }
            (getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager).enqueue(req)
            toast("Downloading $name")
        } catch (e: Exception) { toast("Can't download this file") }
    }

    /** Long-press on a link or image, like Chrome. */
    private fun showLinkMenu(url: String, image: Boolean) {
        val labels = if (image) arrayOf("Open image in new tab", "Download image", "Copy image address")
        else arrayOf("Open in new tab", "Open in Incognito tab", "Copy link address", "Share link")
        com.google.android.material.dialog.MaterialAlertDialogBuilder(this).setTitle(Omnibox.hostOf(url).ifEmpty { "Link" }).setItems(labels) { _, i ->
            if (image) when (i) {
                0 -> newTab(url, isPrivate = current?.isPrivate == true)
                1 -> startDownload(url, current?.webView?.settings?.userAgentString, null, null)
                2 -> copy(url)
            } else when (i) {
                0 -> newTab(url, isPrivate = current?.isPrivate == true)
                1 -> newTab(url, isPrivate = true)
                2 -> copy(url)
                3 -> startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, url), "Share link"))
            }
        }.show()
    }

    private fun copy(text: String) {
        (getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("DASH", text))
        toast("Copied")
    }

    private fun hideCustomView() {
        customView?.let { (window.decorView as ViewGroup).removeView(it) }
        customView = null; customCb?.onCustomViewHidden(); customCb = null
        if (android.os.Build.VERSION.SDK_INT >= 31) try { setPictureInPictureParams(android.app.PictureInPictureParams.Builder().setAutoEnterEnabled(false).build()) } catch (e: Exception) { /* optional */ }
        WindowInsetsControllerCompat(window, window.decorView).show(WindowInsetsCompat.Type.systemBars())
    }

    private fun recoverTab(t: Tab, crashed: Boolean) {
        if (t !in tabs) return
        val url = t.url
        val wasCurrent = t === current
        (t.webView.parent as? ViewGroup)?.removeView(t.webView)
        try { t.webView.destroy() } catch (e: Exception) { /* already gone */ }
        t.webView = createWebView(t.isPrivate).also { it.tag = t }
        t.adHandle = null; t.bgHandle = null; t.desktop = false; t.loading = false; t.errorUrl = null
        installAdScript(t)
        if (wasCurrent) select(t)
        if (url.isEmpty()) openHome(t) else load(t, url)
        toast(if (crashed) "This tab crashed, so DASH reloaded it" else "DASH reloaded this tab to free memory")
    }

    private fun handleDash(tab: Tab, uri: Uri) {
        when (uri.host) {
            "search" -> uri.getQueryParameter("q")?.let { if (it.isNotBlank()) load(tab, Omnibox.resolve(it, store.searchEngine)) }
            "hide" -> uri.getQueryParameter("host")?.let { store.hideSite(it) } // the page already removed the tile itself
            "focus" -> focusAddress()
            "incognito" -> newTab(null, isPrivate = true)
            "history" -> screens.showHistory()
            "bookmarks" -> screens.showBookmarks()
            "retry" -> tab.errorUrl?.let { load(tab, it) } ?: tab.webView.reload()
            "back" -> if (tab.webView.canGoBack()) tab.webView.goBack() else { tab.errorUrl = null; openHome(tab); tab.url = ""; refreshChrome() }
            "wifi" -> try { startActivity(Intent(android.provider.Settings.ACTION_WIFI_SETTINGS)) } catch (e: Exception) { toast("Open Wi-Fi settings from Android settings") }
        }
    }

    private fun deletePrivateProfile() {
        try { if (WebViewFeature.isFeatureSupported(WebViewFeature.MULTI_PROFILE)) ProfileStore.getInstance().deleteProfile("dash_private") } catch (e: Exception) { /* still in use */ }
    }
}
