const assert = require("assert");
const path = require("path");
const test = require("node:test");

const {
  safeResourcePath,
  templatesDir,
  validateManifest,
} = require("../electron/resource-manager");

test("templatesDir uses project templates during development", () => {
  const app = {
    isPackaged: false,
    getPath: () => "unused",
  };
  const projectRoot = path.resolve("project");

  assert.equal(
    templatesDir(app, projectRoot),
    path.join(projectRoot, "templates", "Deal_Summary_Template_1.0"),
  );
});

test("templatesDir uses userData resources when packaged", () => {
  const userData = path.resolve("userdata");
  const app = {
    isPackaged: true,
    getPath: () => userData,
  };

  assert.equal(
    templatesDir(app, "unused"),
    path.join(userData, "resources", "templates", "Deal_Summary_Template_1.0"),
  );
});

test("safeResourcePath rejects paths outside the resource root", () => {
  const root = path.resolve("resources");

  assert.throws(() => safeResourcePath(root, "../outside.txt"), /Invalid resource path/);
});

test("validateManifest keeps only downloadable file entries", () => {
  const files = validateManifest({
    files: [
      { path: "templates/a.txt", assetName: "resource-a.txt", sha256: "abc" },
      { path: "templates/b.txt", sha256: "missing-asset-name" },
      null,
    ],
  });

  assert.deepEqual(files, [{ path: "templates/a.txt", assetName: "resource-a.txt", sha256: "abc" }]);
});
