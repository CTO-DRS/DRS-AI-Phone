# SEC-04 (audit v1.41.0): R8 is now enabled for release builds
# (enableProguardInReleaseBuilds = true in build.gradle). R8 shrinks and
# obfuscates release bytecode, closing the gap where the shipped APK kept
# full unobfuscated class/method names (easier static reverse engineering,
# larger download).
#
# The rules below keep every code path that crosses the JNI boundary or is
# reached reflectively — those break at RUNTIME (not at build time) when R8
# renames them, so they are pinned explicitly. Everything else (pure Kotlin/
# Java called only from JS via the standard bridge) is kept automatically by
# the consumer rules bundled inside the react-android AAR, which keep all
# NativeModule implementations and their native methods.

# ---------------------------------------------------------------------------
# App's own JNI shim: android/app/src/main/jni/src/hardware_info.cpp exports
# Java_com_drsai_HardwareInfoModule_nativePurgeAll, resolved by EXACT class +
# method name through JNI. The com.drsai packages also carry the download
# and widget Kotlin modules; keeping them whole is cheap (a few classes).
-keep class com.drsai.** { *; }

# ---------------------------------------------------------------------------
# llama.rn (local LLM): C++/JSI bridge (RNLlamaJSI.cpp) and llama.cpp backend
# reach into com.rnllama.RNLlama / RNLlamaModule across the JNI boundary and
# cache method IDs by name at load time.
-keep class com.rnllama.** { *; }

# ---------------------------------------------------------------------------
# onnxruntime-react-native (TTS): module lives in ai.onnxruntime.reactnative
# and drives the ONNX Runtime Java API (ai.onnxruntime.**) which itself binds
# to libonnxruntime via JNI. The published onnxruntime-android AAR bundles
# consumer rules, but keep is repeated here so safety does not depend on the
# dependency's packaging.
-keep class ai.onnxruntime.** { *; }
-keep class ai.onnxruntime.reactnative.** { *; }
-dontwarn ai.onnxruntime.**

# ---------------------------------------------------------------------------
# WatermelonDB: JNI sqlite bridge (com.nozbe.watermelondb.**) plus
# reflection-instantiated model/adapters.
-keep class com.nozbe.watermelondb.** { *; }

# ---------------------------------------------------------------------------
# Reanimated: JNI + worklet runtime (rule also carried by the RN template so
# it stays correct even if the library's consumer rules change).
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# ---------------------------------------------------------------------------
# Gesture handler / screens: constructors and callbacks resolved through the
# bridge and some reflective paths; both libraries are modest in size, so
# keeping them whole trades a few hundred KB for runtime certainty.
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.rnscreens.** { *; }

# ---------------------------------------------------------------------------
# Keychain: integrates with Android Keystore where stack traces and provider
# lookups reference class names reflectively.
-keep class com.oblador.keychain.** { *; }

# ---------------------------------------------------------------------------
# Keep source file + line numbers for readable (symbolicated) release crash
# reports; class/method renaming stays intact.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
