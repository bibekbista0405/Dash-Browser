package com.bibekbista.dash

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class Login(val id: String, val host: String, var user: String, var pass: String, val created: Long, var updated: Long)

/**
 * Saved logins. The file is AES-256-GCM encrypted with a key that lives in the Android Keystore (hardware-backed on most
 * phones) and never leaves it, so the file is useless when copied off the device. Showing or copying a password asks for
 * your fingerprint / screen lock first (see Logins.confirm). Nothing here is ever sent anywhere.
 */
class Vault(private val ctx: Context) {
    enum class Saved { ADDED, UPDATED, SAME }

    private val file = File(ctx.filesDir, "vault.bin")
    private var logins: MutableList<Login>? = null
    private var never = mutableSetOf<String>()

    companion object {
        private const val ALIAS = "dash_vault_key"
        fun norm(host: String) = host.lowercase().removePrefix("www.")
    }

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        g.init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build())
        return g.generateKey()
    }

    @Synchronized private fun load(): MutableList<Login> {
        logins?.let { return it }
        val list = mutableListOf<Login>()
        logins = list
        if (!file.exists()) return list
        try {
            val raw = file.readBytes()
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, raw.copyOfRange(0, 12)))
            val o = JSONObject(String(c.doFinal(raw, 12, raw.size - 12), Charsets.UTF_8))
            o.optJSONArray("logins")?.let { a -> for (i in 0 until a.length()) a.getJSONObject(i).let {
                list.add(Login(it.getString("id"), it.getString("host"), it.optString("user"), it.getString("pass"), it.optLong("created"), it.optLong("updated")))
            } }
            o.optJSONArray("never")?.let { a -> for (i in 0 until a.length()) never.add(a.getString(i)) }
        } catch (e: Exception) {
            // The key is gone (for example after a reset) or the file is damaged: keep the old file aside instead of overwriting it.
            file.renameTo(File(ctx.filesDir, "vault.unreadable"))
        }
        return list
    }

    @Synchronized private fun save() {
        val o = JSONObject()
            .put("logins", JSONArray(load().map { JSONObject().put("id", it.id).put("host", it.host).put("user", it.user).put("pass", it.pass).put("created", it.created).put("updated", it.updated) }))
            .put("never", JSONArray(never.toList()))
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key())
        val tmp = File(ctx.filesDir, "vault.tmp")
        tmp.writeBytes(c.iv + c.doFinal(o.toString().toByteArray(Charsets.UTF_8)))
        tmp.renameTo(file)
    }

    fun all(): List<Login> = load().sortedWith(compareBy({ it.host }, { it.user.lowercase() }))
    fun count() = load().size
    fun forHost(host: String): List<Login> = load().filter { it.host == norm(host) }.sortedByDescending { it.updated }
    fun find(host: String, user: String) = load().firstOrNull { it.host == norm(host) && it.user.equals(user, true) }

    fun add(host: String, user: String, pass: String): Saved {
        val h = norm(host)
        val existing = find(h, user)
        if (existing != null) {
            if (existing.pass == pass) return Saved.SAME
            existing.pass = pass; existing.updated = System.currentTimeMillis(); save(); return Saved.UPDATED
        }
        val now = System.currentTimeMillis()
        load().add(Login(UUID.randomUUID().toString(), h, user, pass, now, now)); never.remove(h); save()
        return Saved.ADDED
    }

    fun delete(id: String) { load().removeAll { it.id == id }; save() }
    fun deleteAll() { load().clear(); save() }
    fun isNever(host: String) = load().let { never.contains(norm(host)) }
    fun addNever(host: String) { load(); never.add(norm(host)); save() }

    /** Imports logins from a backup. Only https sites; returns how many were new or changed. */
    fun importAll(items: List<Triple<String, String, String>>): Int {
        var n = 0
        for ((origin, user, pass) in items) {
            val host = try { android.net.Uri.parse(origin).takeIf { it.scheme == "https" }?.host } catch (e: Exception) { null } ?: continue
            if (pass.isEmpty() || pass.length > 1000 || user.length > 320) continue
            val h = norm(host); val existing = find(h, user)
            when {
                existing == null -> { val now = System.currentTimeMillis(); load().add(Login(UUID.randomUUID().toString(), h, user, pass, now, now)); n++ }
                existing.pass != pass -> { existing.pass = pass; existing.updated = System.currentTimeMillis(); n++ }
            }
        }
        if (n > 0) save()
        return n
    }
}
