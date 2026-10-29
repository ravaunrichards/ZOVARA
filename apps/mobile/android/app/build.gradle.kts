plugins { id("com.android.application"); id("org.jetbrains.kotlin.android") }
val webUrl = providers.gradleProperty("zovaraWebUrl").orElse("http://10.0.2.2:3000/").get()
android {
    namespace = "com.zovara.app"
    compileSdk = 35
    defaultConfig { applicationId = "com.zovara.app"; minSdk = 26; targetSdk = 35; versionCode = 1; versionName = "0.1.0"; buildConfigField("String", "ZOVARA_WEB_URL", "\"$webUrl\"") }
    buildFeatures { buildConfig = true }
    dependencies { implementation("androidx.activity:activity-ktx:1.10.1"); implementation("androidx.appcompat:appcompat:1.7.0") }
    buildTypes { release { isMinifyEnabled = true; proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro") } }
}
