import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
const devUrl = process.env.ZOVARA_WEB_URL || 'http://localhost:5173';
function createWindow() {
 const win = new BrowserWindow({ width: 1440, height: 920, minWidth: 900, minHeight: 650, title: 'ZOVARA', backgroundColor: '#0a0b10', webPreferences: { preload: join(import.meta.dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
 win.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) void shell.openExternal(url); return { action: 'deny' }; });
 void win.loadURL(devUrl);
}
app.whenReady().then(() => { createWindow(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); }); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
