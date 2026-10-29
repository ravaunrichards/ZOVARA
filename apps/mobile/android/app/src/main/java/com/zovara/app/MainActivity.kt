package com.zovara.app

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient.FileChooserParams
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import android.graphics.Color

class MainActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private var pendingFileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingMediaPermission: PermissionRequest? = null
    private val mediaPermissionLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { grants ->
        val request = pendingMediaPermission ?: return@registerForActivityResult
        val allowed = request.resources.all { resource -> when(resource) {
            PermissionRequest.RESOURCE_VIDEO_CAPTURE -> grants[Manifest.permission.CAMERA] == true || checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
            PermissionRequest.RESOURCE_AUDIO_CAPTURE -> grants[Manifest.permission.RECORD_AUDIO] == true || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
            else -> false
        } }
        if (allowed) request.grant(request.resources) else request.deny()
        pendingMediaPermission = null
    }
    private val filePicker = registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { result ->
        val callback = pendingFileCallback ?: return@registerForActivityResult
        val uris = if (result.resultCode == RESULT_OK) FileChooserParams.parseResult(result.resultCode, result.data) else null
        callback.onReceiveValue(uris); pendingFileCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(8, 11, 24); window.navigationBarColor = Color.rgb(8, 11, 24)
        webView = WebView(this); webView.setBackgroundColor(Color.rgb(8,11,24))
        webView.settings.javaScriptEnabled = true; webView.settings.domStorageEnabled = true
        webView.settings.mediaPlaybackRequiresUserGesture = true
        webView.settings.allowFileAccess = false; webView.settings.allowContentAccess = true
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                val uri = request?.url ?: return true
                val target = Uri.parse(BuildConfig.ZOVARA_WEB_URL)
                val trusted = uri.scheme == target.scheme && uri.host == target.host && uri.port == target.port
                if (trusted) return false
                if (uri.scheme == "https" && (uri.host == "www.paypal.com" || uri.host?.endsWith(".paypal.com") == true)) {
                    startActivity(Intent(Intent.ACTION_VIEW, uri)); return true
                }
                return true // Never let the WebView navigate to arbitrary untrusted origins.
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                val resources = request.resources.toSet()
                val needsCamera = PermissionRequest.RESOURCE_VIDEO_CAPTURE in resources
                val needsMic = PermissionRequest.RESOURCE_AUDIO_CAPTURE in resources
                val granted = (!needsCamera || checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) && (!needsMic || checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)
                if (granted) request.grant(request.resources) else { pendingMediaPermission = request; val perms = mutableListOf<String>(); if(needsCamera)perms.add(Manifest.permission.CAMERA);if(needsMic)perms.add(Manifest.permission.RECORD_AUDIO);mediaPermissionLauncher.launch(perms.toTypedArray()) }
            }
            override fun onShowFileChooser(view: WebView?, callback: ValueCallback<Array<Uri>>?, params: FileChooserParams?): Boolean {
                if (pendingFileCallback != null) pendingFileCallback?.onReceiveValue(null)
                pendingFileCallback = callback
                return try { filePicker.launch(params?.createIntent() ?: Intent(Intent.ACTION_GET_CONTENT).setType("image/*")); true } catch (_: Exception) { pendingFileCallback = null; false }
            }
        }
        setContentView(webView); webView.loadUrl(BuildConfig.ZOVARA_WEB_URL)
    }
    override fun onBackPressed() { if (::webView.isInitialized && webView.canGoBack()) webView.goBack() else super.onBackPressed() }
    override fun onDestroy() { pendingFileCallback?.onReceiveValue(null); pendingFileCallback=null; webView.destroy(); super.onDestroy() }
}
