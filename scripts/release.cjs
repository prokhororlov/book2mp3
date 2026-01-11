#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const packageJsonPath = path.join(__dirname, '..', 'package.json');

function exec(command, options = {}) {
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'pipe', ...options }).trim();
  } catch (error) {
    if (options.ignoreError) return '';
    throw error;
  }
}

function log(message, type = 'info') {
  const icons = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warning: '⚠️',
    rocket: '🚀'
  };
  console.log(`${icons[type] || ''} ${message}`);
}

function getCurrentVersion() {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return packageJson.version;
}

function setVersion(newVersion) {
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  packageJson.version = newVersion;
  fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
}

function bumpVersion(currentVersion, type) {
  const parts = currentVersion.split('.').map(Number);

  switch (type) {
    case 'major':
      return `${parts[0] + 1}.0.0`;
    case 'minor':
      return `${parts[0]}.${parts[1] + 1}.0`;
    case 'patch':
    default:
      return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
}

function isValidVersion(version) {
  return /^\d+\.\d+\.\d+$/.test(version);
}

function checkGitStatus() {
  const status = exec('git status --porcelain', { ignoreError: true });
  if (!status) return { clean: true, files: [] };

  const files = status.split('\n').filter(Boolean);
  // Allow package.json changes (we'll commit them)
  const nonPackageChanges = files.filter(f => !f.endsWith('package.json'));

  return {
    clean: nonPackageChanges.length === 0,
    files: nonPackageChanges
  };
}

function main() {
  const args = process.argv.slice(2);
  const versionArg = args[0] || 'patch';

  console.log('\n🚀 Release Script\n');

  // Check git status
  log('Checking git status...');
  const gitStatus = checkGitStatus();

  if (!gitStatus.clean) {
    log('You have uncommitted changes:', 'error');
    gitStatus.files.forEach(file => console.log(`   ${file}`));
    console.log('\nPlease commit or stash your changes before releasing.\n');
    process.exit(1);
  }
  log('Working directory is clean', 'success');

  // Determine new version
  const currentVersion = getCurrentVersion();
  let newVersion;

  if (isValidVersion(versionArg)) {
    newVersion = versionArg;
  } else if (['major', 'minor', 'patch'].includes(versionArg)) {
    newVersion = bumpVersion(currentVersion, versionArg);
  } else {
    log(`Invalid version argument: ${versionArg}`, 'error');
    console.log('\nUsage:');
    console.log('  npm run release              # Patch bump (1.0.0 -> 1.0.1)');
    console.log('  npm run release minor        # Minor bump (1.0.0 -> 1.1.0)');
    console.log('  npm run release major        # Major bump (1.0.0 -> 2.0.0)');
    console.log('  npm run release 2.0.0        # Specific version\n');
    process.exit(1);
  }

  log(`Version: ${currentVersion} -> ${newVersion}`);

  // Update package.json
  log('Updating package.json...');
  setVersion(newVersion);
  log('package.json updated', 'success');

  // Build the project
  log('Building project...');
  try {
    execSync('npm run build', { stdio: 'inherit' });
    log('Build completed', 'success');
  } catch (error) {
    log('Build failed', 'error');
    // Revert package.json
    setVersion(currentVersion);
    process.exit(1);
  }

  // Git operations
  log('Creating git commit...');
  exec('git add package.json');
  exec(`git commit -m "release: v${newVersion}"`);
  log('Commit created', 'success');

  log('Creating git tag...');
  exec(`git tag v${newVersion}`);
  log(`Tag v${newVersion} created`, 'success');

  log('Pushing to remote...');
  exec('git push');
  exec('git push --tags');
  log('Pushed to remote', 'success');

  console.log('\n' + '='.repeat(50));
  log(`Release v${newVersion} completed!`, 'rocket');
  console.log('='.repeat(50));
  console.log('\nGitHub Actions will now build and publish the release.');
  console.log(`Check progress at: https://github.com/<owner>/<repo>/actions\n`);
}

main();
