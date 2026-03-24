#!/usr/bin/env npx tsx
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const VERSION_FILE = 'version.json';
const PACKAGE_FILE = 'package.json';
const TAURI_CONFIG = 'src-tauri/tauri.conf.json';

interface VersionData {
  major: number;
  minor: number;
  patch: number;
}

function getVersionFile(): VersionData {
  if (existsSync(VERSION_FILE)) {
    const raw = JSON.parse(readFileSync(VERSION_FILE, 'utf-8')) as VersionData & {
      build?: number;
    };
    return {
      major: raw.major ?? 0,
      minor: raw.minor ?? 1,
      patch: raw.patch ?? 1,
    };
  }
  return { major: 0, minor: 1, patch: 1 };
}

function saveVersionFile(data: VersionData): void {
  writeFileSync(VERSION_FILE, JSON.stringify(data, null, 2) + '\n');
}

function getSemver(data: VersionData): string {
  return `${data.major}.${data.minor}.${data.patch}`;
}

function bumpVersion(part: string): void {
  const data = getVersionFile();
  
  switch (part) {
    case 'major':
      data.major += 1;
      data.minor = 0;
      data.patch = 0;
      break;
    case 'minor':
      data.minor += 1;
      data.patch = 0;
      break;
    case 'patch':
      data.patch += 1;
      break;
    case 'build':
      data.patch += 1;
      break;
    default:
      console.error(`Unknown version part: ${part}`);
      console.error('Valid parts: major, minor, patch, build');
      process.exit(1);
  }
  
  saveVersionFile(data);
  console.log(`Bumped ${part} to ${getSemver(data)}`);
  updateConfigs(data);
}

function incrementBuild(): void {
  const data = getVersionFile();
  data.patch += 1;
  saveVersionFile(data);
  updateConfigs(data);
  console.log(`Version incremented to ${getSemver(data)}`);
}

function updateConfigs(data: VersionData): void {
  const semver = getSemver(data);

  // Update package.json (semver only — npm does not support 4-part versions)
  const packageJson = JSON.parse(readFileSync(PACKAGE_FILE, 'utf-8'));
  packageJson.version = semver;
  writeFileSync(PACKAGE_FILE, JSON.stringify(packageJson, null, 2) + '\n');

  // Update tauri.conf.json (semver only — Tauri requires valid semver)
  if (existsSync(TAURI_CONFIG)) {
    const tauriConfig = JSON.parse(readFileSync(TAURI_CONFIG, 'utf-8'));
    tauriConfig.version = semver;
    writeFileSync(TAURI_CONFIG, JSON.stringify(tauriConfig, null, 2) + '\n');
  }
}

function showVersion(): void {
  const data = getVersionFile();
  console.log(getSemver(data));
}

// Parse command line arguments
const args = process.argv.slice(2);
const command = args[0];

switch (command) {
  case 'bump':
    const part = args[1];
    if (!part) {
      console.error('Usage: npm run version:bump -- <major|minor|patch|build>');
      process.exit(1);
    }
    bumpVersion(part);
    break;
  case 'increment':
    incrementBuild();
    break;
  case 'show':
    showVersion();
    break;
  default:
    console.log('Usage:');
    console.log('  npm run version:bump -- <major|minor|patch|build>  Bump specific part');
    console.log('  npm run version:increment                          Increment build number');
    console.log('  npm run version:show                               Show current version');
    process.exit(1);
}
