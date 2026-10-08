package com.drsai

import android.content.Intent
import android.os.Handler
import android.os.Looper
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import com.drsai.specs.NativeRestartSpec

/**
 * Restarts the app process. Used after I18nManager.forceRTL() changes the
 * layout direction (language switch to/from Arabic, Persian, Hebrew) —
 * Android only applies the new direction on the next activity creation.
 */
@ReactModule(name = NativeRestartSpec.NAME)
class RestartModule(reactContext: ReactApplicationContext) :
    NativeRestartSpec(reactContext) {

  override fun restart() {
    val activity = currentActivity ?: return
    val intent = Intent(activity, activity.javaClass)
    intent.addFlags(
        Intent.FLAG_ACTIVITY_NO_ANIMATION or
            Intent.FLAG_ACTIVITY_CLEAR_TASK or
            Intent.FLAG_ACTIVITY_NEW_TASK
    )
    activity.finish()
    activity.startActivity(intent)
    // Give the system time to process the activity start before killing
    // the process. Exiting synchronously races ActivityManager: if the
    // process dies before the new activity is scheduled, the relaunch is
    // dropped and the app simply closes (or loops) instead of restarting.
    Handler(Looper.getMainLooper()).postDelayed({ Runtime.getRuntime().exit(0) }, 150)
  }
}
