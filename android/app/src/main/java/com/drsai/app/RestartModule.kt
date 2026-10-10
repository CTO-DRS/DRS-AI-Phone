package com.drsai

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.drsai.specs.NativeRestartSpec

/**
 * Restarts the app process. Used after I18nManager.forceRTL() changes the
 * layout direction (language switch to/from Arabic, Persian, Hebrew) —
 * Android only applies the new direction on the next activity creation.
 *
 * v1.41.0 — deterministic relaunch. The previous implementation raced
 * ActivityManager: finish() + startActivity() + exit(0) after 150 ms can
 * drop the relaunch entirely when the process dies before the pending
 * activity start is scheduled. When that happens the app "simply closes"
 * with no crash dialog — the documented failure mode in the old comment,
 * and the only silent-close path in the codebase, which is exactly how
 * first-launch-after-install deaths present. The restart is now
 * scheduled through AlarmManager (held by the system service, so it
 * survives process death): the process exits cleanly first, and the
 * alarm relaunches the activity in a fresh process moments later. The
 * direct startActivity is kept as the fast path; the intent flags are
 * idempotent (singleTask + CLEAR_TASK), so a double delivery cannot
 * stack two instances.
 */
@ReactModule(name = NativeRestartSpec.NAME)
class RestartModule(reactContext: ReactApplicationContext) :
    NativeRestartSpec(reactContext) {

  override fun restart() {
    val activity = currentActivity ?: return
    val context: Context = activity.applicationContext
    val intent = Intent(activity, activity.javaClass)
    intent.addFlags(
        Intent.FLAG_ACTIVITY_NO_ANIMATION or
            Intent.FLAG_ACTIVITY_CLEAR_TASK or
            Intent.FLAG_ACTIVITY_NEW_TASK
    )

    // Belt: system-held relaunch that survives the process exit below.
    // Inexact setAndAllowWhileIdle needs no special permission; setExact
    // throws SecurityException without the SCHEDULE_EXACT_ALARM grant on
    // Android 12+, so it is only attempted opportunistically.
    try {
      val pending = PendingIntent.getActivity(
          context,
          RESTART_REQUEST_CODE,
          intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
      )
      val alarm = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
      val triggerAt = SystemClock.elapsedRealtime() + ALARM_RELAUNCH_DELAY_MS
      try {
        alarm.setExactAndAllowWhileIdle(
            AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pending)
      } catch (_: SecurityException) {
        alarm.setAndAllowWhileIdle(
            AlarmManager.ELAPSED_REALTIME_WAKEUP, triggerAt, pending)
      }
    } catch (_: Throwable) {
      // Alarm scheduling is best-effort; the direct path below remains.
    }

    // Suspenders: also enqueue the start while the process is still alive
    // (fast path — no alarm-batching delay on the ROMs that honor it).
    activity.finish()
    activity.startActivity(intent)

    // Exit cleanly after both scheduling paths had their moment. The
    // alarm fires after the process is gone, so the relaunch happens
    // from the system side in a fresh process — no race, no drop.
    Handler(Looper.getMainLooper()).postDelayed(
        { Runtime.getRuntime().exit(0) }, EXIT_DELAY_MS)
  }

  companion object {
    private const val RESTART_REQUEST_CODE = 1001
    private const val EXIT_DELAY_MS = 150L
    private const val ALARM_RELAUNCH_DELAY_MS = 800L
  }
}
