import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

/**
 * Base directory for TIL workbook temp files (downloads + extractions).
 *
 * Historical note: upstream v4's `download-workbook` writes to
 * `os.tmpdir()/tableau-mcp-workbooks` when no S3 bucket is configured. TIL's custom
 * `unpack-twbx` / `read-extracted-file` tools continue to use `os.tmpdir()/tableau-mcp`
 * as their sandbox root — they accept caller-controlled absolute paths, so this only
 * bounds the `read-extracted-file` path-traversal guard.
 */
export const TEMP_BASE = path.join(os.tmpdir(), 'tableau-mcp');

/**
 * Ensure the downloads directory exists.
 */
export async function ensureDownloadsDir(): Promise<string> {
  const dir = path.join(TEMP_BASE, 'downloads');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Ensure the extractions directory exists.
 */
export async function ensureExtractionsDir(): Promise<string> {
  const dir = path.join(TEMP_BASE, 'extracted');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Get the path for a downloaded file.
 */
export function getDownloadPath(filename: string): string {
  return path.join(TEMP_BASE, 'downloads', filename);
}

/**
 * Get the path for an extraction directory.
 */
export function getExtractionPath(basename: string): string {
  return path.join(TEMP_BASE, 'extracted', basename);
}

/**
 * Format file size in human-readable form.
 */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Check if a file exists.
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * File category type.
 */
export type FileCategory = 'twb' | 'data' | 'image' | 'other';

/**
 * Categorize a file by its extension.
 */
export function categorizeFile(filePath: string): FileCategory {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.twb':
      return 'twb';
    case '.hyper':
    case '.tde':
    case '.csv':
    case '.xlsx':
    case '.xls':
      return 'data';
    case '.png':
    case '.jpg':
    case '.jpeg':
    case '.gif':
    case '.svg':
    case '.ico':
      return 'image';
    default:
      return 'other';
  }
}
