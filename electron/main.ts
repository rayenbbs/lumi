import { config as loadEnv } from 'dotenv'
import { app, BrowserWindow, screen, shell } from 'electron'
import path from 'path'
import { registerIpcHandlers } from './ipc-handlers'

loadEnv()

export let mainWindow: BrowserWindow | null = null


function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    // Bottom-right corner
    x: width - 440,
    y: height - 560,
    width: 420,
    height: 540,

    // Transparent, frameless, always on top
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: true,
    hasShadow: false,
    roundedCorners: false,

    // Click-through on transparent areas
    focusable: true,

    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Needed for local file access (tesseract wasm)
    },
  })

  mainWindow.setMenuBarVisibility(false)

  // Open DevTools in dev mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL!)
    // mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  registerIpcHandlers(mainWindow)
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})
