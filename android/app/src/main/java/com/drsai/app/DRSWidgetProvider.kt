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
 * DRS AI home-screen widget (v1.39.0).
 *
 * A static, brand-gradient launcher card: tapping the card body opens the
 * app, the "New chat" chip launches [drsai://newchat] (the JS side resets to
 * a fresh chat on the staged assistant) and the "Models" chip launches
 * [drsai://models]. Content is static, so we keep updatePeriodMillis at 0
 * and only push views on update/delete cycles requested by the system.
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
