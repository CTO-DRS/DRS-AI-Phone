package com.drsai.download

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import android.util.Log
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Encrypts download auth tokens at rest with an AES-256/GCM key that never
 * leaves the Android Keystore (audit finding F-03 / recommendation R-03).
 *
 * The `downloads` Room table stores ciphertext prefixed with [PREFIX]; any
 * value without that prefix is treated as legacy plaintext and returned
 * unchanged so pre-existing rows keep working. Decryption failures return
 * null (the download then proceeds unauthenticated rather than crashing).
 */
object DownloadTokenCryptor {

    private const val TAG = "DownloadTokenCryptor"
    private const val KEYSTORE = "AndroidKeyStore"
    private const val KEY_ALIAS = "drsai_download_token_key"
    private const val PREFIX = "enc:v1:"
    private const val GCM_TAG_BITS = 128
    private const val IV_BYTES = 12

    @Volatile
    private var cachedKey: SecretKey? = null

    private fun getOrCreateKey(): SecretKey? {
        cachedKey?.let { return it }
        return try {
            val ks = KeyStore.getInstance(KEYSTORE).apply { load(null) }
            (ks.getKey(KEY_ALIAS, null) as? SecretKey) ?: run {
                val generator = KeyGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_AES, KEYSTORE
                )
                generator.init(
                    KeyGenParameterSpec.Builder(
                        KEY_ALIAS,
                        KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                    )
                        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                        .setKeySize(256)
                        .build()
                )
                generator.generateKey()
            }.also { cachedKey = it }
        } catch (e: Exception) {
            Log.e(TAG, "Keystore key unavailable; tokens will not be encrypted", e)
            null
        }
    }

    /** Encrypt to "enc:v1:base64(iv)+base64(ciphertext)". Returns null when
     *  input is null/blank or when the Keystore is unavailable. */
    fun encrypt(plain: String?): String? {
        if (plain.isNullOrBlank()) return null
        val key = getOrCreateKey() ?: return null
        return try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, key)
            val iv = cipher.iv.copyOf(IV_BYTES.coerceAtMost(cipher.iv.size))
            val ct = cipher.doFinal(plain.toByteArray(Charsets.UTF_8))
            PREFIX + Base64.encodeToString(iv, Base64.NO_WRAP) +
                ":" + Base64.encodeToString(ct, Base64.NO_WRAP)
        } catch (e: Exception) {
            Log.e(TAG, "Token encryption failed", e)
            null
        }
    }

    /** Decrypt a stored value. Legacy plaintext (no prefix) passes through;
     *  ciphertext that cannot be decrypted returns null. */
    fun decrypt(stored: String?): String? {
        if (stored.isNullOrBlank()) return null
        if (!stored.startsWith(PREFIX)) return stored // legacy plaintext row
        val key = getOrCreateKey() ?: return null
        return try {
            val body = stored.removePrefix(PREFIX)
            val sep = body.indexOf(':')
            if (sep <= 0) return null
            val iv = Base64.decode(body.substring(0, sep), Base64.NO_WRAP)
            val ct = Base64.decode(body.substring(sep + 1), Base64.NO_WRAP)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(GCM_TAG_BITS, iv))
            String(cipher.doFinal(ct), Charsets.UTF_8)
        } catch (e: Exception) {
            Log.e(TAG, "Token decryption failed (key rotated or row corrupt?)", e)
            null
        }
    }
}
