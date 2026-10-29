import { contextBridge } from 'electron';
contextBridge.exposeInMainWorld('zovaraDesktop', { platform: process.platform, version: '0.1.0' });
