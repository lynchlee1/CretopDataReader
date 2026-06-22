const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const path = require("path");

const resourceManifestName = "resources-manifest.json";

function resourceRoot(app) {
  return path.join(app.getPath("userData"), "resources");
}

function templatesDir(app, projectRoot) {
  if (!app.isPackaged) {
    return path.join(projectRoot, "templates", "Deal_Summary_Template_1.0");
  }
  return path.join(resourceRoot(app), "templates", "Deal_Summary_Template_1.0");
}

function bundledTemplatesDir(processResourcesPath) {
  return path.join(processResourcesPath, "templates", "Deal_Summary_Template_1.0");
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function safeResourcePath(root, relativePath) {
  const destination = path.resolve(root, relativePath);
  const resolvedRoot = path.resolve(root);
  if (destination !== resolvedRoot && !destination.startsWith(resolvedRoot + path.sep)) {
    throw new Error(`Invalid resource path: ${relativePath}`);
  }
  return destination;
}

function copyDirectory(source, destination) {
  if (!fs.existsSync(source)) return false;
  fs.mkdirSync(destination, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, destinationPath);
      continue;
    }
    if (entry.isFile()) {
      fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
  return true;
}

function downloadText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          downloadText(new URL(response.headers.location, url).toString()).then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Resource manifest download failed: HTTP ${response.statusCode}`));
          return;
        }

        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve(body));
      })
      .on("error", reject);
  });
}

function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    const temporaryPath = `${destination}.download`;
    const file = fs.createWriteStream(temporaryPath);

    https
      .get(url, (response) => {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          file.close(() => fs.rmSync(temporaryPath, { force: true }));
          downloadFile(new URL(response.headers.location, url).toString(), destination).then(resolve, reject);
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          file.close(() => fs.rmSync(temporaryPath, { force: true }));
          reject(new Error(`Resource download failed: HTTP ${response.statusCode}`));
          return;
        }

        response.pipe(file);
        file.on("finish", () => {
          file.close(() => {
            fs.renameSync(temporaryPath, destination);
            resolve();
          });
        });
      })
      .on("error", (error) => {
        file.close(() => fs.rmSync(temporaryPath, { force: true }));
        reject(error);
      });
  });
}

function releaseDownloadBase(owner, repo, version) {
  return `https://github.com/${owner}/${repo}/releases/download/v${version}`;
}

function validateManifest(manifest) {
  if (!manifest || !Array.isArray(manifest.files)) {
    throw new Error("Resource manifest must include a files array.");
  }
  return manifest.files.filter(
    (file) =>
      file &&
      typeof file.path === "string" &&
      typeof file.sha256 === "string" &&
      typeof file.assetName === "string",
  );
}

async function syncReleaseResources({ app, owner, repo, version }) {
  const baseUrl = releaseDownloadBase(owner, repo, version);
  const root = resourceRoot(app);
  const manifestUrl = `${baseUrl}/${resourceManifestName}`;
  const manifest = JSON.parse(await downloadText(manifestUrl));

  for (const file of validateManifest(manifest)) {
    const destination = safeResourcePath(root, file.path);
    if (fs.existsSync(destination) && sha256(destination) === file.sha256) continue;

    await downloadFile(`${baseUrl}/${encodeURIComponent(file.assetName)}`, destination);
    if (sha256(destination) !== file.sha256) {
      fs.rmSync(destination, { force: true });
      throw new Error(`Resource checksum mismatch: ${file.path}`);
    }
  }

  fs.writeFileSync(path.join(root, resourceManifestName), JSON.stringify(manifest, null, 2), "utf8");
  return root;
}

async function ensureTemplateResources({ app, projectRoot, processResourcesPath, owner, repo }) {
  const destination = templatesDir(app, projectRoot);
  if (!app.isPackaged) return destination;
  if (fs.existsSync(destination)) return destination;

  try {
    await syncReleaseResources({ app, owner, repo, version: app.getVersion() });
  } catch (_error) {
    copyDirectory(bundledTemplatesDir(processResourcesPath), destination);
  }

  return destination;
}

module.exports = {
  bundledTemplatesDir,
  copyDirectory,
  ensureTemplateResources,
  resourceManifestName,
  resourceRoot,
  safeResourcePath,
  sha256,
  syncReleaseResources,
  templatesDir,
  validateManifest,
};
