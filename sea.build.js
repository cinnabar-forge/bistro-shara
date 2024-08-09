import { execSync } from "child_process";
import { build } from "esbuild";
import fs from "fs";
import path from "path";

const ESBUILD_NAME = "Node SEA Bundle";
const BUILD_DIR = path.join(import.meta.dirname, "build", "sea");
const BUNDLE_FILE = path.join(BUILD_DIR, "index.cjs");

const buildCrossPlatform = function () {
  const isWindows = process.platform === "win32";

  const configCommand = "node --experimental-sea-config sea.config.json";
  execSync(configCommand, { stdio: "inherit" });

  const nodeBinaryPath = process.execPath;
  const baseName = "app";
  const destinationPath = path.join(
    BUILD_DIR,
    isWindows ? `${baseName}.exe` : baseName,
  );
  fs.copyFileSync(nodeBinaryPath, destinationPath);

  const postjectCommandBase = `npx postject ${destinationPath} NODE_SEA_BLOB ${path.join(BUILD_DIR, "prep.blob")} --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2`;
  const postjectCommand = isWindows
    ? postjectCommandBase.replace(/\//g, "\\")
    : postjectCommandBase;
  execSync(postjectCommand, { stdio: "inherit" });
};

build({
  bundle: true,
  entryPoints: ["src/index.ts"],
  external: [],
  outfile: BUNDLE_FILE,
  platform: "node",
})
  .then((r) => {
    console.log(`${ESBUILD_NAME} has been built to ${BUNDLE_FILE}`);
    buildCrossPlatform();
  })
  .catch((e) => {
    console.log(`Error building ${ESBUILD_NAME}: ${e.message}`);
    process.exit(1);
  });
