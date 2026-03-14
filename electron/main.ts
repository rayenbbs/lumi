import { config as loadEnv } from 'dotenv'
import { app, BrowserWindow, screen, session, shell } from 'electron'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import { registerIpcHandlers } from './ipc-handlers'

loadEnv()

export let mainWindow: BrowserWindow | null = null
let pythonProcess: ChildProcess | null = null

function spawnPythonServer() {
  const pythonPath = 'python' // Note: This assumes python is in PATH and has dependencies installed
  const scriptDir = path.join(__dirname, '../../Driver-State-Detection/driver_state_detection')
  
  const args = ['main.py']
  const debugRequested = process.env.LUMI_DRIVER_DEBUG === '1'
  const isDevMode = process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL !== undefined
  if (debugRequested || isDevMode) {
    args.push('--debug')
  }

  pythonProcess = spawn(pythonPath, args, {
    cwd: scriptDir,
    stdio: 'inherit' // Pipe logs to Electron console so we can see what's happening
  })

  pythonProcess.on('error', (err) => {
    console.error('Failed to start Python subprocess:', err)
  })

  pythonProcess.on('close', (code) => {
    console.log(`Python process exited with code ${code}`)
  })
}


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

  spawnPythonServer()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('will-quit', () => {
  if (pythonProcess) {
    pythonProcess.kill()
  }
})

app.on('window-all-closed', () => {
  app.quit()
})

