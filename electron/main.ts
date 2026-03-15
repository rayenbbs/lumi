import { config as loadEnv } from 'dotenv'
import { app, BrowserWindow, ipcMain, screen, session, shell } from 'electron'
import path from 'path'
import { spawn, ChildProcess } from 'child_process'
import { registerIpcHandlers } from './ipc-handlers'
import { getMcpClient, shutdownMcpClient } from './mcp-client'

loadEnv()

export let mainWindow: BrowserWindow | null = null
let graphWindow: BrowserWindow | null = null
let pythonProcess: ChildProcess | null = null

function spawnPythonServer() {
  const pythonPath = 'python'
  const scriptDir = path.join(__dirname, '../../Driver-State-Detection/driver_state_detection')

  const args = ['main.py']
  const debugRequested = process.env.LUMI_DRIVER_DEBUG === '1'
  const isDevMode = process.env.NODE_ENV === 'development' || process.env.VITE_DEV_SERVER_URL !== undefined
  if (debugRequested || isDevMode) {
    args.push('--debug')
  }

  pythonProcess = spawn(pythonPath, args, {
    cwd: scriptDir,
    stdio: 'inherit',
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
      webSecurity: false,
    },
  })

  mainWindow.setIgnoreMouseEvents(true, { forward: true })
  mainWindow.setMenuBarVisibility(false)

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL!)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  registerIpcHandlers(mainWindow)
}

function openGraphWindow() {
  if (graphWindow && !graphWindow.isDestroyed()) {
    graphWindow.focus()
    return
  }

  // Lower the main overlay so it doesn't steal mouse events from the graph window
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setAlwaysOnTop(false)
    mainWindow.setIgnoreMouseEvents(true, { forward: false })
  }

  graphWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 700,
    minHeight: 500,
    title: 'Lumi — Knowledge Map',
    frame: true,
    backgroundColor: '#0a0614',
    resizable: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
    },
  })

  if (process.env.NODE_ENV === 'development') {
    const devUrl = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173'
    graphWindow.loadURL(`${devUrl}/graph.html`)
  } else {
    graphWindow.loadFile(path.join(__dirname, '../renderer/graph.html'))
  }

  graphWindow.on('closed', () => {
    graphWindow = null
    // Restore the main overlay to its normal always-on-top state
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setAlwaysOnTop(true)
      mainWindow.setIgnoreMouseEvents(true, { forward: true })
    }
  })
}

app.whenReady().then(async () => {
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(true)
  })
  session.defaultSession.setPermissionCheckHandler(() => {
    return true
  })

  spawnPythonServer()

  // Start the MCP server (non-blocking — app works without it)
  getMcpClient().then(() => {
    console.log('[Main] MCP server ready')
  }).catch((err) => {
    console.warn('[Main] MCP server failed to start (app will work without syllabus search):', err.message)
  })

  ipcMain.handle('open-knowledge-graph', () => {
    openGraphWindow()
    return { opened: true }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('will-quit', () => {
  if (pythonProcess) pythonProcess.kill()
  shutdownMcpClient()
})

app.on('window-all-closed', () => {
  app.quit()
})
