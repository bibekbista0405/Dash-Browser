package com.bibekbista.dash

import android.animation.ValueAnimator
import android.graphics.Color
import android.graphics.PorterDuff
import android.graphics.Typeface
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

/**
 * First-run welcome: three quiet pages. Welcome, your look and search engine, ready.
 * Whatever it asks for is applied for real when you finish.
 */
class Intro(private val a: MainActivity, private val parent: ViewGroup, private val onFinish: (themeChanged: Boolean) -> Unit) {
    private val root = FrameLayout(a)
    private val pager = FrameLayout(a)
    private val dots = LinearLayout(a)
    private val next = TextView(a)

    private var step = 0
    private var finishing = false
    private val previousTheme = a.store.theme
    private var theme = a.store.theme
    private var engine = a.store.searchEngine

    private val bg = Color.parseColor("#0B0D10")
    private val dim = Color.parseColor("#98A0AA")
    private val accent = Color.parseColor("#5B8CFF")
    private val field = Color.parseColor("#1A1E24")
    private val last = 2

    fun showing() = root.parent != null && !finishing

    /** Back button: previous page; returns false when already on the first. */
    fun back(): Boolean { if (step <= 0) return false; go(step - 1); return true }

    fun start() {
        root.setBackgroundColor(bg); root.isClickable = true; root.isFocusable = true
        val column = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL }
        column.addView(pager, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f))

        dots.apply { orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER }
        for (i in 0..last) dots.addView(View(a).apply { setBackgroundResource(R.drawable.bg_circle) },
            LinearLayout.LayoutParams(a.dp(8), a.dp(8)).apply { setMargins(a.dp(4), 0, a.dp(4), 0) })
        column.addView(dots, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply { bottomMargin = a.dp(20) })

        next.apply {
            textSize = 16f; setTextColor(Color.WHITE); setTypeface(null, Typeface.BOLD); gravity = Gravity.CENTER
            setBackgroundResource(R.drawable.bg_btn_primary)
            setOnClickListener { if (step >= last) finish() else go(step + 1) }
        }
        column.addView(next, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, a.dp(54)).apply { setMargins(a.dp(24), 0, a.dp(24), a.dp(28)) })

        root.addView(column, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        parent.addView(root, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        root.setOnApplyWindowInsetsListener { v, insets ->
            @Suppress("DEPRECATION") v.setPadding(0, insets.systemWindowInsetTop, 0, insets.systemWindowInsetBottom); insets
        }
        root.requestApplyInsets()
        show(0, animate = false)
    }

    private fun go(to: Int) {
        val forward = to > step
        step = to
        show(to, animate = true, forward = forward)
    }

    private fun show(to: Int, animate: Boolean, forward: Boolean = true) {
        val old = if (pager.childCount > 0) pager.getChildAt(pager.childCount - 1) else null
        val page = when (to) { 0 -> welcome(); 1 -> customize(); else -> ready() }
        pager.addView(page, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        if (animate) {
            val shift = a.dp(24).toFloat() * (if (forward) 1 else -1)
            old?.animate()?.alpha(0f)?.translationX(-shift)?.setDuration(160)?.withEndAction { pager.removeView(old) }?.start()
            page.alpha = 0f; page.translationX = shift
            page.animate().alpha(1f).translationX(0f).setDuration(280).setInterpolator(DecelerateInterpolator(2f)).start()
        } else old?.let { pager.removeView(it) }
        next.text = when (to) { 0 -> "Get started"; last -> "Start browsing"; else -> "Continue" }
        updateDots()
    }

    private fun updateDots() {
        for (i in 0 until dots.childCount) {
            val d = dots.getChildAt(i)
            d.background.mutate().setColorFilter(if (i == step) accent else Color.parseColor("#363C45"), PorterDuff.Mode.SRC_IN)
            val lp = d.layoutParams as LinearLayout.LayoutParams
            val w = if (i == step) a.dp(20) else a.dp(8)
            ValueAnimator.ofInt(lp.width, w).apply { duration = 200; addUpdateListener { lp.width = it.animatedValue as Int; d.layoutParams = lp } }.start()
        }
    }

    private fun finish() {
        if (finishing) return
        finishing = true
        a.store.theme = theme
        a.store.searchEngine = engine
        a.store.introDone = true
        val themeChanged = theme != previousTheme
        root.animate().alpha(0f).setDuration(260).withEndAction { parent.removeView(root); onFinish(themeChanged) }.start()
    }

    // ---------- pages ----------
    private fun column(): LinearLayout = LinearLayout(a).apply {
        orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER_HORIZONTAL or Gravity.CENTER_VERTICAL
        setPadding(a.dp(32), a.dp(16), a.dp(32), a.dp(16))
    }

    private fun heading(text: String) = TextView(a).apply { this.text = text; textSize = 26f; setTextColor(Color.WHITE); setTypeface(null, Typeface.BOLD); gravity = Gravity.CENTER }
    private fun body(text: String, top: Int = 10) = TextView(a).apply { this.text = text; textSize = 15f; setTextColor(dim); gravity = Gravity.CENTER; setLineSpacing(0f, 1.2f); setPadding(0, a.dp(top), 0, 0) }

    private fun welcome(): View {
        val col = column()
        val logo = ImageView(a).apply { setImageResource(R.drawable.logo_tile); alpha = 0f; scaleX = 0.85f; scaleY = 0.85f }
        col.addView(logo, LinearLayout.LayoutParams(a.dp(96), a.dp(96)))
        logo.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(500).setInterpolator(DecelerateInterpolator(2f)).start()
        col.addView(heading("Welcome to DASH").apply { setPadding(0, a.dp(28), 0, 0) })
        col.addView(body("A fast browser that keeps your browsing to yourself."))
        val points = listOf("Blocks ads and trackers", "No account, no tracking", "Your data stays on this phone")
        points.forEachIndexed { i, p ->
            val t = TextView(a).apply { text = p; textSize = 15f; setTextColor(Color.parseColor("#E3E6EA")); gravity = Gravity.CENTER; setPadding(0, a.dp(if (i == 0) 28 else 10), 0, 0); alpha = 0f }
            col.addView(t)
            t.animate().alpha(1f).setStartDelay(350L + i * 120L).setDuration(350).start()
        }
        return col
    }

    private fun chip(text: String, selected: Boolean, onClick: () -> Unit): TextView = TextView(a).apply {
        this.text = text; textSize = 14f; gravity = Gravity.CENTER; setTypeface(null, Typeface.BOLD)
        setTextColor(Color.WHITE)
        setBackgroundResource(if (selected) R.drawable.bg_btn_primary else R.drawable.bg_chip)
        if (!selected) background.mutate().setColorFilter(field, PorterDuff.Mode.SRC_IN)
        setOnClickListener { onClick() }
    }

    private fun customize(): View {
        val col = column()
        col.addView(heading("Make it yours"))
        col.addView(body("You can change these any time in Settings."))
        fun label(s: String) = TextView(a).apply { text = s; textSize = 13f; setTextColor(dim); setTypeface(null, Typeface.BOLD); setPadding(a.dp(4), a.dp(26), 0, a.dp(8)) }
        val wide = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)

        col.addView(label("Theme"), wide)
        val themeRow = LinearLayout(a).apply { orientation = LinearLayout.HORIZONTAL }
        fun fillTheme() {
            themeRow.removeAllViews()
            listOf("dark" to "Dark", "light" to "Light", "system" to "System").forEach { (key, name) ->
                themeRow.addView(chip(name, theme == key) { theme = key; fillTheme() }, LinearLayout.LayoutParams(0, a.dp(46), 1f).apply { setMargins(a.dp(3), 0, a.dp(3), 0) })
            }
        }
        fillTheme(); col.addView(themeRow, wide)

        col.addView(label("Search with"), wide)
        val engines = LinearLayout(a).apply { orientation = LinearLayout.VERTICAL }
        fun fillEngines() {
            engines.removeAllViews()
            Omnibox.ENGINES.keys.forEach { name ->
                val row = LinearLayout(a).apply {
                    orientation = LinearLayout.HORIZONTAL; gravity = Gravity.CENTER_VERTICAL; setPadding(a.dp(16), 0, a.dp(16), 0)
                    setBackgroundResource(R.drawable.bg_chip); background.mutate().setColorFilter(if (engine == name) Color.parseColor("#22305A") else field, PorterDuff.Mode.SRC_IN)
                    setOnClickListener { engine = name; fillEngines() }
                }
                row.addView(TextView(a).apply { text = name; textSize = 15f; setTextColor(Color.WHITE) }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
                if (engine == name) row.addView(ImageView(a).apply { setImageResource(R.drawable.ic_check); setColorFilter(accent, PorterDuff.Mode.SRC_IN) }, LinearLayout.LayoutParams(a.dp(20), a.dp(20)))
                engines.addView(row, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, a.dp(46)).apply { setMargins(a.dp(3), a.dp(3), a.dp(3), a.dp(3)) })
            }
        }
        fillEngines(); col.addView(engines, wide)
        return android.widget.ScrollView(a).apply { isVerticalScrollBarEnabled = false; isFillViewport = true; addView(col) }
    }

    private fun ready(): View {
        val col = column()
        val badge = ImageView(a).apply {
            setImageResource(R.drawable.ic_check); setColorFilter(Color.WHITE, PorterDuff.Mode.SRC_IN); setPadding(a.dp(20), a.dp(20), a.dp(20), a.dp(20))
            setBackgroundResource(R.drawable.bg_circle); background.mutate().setColorFilter(accent, PorterDuff.Mode.SRC_IN); scaleX = 0.6f; scaleY = 0.6f; alpha = 0f
        }
        col.addView(badge, LinearLayout.LayoutParams(a.dp(84), a.dp(84)))
        badge.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(420).setInterpolator(DecelerateInterpolator(2f)).start()
        col.addView(heading("You're all set").apply { setPadding(0, a.dp(28), 0, 0) })
        col.addView(body("Type a search or a web address in the bar at the top to begin."))
        return col
    }
}
