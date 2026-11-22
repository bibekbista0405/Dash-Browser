package com.bibekbista.dash

import android.Manifest
import android.content.pm.PackageManager
import android.net.Uri
import android.webkit.GeolocationPermissions
import android.webkit.PermissionRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.core.content.ContextCompat
import com.google.android.material.dialog.MaterialAlertDialogBuilder

/**
 * Real camera / microphone / location prompts for websites.
 * Each site is asked once; the answer is kept per site (except in Incognito) and can be changed in Site settings.
 * Only https sites can ask. Android's own permission is requested only after you allow the site.
 */
class SitePermissions(private val a: MainActivity) {
    companion object {
        val KINDS = listOf("camera", "microphone", "location")
        fun label(kind: String) = when (kind) { "camera" -> "Camera"; "microphone" -> "Microphone"; else -> "Location" }
        fun stateLabel(state: String) = when (state) { "allow" -> "Allowed"; "block" -> "Blocked"; else -> "Ask every time" }
        private fun androidPerms(kind: String) = when (kind) {
            "camera" -> arrayOf(Manifest.permission.CAMERA)
            "microphone" -> arrayOf(Manifest.permission.RECORD_AUDIO)
            else -> arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        }
    }

    private var pending: ((Map<String, Boolean>) -> Unit)? = null
    private var dialog: AlertDialog? = null
    private var cancelled = false

    private val launcher = a.registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { r ->
        val cb = pending; pending = null; cb?.invoke(r)
    }

    /** Dismisses a prompt that the page has withdrawn. */
    fun cancel() { cancelled = true; dialog?.dismiss(); dialog = null; pending = null }

    fun onWebRequest(request: PermissionRequest, isPrivate: Boolean) {
        val host = request.origin.host
        val kinds = request.resources.mapNotNull {
            when (it) { PermissionRequest.RESOURCE_VIDEO_CAPTURE -> "camera"; PermissionRequest.RESOURCE_AUDIO_CAPTURE -> "microphone"; else -> null }
        }.distinct()
        if (host == null || request.origin.scheme != "https" || kinds.isEmpty()) { request.deny(); return }
        cancelled = false
        decide(host, kinds, isPrivate) { ok ->
            if (cancelled) return@decide
            try {
                if (!ok) request.deny()
                else request.grant(request.resources.filter { it == PermissionRequest.RESOURCE_VIDEO_CAPTURE || it == PermissionRequest.RESOURCE_AUDIO_CAPTURE }.toTypedArray())
            } catch (e: Exception) { /* the page already gave up on this request */ }
        }
    }

    fun onGeolocation(origin: String, callback: GeolocationPermissions.Callback, isPrivate: Boolean) {
        val host = Uri.parse(origin).host
        if (host == null || !origin.startsWith("https://")) { callback.invoke(origin, false, false); return }
        cancelled = false
        decide(host, listOf("location"), isPrivate) { ok -> if (!cancelled) callback.invoke(origin, ok, false) }
    }

    private fun decide(host: String, kinds: List<String>, isPrivate: Boolean, done: (Boolean) -> Unit) {
        val states = kinds.associateWith { a.store.sitePerm(host, it) }
        when {
            states.values.any { it == "block" } -> done(false)
            states.values.all { it == "allow" } -> androidGrant(kinds, done)
            else -> {
                val unresolved = kinds.filter { states[it] == "ask" }
                ask(host, unresolved, isPrivate) { allowed ->
                    if (allowed == null) done(false)
                    else {
                        if (!isPrivate) unresolved.forEach { a.store.setSitePerm(host, it, if (allowed) "allow" else "block") }
                        if (allowed) androidGrant(kinds, done) else done(false)
                    }
                }
            }
        }
    }

    private fun ask(host: String, kinds: List<String>, isPrivate: Boolean, result: (Boolean?) -> Unit) {
        dialog?.dismiss()
        val what = kinds.joinToString(" and ") { label(it).lowercase() }
        val note = if (isPrivate) "\n\nIncognito: your choice is not remembered." else "\n\nYour choice is remembered for this site. You can change it in Settings > Site settings."
        var answered = false
        dialog = MaterialAlertDialogBuilder(a)
            .setTitle(host)
            .setMessage("wants to use your $what.$note")
            .setPositiveButton("Allow") { _, _ -> answered = true; result(true) }
            .setNegativeButton("Block") { _, _ -> answered = true; result(false) }
            .setOnDismissListener { if (!answered && !cancelled) result(null) }
            .show()
    }

    /** Ask Android for the real permission (only if the site was allowed). */
    private fun androidGrant(kinds: List<String>, done: (Boolean) -> Unit) {
        val needed = kinds.flatMap { androidPerms(it).toList() }.distinct()
            .filter { ContextCompat.checkSelfPermission(a, it) != PackageManager.PERMISSION_GRANTED }
        if (needed.isEmpty()) { done(true); return }
        pending = { res ->
            // location is fine if either precise or approximate was granted; camera/mic need theirs
            val ok = kinds.all { k ->
                val ps = androidPerms(k)
                if (k == "location") ps.any { ContextCompat.checkSelfPermission(a, it) == PackageManager.PERMISSION_GRANTED }
                else ps.all { ContextCompat.checkSelfPermission(a, it) == PackageManager.PERMISSION_GRANTED }
            }
            if (!ok) a.toast("Allow it in Android settings to use it")
            done(ok)
        }
        launcher.launch(needed.toTypedArray())
    }
}
