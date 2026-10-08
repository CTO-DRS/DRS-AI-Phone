package com.drsai

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.Process
import android.os.SystemClock
import com.drsai.specs.NativeDiagnosticsSpec
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.annotations.ReactModule
import java.io.File

/**
 * Native side of the in-app diagnostics system.
 *
 * - Persists uncaught Java exceptions to filesDir/diagnostics/ so a crash
 *   that kills the process still leaves a readable trace behind.
 * - Serves the app's own logcat tail (reading the app's own logs needs no
 *   permission on any supported API level) for the shareable report.
 * - Serves a device/app snapshot (model, Android version, ABIs, RAM…).
 */
@ReactModule(name = NativeDiagnosticsSpec.NAME)
class DiagnosticsModule(reactContext: ReactApplicationContext) :
    NativeDiagnosticsSpec(reactContext) {

  @Volatile
  private var crashHandlerInstalled = false

  override fun getName(): String = NativeDiagnosticsSpec.NAME

  override fun installNativeCrashHandler() {
    if (crashHandlerInstalled) {
      return
    }
    crashHandlerInstalled = true
    val previousHandler = Thread.getDefaultUncaughtExceptionHandler()
    val appContext = reactApplicationContext
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      try {
        val dir = File(appContext.filesDir, "diagnostics")
        if (!dir.exists()) {
          dir.mkdirs()
        }
        val versionName = try {
          appContext.packageManager
              .getPackageInfo(appContext.packageName, 0).versionName ?: "?"
        } catch (_: Throwable) {
          "?"
        }
        val file = File(dir, "native_crash_${System.currentTimeMillis()}.txt")
        file.writeText(
            buildString {
              appendLine("time: ${System.currentTimeMillis()}")
              appendLine("app version: $versionName")
              appendLine("thread: ${thread.name}")
              appendLine(throwable.toString())
              appendLine(throwable.stackTraceToString())
              throwable.cause?.let { cause ->
                appendLine("caused by:")
                appendLine(cause.toString())
                appendLine(cause.stackTraceToString())
              }
            }
        )
        // Keep only the newest three crash files.
        dir.listFiles { f -> f.name.startsWith("native_crash_") }
            ?.sortedByDescending { it.name }
            ?.drop(3)
            ?.forEach { it.delete() }
      } catch (_: Throwable) {
        // Never let the diagnostics writer break the crash flow.
      }
      previousHandler?.uncaughtException(thread, throwable)
    }
  }

  override fun getLogcatTail(lines: Double, promise: Promise) {
    val count = lines.toInt().coerceIn(1, 2000)
    Thread {
      try {
        val pid = Process.myPid()
        val process = Runtime.getRuntime().exec(
            arrayOf("logcat", "-d", "-t", count.toString(), "--pid=$pid")
        )
        val finished = process.waitFor(5, java.util.concurrent.TimeUnit.SECONDS)
        val output = if (finished) {
          process.inputStream.bufferedReader().use { it.readText() }
        } else {
          process.destroy()
          ""
        }
        promise.resolve(output.takeLast(60_000))
      } catch (e: Throwable) {
        promise.resolve("")
      }
    }.start()
  }

  override fun getDeviceSnapshot(promise: Promise) {
    try {
      val ctx = reactApplicationContext
      val activityManager =
          ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val memInfo = ActivityManager.MemoryInfo()
      activityManager.getMemoryInfo(memInfo)

      val packageInfo = ctx.packageManager.getPackageInfo(ctx.packageName, 0)
      val crashFiles = File(ctx.filesDir, "diagnostics")
          .listFiles { f -> f.name.startsWith("native_crash_") }
          ?.sortedByDescending { it.name }
          ?.map { it.name }
          ?: emptyList()

      val map = com.facebook.react.bridge.Arguments.createMap()
      map.putString("manufacturer", Build.MANUFACTURER ?: "unknown")
      map.putString("model", Build.MODEL ?: "unknown")
      map.putString("device", Build.DEVICE ?: "unknown")
      map.putString("androidVersion", Build.VERSION.RELEASE ?: "unknown")
      map.putInt("sdkInt", Build.VERSION.SDK_INT)
      map.putArray(
          "abis",
          com.facebook.react.bridge.Arguments.createArray().apply {
            Build.SUPPORTED_ABIS.forEach { pushString(it) }
          },
      )
      map.putDouble("totalMemoryBytes", memInfo.totalMem.toDouble())
      map.putBoolean("isLowRamDevice", activityManager.isLowRamDevice())
      map.putDouble("maxHeapBytes", Runtime.getRuntime().maxMemory().toDouble())
      map.putString("appVersionName", packageInfo.versionName ?: "?")
      map.putInt("appVersionCode", packageInfo.versionCode)
      map.putDouble("uptimeMs", SystemClock.elapsedRealtime().toDouble())
      map.putArray(
          "nativeCrashFiles",
          com.facebook.react.bridge.Arguments.createArray().apply {
            crashFiles.forEach { pushString(it) }
          },
      )
      promise.resolve(map)
    } catch (e: Throwable) {
      promise.reject("SNAPSHOT_ERROR", e.message, e)
    }
  }
}
