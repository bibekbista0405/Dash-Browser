package com.bibekbista.dash

import android.graphics.Color
import android.graphics.PorterDuff
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView

data class Row(
    val title: String,
    val subtitle: String = "",
    val badgeHost: String? = null,   // coloured letter badge for this site
    val iconRes: Int = 0,            // or a round icon
    val trailingRes: Int = 0,
    val header: Boolean = false,
    val onClick: (() -> Unit)? = null,
    val onTrailing: (() -> Unit)? = null,
    val onLong: (() -> Unit)? = null,
)

class RowAdapter : RecyclerView.Adapter<RowAdapter.VH>() {
    private var rows: List<Row> = emptyList()

    fun submit(list: List<Row>) { rows = list; notifyDataSetChanged() }

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        val badge: TextView = v.findViewById(R.id.badge)
        val icon: ImageView = v.findViewById(R.id.icon)
        val title: TextView = v.findViewById(R.id.title)
        val subtitle: TextView = v.findViewById(R.id.subtitle)
        val trailing: ImageView = v.findViewById(R.id.trailing)
    }

    override fun getItemViewType(position: Int) = if (rows[position].header) 1 else 0

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val v = LayoutInflater.from(parent.context).inflate(R.layout.item_row, parent, false)
        return VH(v)
    }

    override fun getItemCount() = rows.size

    override fun onBindViewHolder(h: VH, position: Int) {
        val r = rows[position]
        val ctx = h.itemView.context
        h.title.text = r.title
        h.subtitle.text = r.subtitle
        h.subtitle.visibility = if (r.subtitle.isEmpty()) View.GONE else View.VISIBLE
        if (r.header) {
            h.itemView.minimumHeight = ctx.dp(44)
            h.badge.visibility = View.GONE; h.icon.visibility = View.GONE; h.trailing.visibility = View.GONE
            h.title.setTextColor(ctx.color(R.color.dash_accent)); h.title.textSize = 13f
            h.title.setTypeface(null, android.graphics.Typeface.BOLD)
            h.itemView.setOnClickListener(null); h.itemView.setOnLongClickListener(null); h.itemView.isClickable = false
            return
        }
        h.itemView.minimumHeight = ctx.dp(64)
        h.title.setTextColor(ctx.color(R.color.dash_text)); h.title.textSize = 16f
        h.title.setTypeface(null, android.graphics.Typeface.NORMAL)
        if (r.badgeHost != null) {
            h.badge.visibility = View.VISIBLE; h.icon.visibility = View.GONE; h.badge.setBadge(r.badgeHost)
        } else {
            h.badge.visibility = View.GONE; h.icon.visibility = View.VISIBLE
            h.icon.setImageResource(r.iconRes)
        }
        if (r.trailingRes != 0) {
            h.trailing.visibility = View.VISIBLE; h.trailing.setImageResource(r.trailingRes)
            h.trailing.setColorFilter(ctx.color(R.color.dash_dim), PorterDuff.Mode.SRC_IN)
            h.trailing.setOnClickListener { r.onTrailing?.invoke() }
        } else h.trailing.visibility = View.GONE
        h.itemView.isClickable = true
        h.itemView.setOnClickListener { r.onClick?.invoke() }
        h.itemView.setOnLongClickListener { r.onLong?.invoke(); r.onLong != null }
    }
}

class TabCardAdapter(
    private val onSelect: (Tab) -> Unit,
    private val onClose: (Tab) -> Unit,
) : RecyclerView.Adapter<TabCardAdapter.VH>() {
    private var items: List<Tab> = emptyList()
    private var currentTab: Tab? = null

    fun tabAt(i: Int): Tab? = items.getOrNull(i)

    fun submit(list: List<Tab>, current: Tab?) { items = list; currentTab = current; notifyDataSetChanged() }

    class VH(v: View) : RecyclerView.ViewHolder(v) {
        val badge: TextView = v.findViewById(R.id.cardBadge)
        val title: TextView = v.findViewById(R.id.cardTitle)
        val close: ImageView = v.findViewById(R.id.cardClose)
        val thumb: ImageView = v.findViewById(R.id.cardThumb)
        val thumbLabel: TextView = v.findViewById(R.id.cardThumbLabel)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) =
        VH(LayoutInflater.from(parent.context).inflate(R.layout.item_tab_card, parent, false))

    override fun getItemCount() = items.size

    override fun onBindViewHolder(h: VH, position: Int) {
        val t = items[position]
        val ctx = h.itemView.context
        val host = Omnibox.hostOf(t.url)
        h.badge.setBadge(host)
        h.title.text = if (t.title.isNotBlank()) t.title else if (t.url.isEmpty()) "Home" else host
        h.itemView.setBackgroundResource(
            when { t === currentTab -> R.drawable.bg_card_selected; t.isPrivate -> R.drawable.bg_card_private; else -> R.drawable.bg_card }
        )
        val bmp = t.thumb
        if (bmp != null && !t.isPrivate) {
            h.thumb.setImageBitmap(bmp); h.thumbLabel.text = ""
        } else {
            h.thumb.setImageDrawable(null)
            h.thumb.setBackgroundColor(if (t.isPrivate) ctx.color(R.color.dash_private_bg) else ctx.color(R.color.dash_bg))
            h.thumbLabel.text = if (t.isPrivate) "Incognito tab" else if (t.url.isEmpty()) "Home" else host
        }
        h.itemView.setOnClickListener { onSelect(t) }
        h.close.setColorFilter(ctx.color(R.color.dash_dim), PorterDuff.Mode.SRC_IN)
        h.close.setOnClickListener { onClose(t) }
    }
}
