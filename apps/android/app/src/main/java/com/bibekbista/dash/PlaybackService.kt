package com.bibekbista.dash

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.IBinder
import android.os.PowerManager

/**
 * Keeps DASH running while a page plays audio and the screen is off or you are in another app.
 * It shows a media notification (also on the lock screen) with play/pause and stop.
 * It plays nothing itself and collects nothing; it only holds the process awake while you listen.
 */
class PlaybackService : Service() {
    companion object {
        var onStop: (() -> Unit)? = null
        var onToggle: (() -> Unit)? = null
        var title: String = ""
        var playing: Boolean = true
        private var instance: PlaybackService? = null
        const val ACTION_STOP = "com.bibekbista.dash.STOP_AUDIO"
        const val ACTION_TOGGLE = "com.bibekbista.dash.TOGGLE_AUDIO"
        private const val CHANNEL = "dash_playback"

        /** Called by the browser when the page title or play state changes. */
        fun update(newTitle: String? = null, isPlaying: Boolean? = null) {
            if (newTitle != null) title = newTitle
            if (isPlaying != null) playing = isPlaying
            instance?.refresh()
        }
    }

    private var session: MediaSession? = null
    private var wake: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        instance = this
        session = MediaSession(this, "DASH").apply {
            setCallback(object : MediaSession.Callback() {
                override fun onPlay() { onToggle?.invoke() }
                override fun onPause() { onToggle?.invoke() }
                override fun onStop() { PlaybackService.onStop?.invoke(); stopSelf() }
            })
            isActive = true
        }
        try {
            wake = (getSystemService(Context.POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "dash:playback")
                .apply { setReferenceCounted(false); acquire(6 * 60 * 60 * 1000L) }
        } catch (e: Exception) { /* the audio still plays, the phone may just sleep sooner */ }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> { onStop?.invoke(); stopSelf(); return START_NOT_STICKY }
            ACTION_TOGGLE -> { onToggle?.invoke(); return START_NOT_STICKY }
        }
        getSystemService(NotificationManager::class.java)
            .createNotificationChannel(NotificationChannel(CHANNEL, "Audio playing", NotificationManager.IMPORTANCE_LOW).apply { setShowBadge(false) })
        try { startForeground(7, build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK) } catch (e: Exception) { stopSelf() }
        refresh()
        return START_NOT_STICKY
    }

    private fun build(): Notification {
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_IMMUTABLE)
        fun act(code: Int, action: String) = PendingIntent.getService(this, code, Intent(this, PlaybackService::class.java).setAction(action), PendingIntent.FLAG_IMMUTABLE)
        val toggle = Notification.Action.Builder(Icon.createWithResource(this, if (playing) R.drawable.ic_pause else R.drawable.ic_play), if (playing) "Pause" else "Play", act(1, ACTION_TOGGLE)).build()
        val stop = Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_close), "Stop", act(2, ACTION_STOP)).build()
        val b = Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_shield)
            .setContentTitle(title.ifBlank { "Playing in DASH" })
            .setContentText("DASH")
            .setContentIntent(open).setOngoing(true).setVisibility(Notification.VISIBILITY_PUBLIC)
            .addAction(toggle).addAction(stop)
        session?.let { b.setStyle(Notification.MediaStyle().setMediaSession(it.sessionToken).setShowActionsInCompactView(0, 1)) }
        return b.build()
    }

    private fun refresh() {
        session?.setMetadata(MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE, title.ifBlank { "DASH" }).build())
        session?.setPlaybackState(PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_PLAY_PAUSE or PlaybackState.ACTION_STOP)
            .setState(if (playing) PlaybackState.STATE_PLAYING else PlaybackState.STATE_PAUSED, PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1f).build())
        try { getSystemService(NotificationManager::class.java).notify(7, build()) } catch (e: Exception) { /* not shown */ }
    }

    override fun onDestroy() {
        instance = null
        try { session?.release() } catch (e: Exception) { /* already released */ }
        try { if (wake?.isHeld == true) wake?.release() } catch (e: Exception) { /* already released */ }
        super.onDestroy()
    }
}
