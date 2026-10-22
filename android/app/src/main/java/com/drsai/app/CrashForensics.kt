package com.drsai

import android.content.Context
import android.os.Build
import android.os.Process
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Process-wide crash forensics, installed at the earliest possible moment
 * (MainApplication.attachBaseContext) so ANY uncaught Java exception on ANY
 * thread — including native-module threads during the pre-React startup
 * window — is persisted before the process dies.
 *
 * Why this exists: the in-app Diagnostics screen installs its own handler
 * from JS (DiagnosticsModule.installNativeCrashHandler), which is only
 * reachable after React is fully up. A startup death in that window left no
 * trace the owner could retrieve — the app never lived long enough to open
 * the screen. This closes both gaps:
 *
 *  1. Capture: the default UncaughtExceptionHandler is replaced here, before
 *     SoLoader/new-arch load, so every thread is covered from process birth.
 *     Each report also embeds a logcat tail of our own pid — `logcat -d` of
 *     the app's own logs needs no permission on any supported API level —
 *     which is what captures NATIVE death signals (Fatal signal / Abort
 *     message) that a Java handler can never see in its own stack.
 *  2. Retrieval: CrashReportActivity (separate launcher entry, zero React
 *     dependencies) reads these files and shares them, even when the main
 *     app can never reach its first render.
 *
 * The report is written FIRST and the logcat tail is appended afterwards,
 * so a hung logcat can never cost us the base report. Nothing here may
 * import React classes, and every path is defensive — forensics must never
 * be the crash.
 */
object CrashForensics {

  private const val DIR_NAME = "diagnostics"
  private const val FILE_PREFIX = "native_crash_"
  private const val MAX_FILES = 5
  private const val MAX_BREADCRUMBS = 40
  private const val LOGCAT_LINES = 400
  private const val LOGCAT_TIMEOUT_MS = 2500L

  @Volatile
  private var installed = false

  private val breadcrumbs = ArrayDeque<String>()

  /** Record a startup milestone. Synchronized, capped, never throws. */
  @Synchronized
  fun breadcrumb(tag: String) {
    try {
      if (breadcrumbs.size >= MAX_BREADCRUMBS) {
        breadcrumbs.removeFirst()
      }
      breadcrumbs.addLast("+${System.currentTimeMillis() % 100000} $tag")
    } catch (_: Throwable) {
      // Forensics must never be the crash.
    }
  }

  /**
   * Installs the process-wide handler. Idempotent: the first call wins, and
   * the JS-triggered Diagnostics path routes here so both entry points share
   * one handler and one file format.
   */
  @Synchronized
  fun install(context: Context) {
    if (installed) {
      return
    }
    installed = true
    val appContext = context.applicationContext
    val previous = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      try {
        writeReport(appContext, thread, throwable)
      } catch (_: Throwable) {
        // Never let the forensics writer break the crash flow.
      }
      previous?.uncaughtException(thread, throwable)
    }
  }

  /**
   * Records a caught (non-fatal) startup failure with the same report
   * format — used when Application.onCreate must swallow an exception to
   * keep the process (and therefore CrashReportActivity) alive.
   */
  fun recordStartupFailure(context: Context, throwable: Throwable) {
    try {
      writeReport(
          context,
          Thread.currentThread(),
          throwable,
          headerNote = "caught startup failure (swallowed to keep forensics alive)",
      )
    } catch (_: Throwable) {
      // Forensics must never be the crash.
    }
  }

  private fun writeReport(
      appContext: Context,
      thread: Thread,
      throwable: Throwable,
      headerNote: String? = null,
  ) {
    val dir = File(appContext.filesDir, DIR_NAME)
    if (!dir.exists()) {
      dir.mkdirs()
    }
    val stamp = System.currentTimeMillis()
    val file = File(dir, "$FILE_PREFIX$stamp.txt")

    file.writeText(buildBaseReport(appContext, thread, throwable, stamp, headerNote))

    // Append the logcat tail AFTER the base report is safely on disk.
    try {
      val tail = readOwnLogcatTail()
      if (tail.isNotEmpty()) {
        file.appendText("\n\n=== logcat tail (pid=${Process.myPid()}) ===\n$tail")
      }
    } catch (_: Throwable) {
      // Logcat is a bonus, not a requirement.
    }

    // Mirror to the app-specific external dir so the report survives even
    // if internal storage forensics are needed over USB. No permission is
    // required for getExternalFilesDir on API 19+.
    try {
      val extDir = appContext.getExternalFilesDir(null)
      if (extDir != null) {
        val mirror = File(File(extDir, DIR_NAME), file.name)
        if (!mirror.parentFile!!.exists()) {
          mirror.parentFile!!.mkdirs()
        }
        mirror.writeText(file.readText())
      }
    } catch (_: Throwable) {
      // Mirror is a bonus, not a requirement.
    }

    pruneOldReports(dir)
  }

  private fun buildBaseReport(
      appContext: Context,
      thread: Thread,
      throwable: Throwable,
      stamp: Long,
      headerNote: String?,
  ): String = buildString {
    val time =
        try {
          SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(Date(stamp))
        } catch (_: Throwable) {
          "t=$stamp"
        }
    appendLine("=== DRS AI crash report ===")
    if (headerNote != null) {
      appendLine("note: $headerNote")
    }
    appendLine("time: $time")
    appendLine("app: ${versionLabel(appContext)}")
    appendLine(
        "device: ${Build.MANUFACTURER} ${Build.MODEL} (${Build.DEVICE})")
    appendLine(
        "android: ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT})")
    appendLine("abis: ${Build.SUPPORTED_ABIS.joinToString(", ")}")
    appendLine("pid: ${Process.myPid()}  thread: ${thread.name}")
    appendLine()
    appendLine("--- breadcrumbs (startup milestones) ---")
    synchronized(breadcrumbs) {
      if (breadcrumbs.isEmpty()) {
        appendLine("(none recorded)")
      } else {
        breadcrumbs.forEach { appendLine(it) }
      }
    }
    appendLine()
    appendLine("--- throwable ---")
    appendLine(throwable.toString())
    appendLine(throwable.stackTraceToString())
    var cause = throwable.cause
    var depth = 0
    while (cause != null && depth < 8) {
      appendLine("caused by:")
      appendLine(cause.toString())
      appendLine(cause.stackTraceToString())
      cause = cause.cause
      depth++
    }
  }

  private fun versionLabel(appContext: Context): String =
      try {
        val info = appContext.packageManager.getPackageInfo(appContext.packageName, 0)
        "v${info.versionName} (${info.versionCode})"
      } catch (_: Throwable) {
        "unknown"
      }

  /**
   * Reads the tail of our own process's logcat. Needs no permission on any
   * supported API level (same trick the Diagnostics screen uses). Bounded
   * by line count and wall-clock timeout so a wedged logd cannot hold the
   * dying process hostage.
   */
  private fun readOwnLogcatTail(): String {
    val process = Runtime.getRuntime().exec(
        arrayOf(
            "logcat", "-d", "-t", LOGCAT_LINES.toString(),
            "--pid=${Process.myPid()}",
        ),
    )
    val finished = process.waitFor(LOGCAT_TIMEOUT_MS, java.util.concurrent.TimeUnit.MILLISECONDS)
    if (!finished) {
      process.destroy()
      return ""
    }
    return process.inputStream.bufferedReader().use { it.readText() }
        .takeLast(120_000)
  }

  private fun pruneOldReports(dir: File) {
    dir.listFiles { f -> f.name.startsWith(FILE_PREFIX) }
        ?.sortedByDescending { it.name }
        ?.drop(MAX_FILES)
        ?.forEach { it.delete() }
  }

  /** Newest-first crash report files, internal dir. For CrashReportActivity. */
  fun reportFiles(appContext: Context): List<File> =
      try {
        File(appContext.filesDir, DIR_NAME)
            .listFiles { f -> f.name.startsWith(FILE_PREFIX) }
            ?.sortedByDescending { it.name }
            ?: emptyList()
      } catch (_: Throwable) {
        emptyList()
      }
}
