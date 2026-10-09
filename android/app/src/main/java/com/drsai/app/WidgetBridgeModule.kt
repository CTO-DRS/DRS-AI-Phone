package com.drsai

import android.content.Context
import com.drsai.specs.NativeWidgetBridgeSpec
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule

/**
 * JS → widget state pump (v1.40.0).
 *
 * Persists the active-model snapshot in SharedPreferences and repaints
 * every placed [DRSWidgetProvider] instance. Cheap enough to call on
 * every meaningful state transition; the JS layer gates on snapshot
 * changes so streaming tokens never spam the launcher.
 */
@ReactModule(name = NativeWidgetBridgeSpec.NAME)
class WidgetBridgeModule(reactContext: ReactApplicationContext) :
    NativeWidgetBridgeSpec(reactContext) {

  override fun getName(): String = NativeWidgetBridgeSpec.NAME

  override fun updateWidget(
      modelName: String,
      statusText: String,
      statusKind: String,
      promise: Promise,
  ) {
    try {
      val context: Context = reactApplicationContext
      prefs(context)
          .edit()
          .putString(KEY_MODEL, modelName)
          .putString(KEY_STATUS, statusText)
          .putString(KEY_KIND, statusKind)
          .apply()
      DRSWidgetProvider.refreshAll(context)
      promise.resolve(null)
    } catch (t: Throwable) {
      // A widget repaint must never take the app down (e.g. launcher
      // process contention on some OEM skins).
      promise.reject("WIDGET_UPDATE_FAILED", t)
    }
  }

  override fun clearWidget(promise: Promise) {
    try {
      val context: Context = reactApplicationContext
      prefs(context).edit().clear().apply()
      DRSWidgetProvider.refreshAll(context)
      promise.resolve(null)
    } catch (t: Throwable) {
      promise.reject("WIDGET_CLEAR_FAILED", t)
    }
  }

  companion object {
    const val PREFS = "drs_widget_state"
    const val KEY_MODEL = "model_name"
    const val KEY_STATUS = "status_text"
    const val KEY_KIND = "status_kind"

    fun prefs(context: Context) =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
  }
}
