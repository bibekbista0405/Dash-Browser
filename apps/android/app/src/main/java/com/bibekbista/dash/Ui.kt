package com.bibekbista.dash

import android.content.Context
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.widget.TextView
import androidx.core.content.ContextCompat

fun Context.dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
fun Context.color(id: Int): Int = ContextCompat.getColor(this, id)

private val PALETTE = intArrayOf(
    0xFF5B8CFF.toInt(), 0xFF34A853.toInt(), 0xFFE8710A.toInt(), 0xFFA142F4.toInt(),
    0xFFD93025.toInt(), 0xFF12B5CB.toInt(), 0xFFE52592.toInt(), 0xFF7A8B99.toInt(),
)

/** A stable colour per site, so the same site always gets the same badge. */
fun badgeColor(host: String): Int = PALETTE[(host.hashCode() and 0x7fffffff) % PALETTE.size]

/** Round coloured badge with the first letter of the site — DASH has no favicon cache, so nothing is fetched. */
fun TextView.setBadge(host: String) {
    val h = host.removePrefix("www.")
    text = h.take(1).uppercase().ifEmpty { "D" }
    background = GradientDrawable().apply { shape = GradientDrawable.OVAL; setColor(badgeColor(h.ifEmpty { "dash" })) }
    setTextColor(Color.WHITE)
}

/** Small tap feedback: the control shrinks slightly while pressed. Never consumes the touch. */
@android.annotation.SuppressLint("ClickableViewAccessibility")
fun android.view.View.pressable() {
    setOnTouchListener { v, e ->
        when (e.actionMasked) {
            android.view.MotionEvent.ACTION_DOWN -> v.animate().scaleX(0.9f).scaleY(0.9f).setDuration(80).start()
            android.view.MotionEvent.ACTION_UP, android.view.MotionEvent.ACTION_CANCEL -> v.animate().scaleX(1f).scaleY(1f).setDuration(140).start()
        }
        false
    }
}

fun android.view.View.tick() { performHapticFeedback(android.view.HapticFeedbackConstants.CLOCK_TICK) }
