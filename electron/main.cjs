const { app, BrowserWindow, protocol } = require("electron");
const path = require("path");

protocol.registerSchemesAsPrivileged([
  { scheme: "dram", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

const ROOT = path.join(__dirname, "..");

function createWindow() {
  const win = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#0c0c0c",
    title: "Dram",
    icon: path.join(ROOT, "logo", "dram-logo.png"),
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 14, y: 12 },
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadURL("dram://app/index.html");
}

app.whenReady().then(() => {
  protocol.handle("dram", (request) => {
    const u = new URL(request.url);
    let rel = decodeURIComponent(u.pathname).replace(/^\/+/, "");
    if (rel.startsWith("app/")) rel = rel.slice(4);
    if (!rel || rel === "app") rel = "index.html";
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT)) return new Response("forbidden", { status: 403 });
    return require("electron").net.fetch("file://" + file);
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
