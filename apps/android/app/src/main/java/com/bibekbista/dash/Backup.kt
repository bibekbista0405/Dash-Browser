package com.bibekbista.dash

import android.util.Base64
import java.security.SecureRandom
import java.text.Normalizer
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec
import org.json.JSONObject

/**
 * The same encrypted backup file the desktop app writes (.dashbackup): JSON envelope, scrypt (N=32768, r=8, p=1) key from the
 * passphrase, AES-256-GCM. A file saved on one device opens on the other. A wrong passphrase and a damaged file look the same.
 */
object Backup {
    private const val FORMAT = "dash-backup"
    private const val N = 32768
    private const val R = 8
    private const val P = 1
    const val MIN_PASSPHRASE = 8

    class BackupException(message: String) : Exception(message)

    private fun passBytes(pass: CharArray) = Normalizer.normalize(String(pass), Normalizer.Form.NFKC).toByteArray(Charsets.UTF_8)

    fun encrypt(plain: String, pass: CharArray): String {
        val rnd = SecureRandom()
        val salt = ByteArray(16).also { rnd.nextBytes(it) }
        val iv = ByteArray(12).also { rnd.nextBytes(it) }
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, SecretKeySpec(Scrypt.derive(passBytes(pass), salt, N, R, P, 32), "AES"), GCMParameterSpec(128, iv))
        val out = c.doFinal(plain.toByteArray(Charsets.UTF_8))      // ciphertext followed by the 16-byte tag
        val data = out.copyOfRange(0, out.size - 16)
        val tag = out.copyOfRange(out.size - 16, out.size)
        fun b64(b: ByteArray) = Base64.encodeToString(b, Base64.NO_WRAP)
        return JSONObject().put("format", FORMAT).put("v", 1).put("kdf", "scrypt").put("N", N).put("r", R).put("p", P)
            .put("salt", b64(salt)).put("iv", b64(iv)).put("tag", b64(tag)).put("data", b64(data)).toString()
    }

    /** Returns the JSON inside. Throws [BackupException] with a message that is safe to show. */
    fun decrypt(fileText: String, pass: CharArray): String {
        val env = try { JSONObject(fileText) } catch (e: Exception) { throw BackupException("This is not a DASH backup file") }
        if (env.optString("format") != FORMAT || env.optInt("v") != 1 || env.optString("kdf") != "scrypt")
            throw BackupException("This is not a DASH backup file (or it is from a newer DASH)")
        // Only the parameters DASH writes: a crafted file must not choose a huge N and exhaust memory.
        if (env.optInt("N") != N || env.optInt("r") != R || env.optInt("p") != P) throw BackupException("Unsupported backup parameters")
        try {
            fun b64(k: String) = Base64.decode(env.getString(k), Base64.DEFAULT)
            val iv = b64("iv"); val tag = b64("tag")
            if (iv.size != 12 || tag.size != 16) throw BackupException("Wrong passphrase, or the file is damaged")
            val c = Cipher.getInstance("AES/GCM/NoPadding")
            c.init(Cipher.DECRYPT_MODE, SecretKeySpec(Scrypt.derive(passBytes(pass), b64("salt"), N, R, P, 32), "AES"), GCMParameterSpec(128, iv))
            return String(c.doFinal(b64("data") + tag), Charsets.UTF_8)
        } catch (e: BackupException) { throw e } catch (e: Exception) { throw BackupException("Wrong passphrase, or the file is damaged") }
    }
}

/** scrypt (RFC 7914), since Android has none built in. Checked against Node's crypto.scryptSync. Uses about 32 MB for DASH's settings. */
object Scrypt {
    private fun pbkdf2One(pass: ByteArray, salt: ByteArray, dkLen: Int): ByteArray {
        val mac = Mac.getInstance("HmacSHA256"); mac.init(SecretKeySpec(pass, "HmacSHA256"))
        val out = ByteArray(dkLen); var i = 1; var off = 0
        while (off < dkLen) {
            mac.update(salt)
            mac.update(byteArrayOf((i ushr 24).toByte(), (i ushr 16).toByte(), (i ushr 8).toByte(), i.toByte()))
            val t = mac.doFinal()
            System.arraycopy(t, 0, out, off, minOf(32, dkLen - off)); off += 32; i++
        }
        return out
    }

    private fun rl(a: Int, b: Int) = Integer.rotateLeft(a, b)

    private fun salsa8(b: IntArray) {
        val x = b.copyOf()
        for (i in 0 until 8 step 2) {
            x[4] = x[4] xor rl(x[0] + x[12], 7);  x[8] = x[8] xor rl(x[4] + x[0], 9)
            x[12] = x[12] xor rl(x[8] + x[4], 13); x[0] = x[0] xor rl(x[12] + x[8], 18)
            x[9] = x[9] xor rl(x[5] + x[1], 7);   x[13] = x[13] xor rl(x[9] + x[5], 9)
            x[1] = x[1] xor rl(x[13] + x[9], 13);  x[5] = x[5] xor rl(x[1] + x[13], 18)
            x[14] = x[14] xor rl(x[10] + x[6], 7); x[2] = x[2] xor rl(x[14] + x[10], 9)
            x[6] = x[6] xor rl(x[2] + x[14], 13);  x[10] = x[10] xor rl(x[6] + x[2], 18)
            x[3] = x[3] xor rl(x[15] + x[11], 7);  x[7] = x[7] xor rl(x[3] + x[15], 9)
            x[11] = x[11] xor rl(x[7] + x[3], 13); x[15] = x[15] xor rl(x[11] + x[7], 18)
            x[1] = x[1] xor rl(x[0] + x[3], 7);   x[2] = x[2] xor rl(x[1] + x[0], 9)
            x[3] = x[3] xor rl(x[2] + x[1], 13);   x[0] = x[0] xor rl(x[3] + x[2], 18)
            x[6] = x[6] xor rl(x[5] + x[4], 7);   x[7] = x[7] xor rl(x[6] + x[5], 9)
            x[4] = x[4] xor rl(x[7] + x[6], 13);   x[5] = x[5] xor rl(x[4] + x[7], 18)
            x[11] = x[11] xor rl(x[10] + x[9], 7); x[8] = x[8] xor rl(x[11] + x[10], 9)
            x[9] = x[9] xor rl(x[8] + x[11], 13);  x[10] = x[10] xor rl(x[9] + x[8], 18)
            x[12] = x[12] xor rl(x[15] + x[14], 7); x[13] = x[13] xor rl(x[12] + x[15], 9)
            x[14] = x[14] xor rl(x[13] + x[12], 13); x[15] = x[15] xor rl(x[14] + x[13], 18)
        }
        for (i in 0 until 16) b[i] += x[i]
    }

    private fun blockMix(b: IntArray, y: IntArray, r: Int) {
        val x = IntArray(16)
        System.arraycopy(b, (2 * r - 1) * 16, x, 0, 16)
        for (i in 0 until 2 * r) {
            for (k in 0 until 16) x[k] = x[k] xor b[i * 16 + k]
            salsa8(x)
            val dst = if (i % 2 == 0) (i / 2) * 16 else (r + i / 2) * 16
            System.arraycopy(x, 0, y, dst, 16)
        }
        System.arraycopy(y, 0, b, 0, 32 * r)
    }

    private fun roMix(b: IntArray, n: Int, r: Int) {
        val w = 32 * r
        val v = IntArray(n * w); val y = IntArray(w)
        for (i in 0 until n) { System.arraycopy(b, 0, v, i * w, w); blockMix(b, y, r) }
        for (i in 0 until n) {
            val j = b[(2 * r - 1) * 16] and (n - 1)
            for (k in 0 until w) b[k] = b[k] xor v[j * w + k]
            blockMix(b, y, r)
        }
    }

    fun derive(pass: ByteArray, salt: ByteArray, n: Int, r: Int, p: Int, dkLen: Int): ByteArray {
        val b = pbkdf2One(pass, salt, p * 128 * r)
        val w = 32 * r
        for (pi in 0 until p) {
            val x = IntArray(w); val base = pi * 128 * r
            for (i in 0 until w) {
                val o = base + i * 4
                x[i] = (b[o].toInt() and 255) or ((b[o + 1].toInt() and 255) shl 8) or ((b[o + 2].toInt() and 255) shl 16) or ((b[o + 3].toInt() and 255) shl 24)
            }
            roMix(x, n, r)
            for (i in 0 until w) {
                val o = base + i * 4
                b[o] = x[i].toByte(); b[o + 1] = (x[i] ushr 8).toByte(); b[o + 2] = (x[i] ushr 16).toByte(); b[o + 3] = (x[i] ushr 24).toByte()
            }
        }
        return pbkdf2One(pass, b, dkLen)
    }
}
