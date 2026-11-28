plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.bibekbista.dash"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.bibekbista.dash"
        minSdk = 30
        targetSdk = 34
        versionCode = 2
        versionName = "0.2.0"
    }
    // Release signing is optional and read from environment variables, so no password is ever written into the project.
    // Set DASH_KEYSTORE (path to your .jks), DASH_KEYSTORE_PASSWORD and, if different, DASH_KEY_ALIAS and DASH_KEY_PASSWORD.
    val dashKeystore: String? = System.getenv("DASH_KEYSTORE")
    if (dashKeystore != null) {
        signingConfigs {
            create("dashRelease") {
                storeFile = file(dashKeystore)
                storePassword = System.getenv("DASH_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("DASH_KEY_ALIAS") ?: "dash"
                keyPassword = System.getenv("DASH_KEY_PASSWORD") ?: System.getenv("DASH_KEYSTORE_PASSWORD")
            }
        }
    }
    buildTypes {
        release {
            if (dashKeystore != null) signingConfig = signingConfigs.getByName("dashRelease")
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.webkit:webkit:1.11.0")
    implementation("androidx.biometric:biometric:1.1.0")
    implementation("androidx.recyclerview:recyclerview:1.3.2")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.1.0")
    // QR code scanner screen (works offline, needs no Google services)
    implementation("com.journeyapps:zxing-android-embedded:4.3.0")
}
