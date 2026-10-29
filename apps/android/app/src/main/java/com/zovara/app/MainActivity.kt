package com.zovara.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

private val Night = Color(0xFF0A0B10)
private val Violet = Color(0xFFA797FF)
private val Mint = Color(0xFF82F5CA)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) { super.onCreate(savedInstanceState); setContent { ZovaraApp() } }
}

@Composable
fun ZovaraApp() {
    var tab by remember { mutableStateOf("For you") }
    MaterialTheme(colorScheme = darkColorScheme(primary = Violet, secondary = Mint, background = Night, surface = Color(0xFF141620))) {
        Scaffold(containerColor = Night, bottomBar = { NavigationBar(containerColor = Color(0xFF12141C)) {
            listOf("For you", "Discover", "Live", "Profile").forEach { label -> NavigationBarItem(selected = tab == label, onClick = { tab = label }, icon = { Text(when(label){"For you"->"⌂";"Discover"->"⌕";"Live"->"◉";else->"◎"}, fontSize=20.sp) }, label = { Text(label, fontSize = 10.sp) }) }
        }}) { padding -> Column(Modifier.fillMaxSize().padding(padding).background(Night).padding(horizontal=22.dp, vertical=25.dp)) {
            Text("ZOVARA", color = Violet, fontSize = 12.sp, letterSpacing = 3.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(22.dp))
            Text(when(tab){"For you"->"Your world, in motion.";"Discover"->"Follow your curiosity.";"Live"->"Live, in real time.";else->"Your profile. Your identity."}, color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
            Spacer(Modifier.height(9.dp))
            Text("A creator-first social platform, built around real accounts and real communities.", color = Color(0xFF9BA0B4), fontSize = 13.sp, lineHeight = 20.sp)
            Spacer(Modifier.height(22.dp))
            Card(colors = CardDefaults.cardColors(containerColor = Color(0xFF151722)), shape = RoundedCornerShape(18.dp)) {
                Column(Modifier.padding(20.dp)) {
                    Text("Connect to your ZOVARA server", color = Mint, fontSize = 11.sp, letterSpacing = 1.sp)
                    Spacer(Modifier.height(10.dp))
                    Text("This Android shell is ready for the shared API session and media client. Set the deployment API URL in the mobile build configuration before release.", color = Color(0xFFAFB3C4), fontSize = 13.sp, lineHeight = 21.sp)
                    Spacer(Modifier.height(14.dp))
                    Button(onClick = { tab = "Discover" }, modifier = Modifier.align(Alignment.Start)) { Text("Explore the app") }
                }
            }
            Spacer(Modifier.weight(1f))
            Text("Native integration status: web flows are active in the monorepo; Android auth/feed API binding and media lifecycle are listed for implementation before store release.", color = Color(0xFF686E84), fontSize = 10.sp, lineHeight = 16.sp)
        } }
    }
}
