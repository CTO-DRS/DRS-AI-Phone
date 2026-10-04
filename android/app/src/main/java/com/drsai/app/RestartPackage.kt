package com.drsai

import com.facebook.react.TurboReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.drsai.specs.NativeRestartSpec

class RestartPackage : TurboReactPackage() {
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? {
    return if (name == NativeRestartSpec.NAME) {
      RestartModule(reactContext)
    } else {
      null
    }
  }

  override fun getReactModuleInfoProvider(): ReactModuleInfoProvider {
    return ReactModuleInfoProvider {
      mapOf(
          NativeRestartSpec.NAME to
              ReactModuleInfo(
                  NativeRestartSpec.NAME,
                  NativeRestartSpec.NAME,
                  false, // canOverrideExistingModule
                  false, // needsEagerInit
                  false, // hasConstants
                  false, // isCxxModule
                  true   // isTurboModule
              )
      )
    }
  }
}
