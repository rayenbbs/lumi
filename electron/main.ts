import { config as loadEnv } from 'dotenv'
import { app, BrowserWindow, screen, session, shell } from 'electron'
import path from 'path'
import { registerIpcHandlers } from './ipc-handlers'

loadEnv()

export let mainWindow: BrowserWindow | null = null


function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize

  mainWindow = new BrowserWindow({
    x: 0,
    y: 0,
    width,
    height,

    // Transparent, frameless, always on top
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    resizable: false,
    hasShadow: false,
    roundedCorners: false,

    focusable: true,

    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Needed for local file access (tesseract wasm)
    },
  })

  // Click-through on transparent areas, forward mouse events so we detect hover
  mainWindow.setIgnoreMouseEvents(true, { forward: true })

  mainWindow.setMenuBarVisibility(false)

  // Open DevTools in dev mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL!)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
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

// Auto-grant all permissions (camera, mic, screen) for webgazer eye tracking
app.whenReady().then(() => {
  // Grant permission requests (getUserMedia, etc.)
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(true)
  })

  // Grant permission checks (navigator.permissions.query, etc.)
  session.defaultSession.setPermissionCheckHandler(() => {
    return true
  })

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
