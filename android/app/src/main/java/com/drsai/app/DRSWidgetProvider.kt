package com.drsai

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.RemoteViews

/**
 * DRS AI home-screen widget (v1.39.0, dynamic content v1.40.0).
 *
 * Brand-gradient launcher card: tapping the card body opens the app, the
 * "New chat" chip launches [drsai://newchat] (the JS side resets to
 * a fresh chat on the staged assistant) and the "Models" chip launches
 * [drsai://models].
 *
 * v1.40.0: the card title/subtitle mirror the ACTIVE MODEL SNAPSHOT
 * pushed from JS through [WidgetBridgeModule] (SharedPreferences
 * "drs_widget_state"). With no snapshot the card falls back to the
 * static v1.39 branding, and the system-driven update cycles keep
 * working because buildViews always re-reads the stored snapshot.
 */
class DRSWidgetProvider : AppWidgetProvider() {

  override fun onUpdate(
      context: Context,
      appWidgetManager: AppWidgetManager,
      appWidgetIds: IntArray,
  ) {
    for (appWidgetId in appWidgetIds) {
      appWidgetManager.updateAppWidget(appWidgetId, buildViews(context))
    }
  }

  override fun onAppWidgetOptionsChanged(
      context: Context,
      appWidgetManager: AppWidgetManager,
      appWidgetId: Int,
      newOptions: android.os.Bundle,
  ) {
    appWidgetManager.updateAppWidget(appWidgetId, buildViews(context))
  }

  private fun buildViews(context: Context): RemoteViews {
    val views = RemoteViews(context.packageName, R.layout.drs_widget)

    // Dynamic snapshot (v1.40.0): active model name as the title, its
    // live status as the subtitle. Empty values fall back to the static
    // v1.39 branding so a fresh widget never looks broken.
    val prefs = WidgetBridgeModule.prefs(context)
    val modelName = prefs.getString(WidgetBridgeModule.KEY_MODEL, "") ?: ""
    val statusText = prefs.getString(WidgetBridgeModule.KEY_STATUS, "") ?: ""
    val statusKind = prefs.getString(WidgetBridgeModule.KEY_KIND, "") ?: ""
    if (modelName.isNotBlank()) {
      views.setTextViewText(R.id.drs_widget_title, modelName)
    }
    if (statusText.isNotBlank()) {
      views.setTextViewText(R.id.drs_widget_subtitle, statusText)
      views.setTextColor(R.id.drs_widget_subtitle, statusColor(statusKind))
    }

    // Card body → cold/warm launch of the main activity.
    val openIntent =
        Intent(context, MainActivity::class.java).apply {
          action = Intent.ACTION_MAIN
          addCategory(Intent.CATEGORY_LAUNCHER)
        }
    val openPi =
        PendingIntent.getActivity(
            context,
            REQUEST_OPEN,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
    views.setOnClickPendingIntent(R.id.drs_widget_root, openPi)

    // "New chat" chip → deep link handled by useDeepLinking (resetActiveSession
    // + navigate to Chat). Scoped to our own package so no other app can
    // intercept the VIEW intent.
    views.setOnClickPendingIntent(
        R.id.drs_widget_new_chat,
        deepLinkPendingIntent(context, REQUEST_NEW_CHAT, "drsai://newchat"),
    )

    // "Models" chip → deep link straight to the model browser.
    views.setOnClickPendingIntent(
        R.id.drs_widget_models,
        deepLinkPendingIntent(context, REQUEST_MODELS, "drsai://models"),
    )

    return views
  }

  private fun statusColor(kind: String): Int =
      when (kind) {
        "ready" -> android.graphics.Color.parseColor("#A7F3D0")
        "loading", "downloading" -> android.graphics.Color.parseColor("#FDE68A")
        "generating" -> android.graphics.Color.parseColor("#BFDBFE")
        "error" -> android.graphics.Color.parseColor("#FECACA")
        else -> android.graphics.Color.parseColor("#C8FFFFFF") // idle: default white 78%
      }

  private fun deepLinkPendingIntent(
      context: Context,
      requestCode: Int,
      uri: String,
  ): PendingIntent {
    val intent =
        Intent(Intent.ACTION_VIEW, Uri.parse(uri)).apply {
          `package` = context.packageName
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    return PendingIntent.getActivity(
        context,
        requestCode,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  companion object {
    private const val REQUEST_OPEN = 2001
    private const val REQUEST_NEW_CHAT = 2002
    private const val REQUEST_MODELS = 2003

    /**
     * Re-apply views to every placed instance. Kept for future dynamic
     * content (e.g. model name) pushed from JS via a native module.
     */
    fun refreshAll(context: Context) {
      val manager = AppWidgetManager.getInstance(context)
      val ids =
          manager.getAppWidgetIds(
              ComponentName(context, DRSWidgetProvider::class.java))
      for (id in ids) {
        manager.updateAppWidget(id, DRSWidgetProvider().buildViews(context))
      }
    }
  }
}
