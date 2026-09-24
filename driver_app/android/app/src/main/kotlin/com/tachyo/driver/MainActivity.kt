package com.tachyo.driver

import io.flutter.embedding.android.FlutterFragmentActivity

// FlutterFragmentActivity, not FlutterActivity — local_auth's Android
// biometric prompt (BiometricPrompt API) requires a FragmentActivity to
// attach to; this is a hard requirement of the plugin, not a style choice.
class MainActivity : FlutterFragmentActivity()
