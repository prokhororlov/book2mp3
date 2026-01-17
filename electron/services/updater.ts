import { app, shell } from 'electron';
import * as https from 'https';
import * as fs from 'fs';
import * as path from 'path';

export interface ReleaseInfo {
  version: string;
  releaseDate: string;
  downloadUrl: string;
  releaseNotes: string;
  fileName: string;
}

export interface UpdateCheckResult {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion?: string;
  releaseInfo?: ReleaseInfo;
  error?: string;
}

export interface DownloadProgress {
  percent: number;
  transferred: number;
  total: number;
}

const GITHUB_OWNER = 'prokhororlov';
const GITHUB_REPO = 'book2mp3';

function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.replace(/^v/, '').split('.').map(Number);
  const parts2 = v2.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
}

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Book-to-MP3-Updater'
      }
    };

    https.get(url, options, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const redirectUrl = res.headers.location;
        if (redirectUrl) {
          httpsGet(redirectUrl).then(resolve).catch(reject);
          return;
        }
      }

      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
      res.on('error', reject);
    }).on('error', reject);
  });
}

export async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();

  try {
    const apiUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
    const response = await httpsGet(apiUrl);
    const release = JSON.parse(response);

    const latestVersion = release.tag_name.replace(/^v/, '');
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

    if (!hasUpdate) {
      return {
        hasUpdate: false,
        currentVersion,
        latestVersion
      };
    }

    // Find the appropriate asset for the current platform
    let assetPattern: RegExp;
    switch (process.platform) {
      case 'win32':
        assetPattern = /\.exe$/i;
        break;
      case 'darwin':
        assetPattern = /\.dmg$/i;
        break;
      case 'linux':
        assetPattern = /\.AppImage$/i;
        break;
      default:
        assetPattern = /\.exe$/i;
    }

    const asset = release.assets?.find((a: { name: string }) => assetPattern.test(a.name));

    if (!asset) {
      return {
        hasUpdate: true,
        currentVersion,
        latestVersion,
        error: 'No compatible installer found for your platform'
      };
    }

    return {
      hasUpdate: true,
      currentVersion,
      latestVersion,
      releaseInfo: {
        version: latestVersion,
        releaseDate: release.published_at,
        downloadUrl: asset.browser_download_url,
        releaseNotes: release.body || '',
        fileName: asset.name
      }
    };
  } catch (error) {
    return {
      hasUpdate: false,
      currentVersion,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export async function downloadUpdate(
  releaseInfo: ReleaseInfo,
  onProgress: (progress: DownloadProgress) => void
): Promise<string> {
  const tempDir = app.getPath('temp');
  const downloadPath = path.join(tempDir, releaseInfo.fileName);

  return new Promise((resolve, reject) => {
    const download = (url: string) => {
      const options = {
        headers: {
          'User-Agent': 'Book-to-MP3-Updater'
        }
      };

      https.get(url, options, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            download(redirectUrl);
            return;
          }
        }

        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const totalSize = parseInt(res.headers['content-length'] || '0', 10);
        let downloadedSize = 0;

        const file = fs.createWriteStream(downloadPath);

        res.on('data', (chunk) => {
          downloadedSize += chunk.length;
          onProgress({
            percent: totalSize > 0 ? Math.round((downloadedSize / totalSize) * 100) : 0,
            transferred: downloadedSize,
            total: totalSize
          });
        });

        res.pipe(file);

        file.on('finish', () => {
          file.close();
          resolve(downloadPath);
        });

        file.on('error', (err) => {
          fs.unlink(downloadPath, () => {});
          reject(err);
        });

        res.on('error', (err) => {
          fs.unlink(downloadPath, () => {});
          reject(err);
        });
      }).on('error', reject);
    };

    download(releaseInfo.downloadUrl);
  });
}

export async function installUpdate(installerPath: string): Promise<void> {
  // Open the installer and quit the app
  await shell.openPath(installerPath);
  app.quit();
}
