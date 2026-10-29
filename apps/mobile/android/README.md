# Android app

This Kotlin WebView shell loads the shared ZOVARA origin, so account state and business rules remain in the common services. It includes permissions, origin allowlisting, file selection, and camera/microphone permission mediation. Production deployment should use an HTTPS `zovaraWebUrl` property.

```sh
cd apps/mobile/android
gradle assembleDebug -PzovaraWebUrl=https://your-zovara-origin.example/
```

Requirements: compatible JDK, Gradle/Android Gradle Plugin downloads, Android SDK platform 35, and network access for dependencies. This environment did not build or sign an APK/AAB; no binary is claimed. Configure a release signing key outside version control before creating an AAB.
