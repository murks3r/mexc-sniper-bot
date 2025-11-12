#!/usr/bin/env node
/**
 * Ensure lightningcss native binaries are placed alongside the JS entrypoint.
 *
 * Turbopack struggles to resolve optional native dependencies that lightningcss
 * loads dynamically (e.g. lightningcss-darwin-arm64). Copy any available
 * platform-specific binaries into the lightningcss package directory so the
 * fallback relative require works reliably during Next.js builds.
 */

const fs = require("fs");
const path = require("path");
const { generateLightningcssPkgIndex } = require("./lib/generate-lightningcss-pkg");

const projectRoot = path.resolve(__dirname, "..");
const nodeModulesDir = path.join(projectRoot, "node_modules");
const lightningcssDir = path.join(nodeModulesDir, "lightningcss");
const pkgDir = path.join(lightningcssDir, "pkg");

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyBinary(sourceDir, fileName) {
  const sourcePath = path.join(sourceDir, fileName);
  if (!fs.existsSync(sourcePath)) {
    return false;
  }

  const destinationPath = path.join(lightningcssDir, fileName);
  if (fs.existsSync(destinationPath)) {
    return true;
  }

  fs.copyFileSync(sourcePath, destinationPath);
  return true;
}

function ensureLightningcssBinaries() {
  if (!fs.existsSync(lightningcssDir)) {
    return;
  }

  let copied = 0;

  if (fs.existsSync(nodeModulesDir)) {
    const entries = fs.readdirSync(nodeModulesDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith("lightningcss-")) continue;

      const optionalDir = path.join(nodeModulesDir, entry.name);
      const files = fs.readdirSync(optionalDir);

      for (const fileName of files) {
        if (!fileName.endsWith(".node")) continue;
        if (copyBinary(optionalDir, fileName)) {
          copied += 1;
        }
      }
    }
  }

  // Create pkg/index.js that properly exports the native binary
  // This is needed for Turbopack to resolve the module correctly
  ensureDirectory(pkgDir);
  
  const pkgIndexPath = path.join(pkgDir, "index.js");
  // Check if native binary exists in lightningcss directory
  const platform = process.platform;
  const arch = process.arch;
  
  // Determine the correct binary name based on platform
  let nativeBinaryName;
  if (platform === 'darwin') {
    nativeBinaryName = `lightningcss.darwin-${arch}.node`;
  } else if (platform === 'win32') {
    nativeBinaryName = `lightningcss.win32-${arch === 'x64' ? 'x64' : 'ia32'}.node`;
  } else {
    // Linux
    const libc = require('detect-libc');
    const family = libc.familySync();
    if (family === libc.MUSL) {
      nativeBinaryName = `lightningcss.linux-${arch}-musl.node`;
    } else if (arch === 'arm') {
      nativeBinaryName = `lightningcss.linux-arm-gnueabihf.node`;
    } else {
      nativeBinaryName = `lightningcss.linux-${arch}-gnu.node`;
    }
  }
  
  const nativeBinaryPath = path.join(lightningcssDir, nativeBinaryName);
  
  const pkgIndexContent = generateLightningcssPkgIndex({
    nativeBinaryName,
    platform,
    arch,
  });

  fs.writeFileSync(pkgIndexPath, pkgIndexContent);
  console.log(`[ensure-lightningcss] Created pkg/index.js for ${nativeBinaryName} resolution.`);

  if (copied > 0) {
    console.log(`[ensure-lightningcss] Copied ${copied} native binary${copied === 1 ? "" : "ies"}.`);
  }
}

try {
  ensureLightningcssBinaries();
} catch (error) {
  console.warn("[ensure-lightningcss] Failed to prepare lightningcss binaries:", error);
}
