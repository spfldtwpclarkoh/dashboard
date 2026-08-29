const { app, BrowserWindow, globalShortcut, screen, session } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const UPDATE_INSTALL_HOUR = 3;
const UPDATE_RETRY_DELAY_MS = 10 * 60 * 1000;
let mainWindow = null;

log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.autoInstallOnAppQuit = true;

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function selectDisplay() {
  const displays = screen.getAllDisplays();
  const configuredIndex = Number.parseInt(process.env.STFD_DISPLAY_INDEX || '', 10);

  if (Number.isInteger(configuredIndex) && displays[configuredIndex]) {
    log.info(`Using configured display ${configuredIndex + 1}.`);
    return displays[configuredIndex];
  }

  const primaryId = screen.getPrimaryDisplay().id;
  const externalDisplays = displays.filter((display) => display.id !== primaryId);
  if (externalDisplays.length) {
    return externalDisplays.sort((a, b) => (b.bounds.width * b.bounds.height) - (a.bounds.width * a.bounds.height))[0];
  }

  return screen.getPrimaryDisplay();
}

function configureSessionSecurity() {
  const dashboardSession = session.defaultSession;
  dashboardSession.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
  dashboardSession.setPermissionCheckHandler(() => false);
}

function createWindow() {
  const targetDisplay = selectDisplay();
  const alwaysOnTop = process.env.STFD_ALWAYS_ON_TOP !== 'false';

  log.info(`Opening dashboard at ${targetDisplay.bounds.x},${targetDisplay.bounds.y} (${targetDisplay.bounds.width}x${targetDisplay.bounds.height}).`);

  const win = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.bounds.width,
    height: targetDisplay.bounds.height,
    kiosk: true,
    alwaysOnTop,
    skipTaskbar: true,
    backgroundColor: '#111827',
    icon: path.join(__dirname, 'assets', 'STFD Logo 244x244.png'),
    webPreferences: {
      mediaPlaybackRequiresUserGesture: false,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webviewTag: false
    }
  });

  win.removeMenu();
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event, navigationUrl) => {
    const expectedUrl = new URL(`file://${path.join(__dirname, 'index.html').replace(/\\/g, '/')}`).href;
    if (navigationUrl !== expectedUrl) {
      log.warn(`Blocked unexpected navigation: ${navigationUrl}`);
      event.preventDefault();
    }
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    log.error('Renderer process ended unexpectedly:', details);
    setTimeout(() => {
      if (!win.isDestroyed()) win.reload();
    }, 5000);
  });

  win.loadFile('index.html').catch((error) => log.error('Dashboard failed to load:', error));
  mainWindow = win;
  return win;
}

function millisecondsUntilInstallWindow() {
  const now = new Date();
  const installAt = new Date(now);
  installAt.setHours(UPDATE_INSTALL_HOUR, 0, 0, 0);
  if (installAt <= now) installAt.setDate(installAt.getDate() + 1);
  return installAt.getTime() - now.getTime();
}

async function dashboardIsBusy(win) {
  if (!win || win.isDestroyed()) return false;
  try {
    return await win.webContents.executeJavaScript(
      `Boolean(document.querySelector('#dispatchAlertOverlay.flex, #ipawsAlertOverlay.opacity-100'))`,
      true
    );
  } catch (error) {
    log.warn('Could not determine dashboard alert state:', error);
    return true;
  }
}

function installDownloadedUpdateWhenIdle(win, delayMs = millisecondsUntilInstallWindow()) {
  setTimeout(async () => {
    if (await dashboardIsBusy(win)) {
      log.info('Update installation deferred because an alert is active.');
      installDownloadedUpdateWhenIdle(win, UPDATE_RETRY_DELAY_MS);
      return;
    }
    log.info('Installing downloaded update during the maintenance window.');
    autoUpdater.quitAndInstall(false, true);
  }, delayMs);
}

function setupAutoUpdater(win) {
  if (!app.isPackaged) {
    log.info('Skipping auto-update checks in development mode.');
    return;
  }

  autoUpdater.on('checking-for-update', () => log.info('Checking for update.'));
  autoUpdater.on('update-available', (info) => log.info('Update available:', info.version));
  autoUpdater.on('update-not-available', () => log.info('No update available.'));
  autoUpdater.on('error', (error) => log.error('Auto-updater error:', error));
  autoUpdater.on('download-progress', (progress) => log.info(`Update download: ${progress.percent.toFixed(1)}%`));
  autoUpdater.on('update-downloaded', (info) => {
    log.info(`Update ${info.version} downloaded; scheduling maintenance-window installation.`);
    installDownloadedUpdateWhenIdle(win);
  });

  const checkForUpdates = () => {
    autoUpdater.checkForUpdates().catch((error) => log.error('Update check failed:', error));
  };

  setTimeout(checkForUpdates, 30 * 1000);
  setInterval(checkForUpdates, UPDATE_CHECK_INTERVAL_MS);
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    configureSessionSecurity();
    app.setLoginItemSettings({ openAtLogin: true, path: app.getPath('exe') });

    const win = createWindow();
    setupAutoUpdater(win);

    globalShortcut.register('CommandOrControl+Shift+Q', () => app.quit());
    globalShortcut.register('CommandOrControl+Shift+D', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const leavingKiosk = mainWindow.isKiosk();
      mainWindow.setKiosk(!leavingKiosk);
      mainWindow.setAlwaysOnTop(!leavingKiosk && process.env.STFD_ALWAYS_ON_TOP !== 'false');
      mainWindow.setSkipTaskbar(!leavingKiosk);
    });

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
}
