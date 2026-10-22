package com.drsai

import android.app.Activity
import android.os.Bundle
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/**
 * Standalone crash-report viewer with its own launcher entry ("DRS AI
 * Report"). Deliberately has ZERO dependencies on React Native, SoLoader,
 * or any app module: it exists for the failure mode where the main app can
 * never survive long enough to open its in-app Diagnostics screen — a
 * startup crash loop. The owner opens this entry instead, reads the newest
 * persisted crash reports (written by CrashForensics / DiagnosticsModule /
 * the JS diagnostics layer), and shares them out via the system share
 * sheet. Its single responsibility is: read a file, show text, share text.
 *
 * The label string is localized (values-ar: «تقرير DRS AI»).
 */
class CrashReportActivity : Activity() {

  override fun onCreate(savedInstanceState: Bundle?) {
    // Forensics are alive regardless of what happened to the main app.
    CrashForensics.breadcrumb("report:activity-onCreate")
    super.onCreate(savedInstanceState)

    val content = buildReportText()
    CrashForensics.breadcrumb("report:content-ready(${content.length})")

    val density = resources.displayMetrics.density
    fun dp(v: Int): Int = (v * density).toInt()

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(16), dp(16), dp(16), dp(16))
    }

    val title = TextView(this).apply {
      text = getString(R.string.report_title)
      textSize = 18f
      setTextColor(0xFFFFFFFF.toInt())
      setPadding(0, 0, 0, dp(8))
    }
    root.addView(title)

    val hint = TextView(this).apply {
      text = getString(R.string.report_hint)
      textSize = 13f
      setTextColor(0xFFBBBBBB.toInt())
      setPadding(0, 0, 0, dp(12))
    }
    root.addView(hint)

    val shareButton = Button(this).apply {
      text = getString(R.string.report_share)
      setOnClickListener { shareReport(content) }
    }
    root.addView(
        shareButton,
        LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ).apply { bottomMargin = dp(12) },
    )

    val scrollView = ScrollView(this).apply {
      isVerticalScrollBarEnabled = true
    }
    val reportView = TextView(this).apply {
      text = content
      textSize = 12f
      setTextColor(0xFFDDDDDD.toInt())
      setTextIsSelectable(true)
      // Monospace keeps stack traces readable.
      typeface = android.graphics.Typeface.MONOSPACE
    }
    scrollView.addView(
        reportView,
        ViewGroup.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT,
        ),
    )
    root.addView(
        scrollView,
        LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, 0,
        ).apply { weight = 1f },
    )

    setContentView(root)
  }

  private fun buildReportText(): String {
    val sb = StringBuilder()
    sb.append(getString(R.string.report_device_header)).append('\n')
    sb.append("app: ").append(packageVersion()).append('\n')
    sb.append("device: ")
        .append(android.os.Build.MANUFACTURER).append(' ')
        .append(android.os.Build.MODEL).append(" (")
        .append(android.os.Build.DEVICE).append(")\n")
    sb.append("android: ")
        .append(android.os.Build.VERSION.RELEASE).append(" (SDK ")
        .append(android.os.Build.VERSION.SDK_INT).append(")\n")
    sb.append("abis: ")
        .append(android.os.Build.SUPPORTED_ABIS.joinToString(", "))
        .append('\n')
    sb.append('\n')

    val files = CrashForensics.reportFiles(applicationContext)
    if (files.isEmpty()) {
      sb.append(getString(R.string.report_empty)).append('\n')
      return sb.toString()
    }
    files.take(3).forEachIndexed { index, file ->
      sb.append("――――――― report ${index + 1}/${minOf(files.size, 3)}: ")
          .append(file.name).append(" ―――――――\n")
      try {
        val text = file.readText()
        sb.append(text)
        // EXTRA_TEXT transport is bounded; cap each report's contribution.
        if (text.length > REPORT_CHAR_CAP) {
          sb.append("\n…(truncated at ").append(REPORT_CHAR_CAP)
              .append(" chars)\n")
        }
      } catch (e: Throwable) {
        sb.append("(unreadable: ").append(e.toString()).append(")\n")
      }
      sb.append('\n')
    }
    return sb.toString()
  }

  private fun packageVersion(): String =
      try {
        val info = packageManager.getPackageInfo(packageName, 0)
        "v${info.versionName} (${info.versionCode})"
      } catch (_: Throwable) {
        "unknown"
      }

  private fun shareReport(content: String) {
    try {
      val capped = content.take(SHARE_CHAR_CAP)
      val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
        type = "text/plain"
        putExtra(android.content.Intent.EXTRA_SUBJECT, "DRS AI crash report")
        putExtra(android.content.Intent.EXTRA_TEXT, capped)
      }
      startActivity(
          android.content.Intent.createChooser(
              intent, getString(R.string.report_share)))
    } catch (_: Throwable) {
      // Sharing must never crash the reporter.
    }
  }

  private companion object {
    const val REPORT_CHAR_CAP = 200_000
    const val SHARE_CHAR_CAP = 400_000
  }
}
