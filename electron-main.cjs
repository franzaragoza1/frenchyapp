/**
 * Electron Main Process - Inicia el servidor backend y abre la ventana de la app
 */

const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let mainWindow = null;
let serverProcess = null;

const PORT = 8081;
const SERVER_URL = `http://localhost:${PORT}`;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
  });

  mainWindow.loadURL(SERVER_URL);
  mainWindow.on('closed', () => { mainWindow = null; });
}

function startBackendServer() {
  return new Promise((resolve) => {
    const serverPath = path.join(__dirname, 'server', 'dist', 'index.js');
    console.log('[Electron] Starting server:', serverPath);

    serverProcess = spawn('node', [serverPath], {
      env: { ...process.env, PORT, NODE_ENV: 'production' },
      stdio: 'inherit',
      cwd: path.join(__dirname, 'server'),
    });

    setTimeout(resolve, 3000);
  });
}

app.whenReady().then(async () => {
  await startBackendServer();
  createWindow();
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  app.quit();
});
