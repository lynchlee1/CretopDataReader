const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "dist", "release-resources");
const resourceManifestName = "resources-manifest.json";
const resourceSources = [
  {
    from: path.join(root, "templates"),
    to: "templates",
  },
];

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function assetNameFor(relativePath) {
  return `resource-${relativePath.replace(/[^a-zA-Z0-9._-]+/g, "-")}`;
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath));
      continue;
    }
    if (entry.isFile()) files.push(entryPath);
  }
  return files;
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });

const manifest = {
  version: JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version,
  files: [],
};

for (const source of resourceSources) {
  for (const filePath of walkFiles(source.from)) {
    const sourceRelativePath = path.relative(source.from, filePath);
    const resourcePath = path.join(source.to, sourceRelativePath).split(path.sep).join("/");
    const assetName = assetNameFor(resourcePath);

    fs.copyFileSync(filePath, path.join(outputDir, assetName));
    manifest.files.push({
      path: resourcePath,
      assetName,
      size: fs.statSync(filePath).size,
      sha256: sha256(filePath),
    });
  }
}

manifest.files.sort((left, right) => left.path.localeCompare(right.path));
fs.writeFileSync(path.join(outputDir, resourceManifestName), JSON.stringify(manifest, null, 2), "utf8");

console.log(`Built ${manifest.files.length} release resource(s) in ${outputDir}`);
