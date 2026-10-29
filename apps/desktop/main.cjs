const { app, BrowserWindow, shell } = require('electron');
const { URL } = require('node:url');
const startURL = process.env.ZOVARA_WEB_URL || 'http://localhost:3000/';
function trusted(url){try{const candidate=new URL(url),base=new URL(startURL);return candidate.origin===base.origin;}catch{return false;}}
function createWindow(){const win=new BrowserWindow({width:1440,height:940,minWidth:900,minHeight:650,backgroundColor:'#080b18',title:'ZOVARA',webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true}});win.webContents.setWindowOpenHandler(({url})=>{if(url.startsWith('https://')&&!trusted(url))shell.openExternal(url);return {action:'deny'};});win.webContents.on('will-navigate',(event,url)=>{if(!trusted(url)&&!url.startsWith('https://www.paypal.com'))event.preventDefault();});win.loadURL(startURL);}
app.whenReady().then(()=>{createWindow();app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0)createWindow();});});
app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit();});
