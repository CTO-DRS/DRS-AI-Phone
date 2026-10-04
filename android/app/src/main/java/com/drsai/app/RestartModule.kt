package com.drsai

import android.content.Intent
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
    Runtime.getRuntime().exit(0)
  }
}
