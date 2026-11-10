const { app, BrowserWindow, Tray, Menu, dialog, shell, protocol, session, nativeImage } = require('electron');
const path = require('path'), fs = require('fs');
const { autoUpdater } = require('electron-updater');

const APP = path.join(__dirname, 'app');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.json': 'application/json' };
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.setAppUserModelId('app.saifnavas.accounts');

let win = null, tray = null, quitting = false, cfg = {}, cfgFile = null;
const loadCfg = () => { try { cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf8')) } catch (e) { cfg = {} } };
const saveCfg = () => { try { fs.writeFileSync(cfgFile, JSON.stringify(cfg)) } catch (e) {} };
let st; const saveBounds = () => { clearTimeout(st); st = setTimeout(() => { if (!win || win.isDestroyed()) return; cfg.max = win.isMaximized(); if (!cfg.max && !win.isMinimized() && win.isVisible()) cfg.bounds = win.getBounds(); saveCfg() }, 400) };

// true when every change made on this PC has reached the cloud (waits up to 3 s)
async function pendingOk() {
  if (!win || win.isDestroyed()) return true;
  try {
    return await win.webContents.executeJavaScript("(async()=>{try{if(typeof db==='undefined'||!db)return true;return await Promise.race([db.waitForPendingWrites().then(()=>true),new Promise(r=>setTimeout(()=>r(false),3000))])}catch(e){return true}})()");
  } catch (e) { return true }
}
async function safeQuit() {
  if (!(await pendingOk())) {
    const r = dialog.showMessageBoxSync(win && !win.isDestroyed() ? win : undefined, { type: 'warning', buttons: ['Keep the app open', 'Quit anyway'], defaultId: 0, cancelId: 0, title: 'Changes not synced yet', message: 'Some changes are saved on this PC but have not reached the cloud yet.', detail: 'Connect to the internet and wait a moment, or quit anyway. They stay saved here and will sync the next time the app opens with internet.' });
    if (r === 0) return;
  }
  quitting = true; app.quit();
}

function createWindow(hidden) {
  const b = cfg.bounds || { width: 1366, height: 850 };
  win = new BrowserWindow(Object.assign({}, b, {
    minWidth: 1000, minHeight: 640, show: false, backgroundColor: '#ffffff', title: 'Saif Navas Accounts',
    icon: path.join(APP, 'icon.png'), autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, spellcheck: false }
  }));
  if (cfg.max) win.maximize();
  win.loadURL('app://local/index.html');
  win.once('ready-to-show', () => { if (!hidden) win.show() });
  win.on('resize', saveBounds); win.on('move', saveBounds);
  win.on('close', e => { if (!quitting) { e.preventDefault(); win.hide() } }); // X hides to tray so syncing continues
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url || url === 'about:blank') return { action: 'allow' };
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => { if (!url.startsWith('app://')) { e.preventDefault(); if (/^https?:/i.test(url)) shell.openExternal(url) } });
}
const showWin = () => { if (!win || win.isDestroyed()) createWindow(false); if (win.isMinimized()) win.restore(); win.show(); win.focus() };

function checkUpdates(manual) {
  if (!app.isPackaged) { if (manual) dialog.showMessageBox({ message: 'Updates work in the installed app only.' }); return }
  autoUpdater.checkForUpdates().then(r => { if (manual && !(r && r.isUpdateAvailable)) dialog.showMessageBox({ type: 'info', title: 'Up to date', message: 'You have the latest version (' + app.getVersion() + ').' }) })
    .catch(() => { if (manual) dialog.showMessageBox({ type: 'warning', title: 'Update check failed', message: 'Could not reach the update server. Check the internet connection.' }) });
}
function setupUpdates() {
  autoUpdater.autoDownload = true; autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', async info => {
    const r = await dialog.showMessageBox(win && !win.isDestroyed() ? win : undefined, { type: 'info', buttons: ['Restart now', 'Later'], defaultId: 1, cancelId: 1, title: 'Update ready', message: 'Version ' + info.version + ' is ready to install.', detail: 'Choose Restart now when you are not in the middle of work. "Later" installs it automatically the next time you quit the app.' });
    if (r.response === 0) { if (await pendingOk()) { quitting = true; autoUpdater.quitAndInstall() } else dialog.showMessageBox({ type: 'warning', message: 'Some changes have not synced yet. Try again in a minute.' }) }
  });
  autoUpdater.on('error', e => console.warn('update:', e && e.message));
  if (app.isPackaged) { setTimeout(() => checkUpdates(false), 5000); setInterval(() => checkUpdates(false), 4 * 3600 * 1000) }
}

function setupTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(APP, 'icon.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip('Saif Navas Accounts');
  const build = () => Menu.buildFromTemplate([
    { label: 'Open Saif Navas Accounts', click: showWin },
    { label: 'Start with Windows', type: 'checkbox', checked: !!cfg.autoStart, enabled: app.isPackaged, click: i => { cfg.autoStart = i.checked; saveCfg(); app.setLoginItemSettings({ openAtLogin: i.checked, args: ['--hidden'] }) } },
    { label: 'Check for updates', click: () => checkUpdates(true) },
    { type: 'separator' },
    { label: 'Quit', click: safeQuit }
  ]);
  tray.setContextMenu(build()); tray.on('click', showWin);
}
function setupMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'App', submenu: [{ label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => win && win.reload() }, { label: 'Check for updates', click: () => checkUpdates(true) }, { type: 'separator' }, { label: 'Quit', click: safeQuit }] },
    { label: 'View', submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { role: 'togglefullscreen' }] },
    { label: 'Help', submenu: [{ label: 'Version ' + app.getVersion(), enabled: false }, { label: 'Developer tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => win && win.webContents.toggleDevTools() }] }
  ]));
}

if (!app.requestSingleInstanceLock()) { app.quit() } else {
  app.on('second-instance', showWin);
  app.on('before-quit', () => { quitting = true });
  app.whenReady().then(() => {
    cfgFile = path.join(app.getPath('userData'), 'desktop.json'); loadCfg();
    protocol.handle('app', async req => {
      let p = decodeURIComponent(new URL(req.url).pathname); if (p === '/' || !p) p = '/index.html';
      const f = path.normalize(path.join(APP, p));
      if (f !== APP && !f.startsWith(APP + path.sep)) return new Response('Forbidden', { status: 403 });
      try { return new Response(await fs.promises.readFile(f), { headers: { 'content-type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream' } }) }
      catch (e) { return new Response('Not found', { status: 404 }) }
    });
    session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(['clipboard-sanitized-write', 'fullscreen'].includes(perm)));
    if (app.isPackaged && cfg.autoStart === undefined) { cfg.autoStart = true; saveCfg(); app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] }) }
    setupMenu(); setupTray(); setupUpdates();
    createWindow(process.argv.includes('--hidden'));
  });
  app.on('window-all-closed', () => {}); // keep running in the tray
}
