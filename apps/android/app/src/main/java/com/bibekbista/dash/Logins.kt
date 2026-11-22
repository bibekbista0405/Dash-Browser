package com.bibekbista.dash

import android.content.ClipData
import android.content.ClipDescription
import android.content.ClipboardManager
import android.content.Context
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.os.PersistableBundle
import android.view.Gravity
import android.view.ViewGroup
import android.view.WindowManager
import android.webkit.WebView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import org.json.JSONObject

/** Offers to save logins after you sign in, and offers to fill them when you tap a login field. */
class Logins(private val a: MainActivity) {
    val vault: Vault by lazy { Vault(a) }   // lazy: the Activity has no Context yet when this object is constructed
    private class Pending(val tab: Tab, val host: String, val user: String, val pass: String, val url: String)

    private var pending: Pending? = null
    private var sheet: BottomSheetDialog? = null
    private var lastOffer = ""
    private var lastOfferAt = 0L
    private val ui = Handler(Looper.getMainLooper())

    /** Hooks a tab's web view up to the login script. Skipped quietly on a WebView that is too old. */
    fun attach(wv: WebView) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) || !WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) return
        try {
            // Origin is checked in onMessage (https, top frame), so the broad rule here is safe.
            WebViewCompat.addWebMessageListener(wv, "dashLogin", setOf("*")) { view, message, origin, isMainFrame, reply ->
                onMessage(view, message, origin, isMainFrame, reply)
            }
            WebViewCompat.addDocumentStartJavaScript(wv, LoginScript.JS, setOf("*"))
        } catch (e: Exception) { /* passwords are a bonus; browsing still works */ }
    }

    private fun onMessage(view: WebView, message: WebMessageCompat, origin: Uri, isMainFrame: Boolean, reply: JavaScriptReplyProxy) {
        val data = message.data ?: return
        if (!isMainFrame || data.length > 4000 || origin.scheme != "https") return
        val host = Vault.norm(origin.host ?: return)
        val tab = view.tag as? Tab ?: return
        val o = try { JSONObject(data) } catch (e: Exception) { return }
        when (o.optString("t")) {
            "save" -> {
                if (tab.isPrivate || !a.store.offerPasswords || vault.isNever(host)) return
                val pass = o.optString("p").take(1000); if (pass.isEmpty()) return
                queueSave(Pending(tab, host, o.optString("u").take(320), pass, view.url ?: ""))
            }
            "focus" -> offerFill(host, reply)
        }
    }

    // ---------- saving ----------
    /** A login is offered for saving once it worked: the page moved on, or the password box went away. A failed login keeps its box. */
    private fun queueSave(p: Pending) {
        pending = p
        ui.postDelayed({
            if (pending !== p) return@postDelayed
            try {
                p.tab.webView.evaluateJavascript(LoginScript.COUNT_VISIBLE_PASSWORD_FIELDS) { r ->
                    if (pending === p && r?.trim('"') == "0") promptSave(p)
                }
            } catch (e: Exception) { pending = null }
        }, 2600)
    }

    fun onPageFinished(tab: Tab, url: String) {
        val p = pending ?: return
        if (p.tab === tab && url != p.url) promptSave(p)
    }

    private fun promptSave(p: Pending) {
        if (pending !== p) return
        pending = null
        if (a.isFinishing || a.isDestroyed) return
        val existing = vault.find(p.host, p.user)
        if (existing != null && existing.pass == p.pass) return
        val update = existing != null
        showSheet { col, d ->
            col.addView(title(if (update) "Update password for ${p.host}?" else "Save password for ${p.host}?"))
            col.addView(sub(p.user.ifBlank { "No username" } + "   " + "•".repeat(8)))
            col.addView(note("Saved on this phone only, encrypted with a key that stays in Android's secure storage."))
            col.addView(button(if (update) "Update password" else "Save", true) {
                vault.add(p.host, p.user, p.pass); d.dismiss(); a.toast(if (update) "Password updated" else "Password saved")
            })
            col.addView(button("Not now", false) { d.dismiss() })
            if (!update) col.addView(button("Never for this site", false) { vault.addNever(p.host); d.dismiss() })
        }
    }

    // ---------- filling ----------
    private fun offerFill(host: String, reply: JavaScriptReplyProxy) {
        val matches = vault.forHost(host)
        if (matches.isEmpty()) return
        val now = System.currentTimeMillis()
        if (host == lastOffer && now - lastOfferAt < 6000) return   // do not nag while you tap between fields
        lastOffer = host; lastOfferAt = now
        showSheet { col, d ->
            col.addView(title("Sign in to $host"))
            col.addView(sub("Choose a saved login"))
            matches.forEach { l ->
                col.addView(button(l.user.ifBlank { "No username" }, false) {
                    d.dismiss()
                    try { reply.postMessage(JSONObject().put("t", "fill").put("u", l.user).put("p", l.pass).toString()) } catch (e: Exception) { a.toast("Couldn't fill this page") }
                })
            }
        }
    }

    // ---------- identity check, copy ----------
    /** Fingerprint / face / screen lock before a password is shown or copied. With no screen lock set there is nothing to ask. */
    fun confirm(title: String, then: () -> Unit) {
        if (BiometricManager.from(a).canAuthenticate(a.authenticators) != BiometricManager.BIOMETRIC_SUCCESS) { then(); return }
        a.identityCheck = true
        val info = BiometricPrompt.PromptInfo.Builder().setTitle(title).setSubtitle("Confirm it's you").setAllowedAuthenticators(a.authenticators).build()
        BiometricPrompt(a, ContextCompat.getMainExecutor(a), object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) { a.identityCheck = false; then() }
            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) { a.identityCheck = false }
        }).authenticate(info)
    }

    fun copySecret(label: String, text: String, clearAfterSeconds: Int = 60) {
        val cm = a.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText(label, text)
        clip.description.extras = PersistableBundle().apply { putBoolean(ClipDescription.EXTRA_IS_SENSITIVE, true) }
        cm.setPrimaryClip(clip)
        a.toast("Copied. It is cleared in $clearAfterSeconds seconds.")
        ui.postDelayed({ try { cm.clearPrimaryClip() } catch (e: Exception) { /* not allowed right now */ } }, clearAfterSeconds * 1000L)
    }

    fun showPassword(l: Login) {
        confirm("Show password") {
            val d = MaterialAlertDialogBuilder(a).setTitle(l.host)
                .setMessage("${l.user.ifBlank { "No username" }}\n\n${l.pass}")
                .setPositiveButton("Close", null).setNeutralButton("Copy") { _, _ -> copySecret("Password", l.pass) }.create()
            d.window?.setFlags(WindowManager.LayoutParams.FLAG_SECURE, WindowManager.LayoutParams.FLAG_SECURE)   // no screenshots of it
            d.show()
        }
    }

    // ---------- backup ----------
    fun backupItems() = vault.all().map { JSONObject().put("origin", "https://${it.host}").put("username", it.user).put("password", it.pass) }

    fun importFrom(json: String): Int = try {
        val arr = JSONObject(json).optJSONArray("passwords")
        if (arr == null) 0 else vault.importAll((0 until arr.length()).mapNotNull { i -> arr.optJSONObject(i)?.let { Triple(it.optString("origin"), it.optString("username"), it.optString("password")) } })
    } catch (e: Exception) { 0 }

    // ---------- small sheet toolkit ----------
    private fun showSheet(build: (LinearLayout, BottomSheetDialog) -> Unit) {
        sheet?.dismiss()
        val d = BottomSheetDialog(a)
        val col = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL; setPadding(a.dp(22), a.dp(20), a.dp(22), a.dp(26)) }
        build(col, d)
        d.setContentView(col); sheet = d; d.show()
    }

    private fun title(t: String) = TextView(a).apply { text = t; textSize = 19f; setTypeface(null, android.graphics.Typeface.BOLD); setTextColor(a.color(R.color.dash_text)) }
    private fun sub(t: String) = TextView(a).apply { text = t; textSize = 15f; setTextColor(a.color(R.color.dash_text)); setPadding(0, a.dp(8), 0, a.dp(4)) }
    private fun note(t: String) = TextView(a).apply { text = t; textSize = 13f; setTextColor(a.color(R.color.dash_dim)); setPadding(0, a.dp(4), 0, a.dp(12)) }
    private fun button(t: String, primary: Boolean, onClick: () -> Unit) = TextView(a).apply {
        text = t; textSize = 15f; gravity = Gravity.CENTER; setTypeface(null, android.graphics.Typeface.BOLD)
        setTextColor(if (primary) android.graphics.Color.WHITE else a.color(R.color.dash_text))
        setBackgroundResource(if (primary) R.drawable.bg_btn_primary else R.drawable.bg_chip)
        setOnClickListener { onClick() }
        layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, a.dp(48)).apply { topMargin = a.dp(10) }
    }
}
