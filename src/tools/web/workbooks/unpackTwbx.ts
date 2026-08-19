import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import AdmZip from 'adm-zip';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Ok } from 'ts-results-es';
import { z } from 'zod';

import { UnknownError } from '../../../errors/mcpToolError.js';
import { WebMcpServer } from '../../../server.web.js';
import {
  categorizeFile,
  ensureExtractionsDir,
  FileCategory,
  fileExists,
  formatFileSize,
  getExtractionPath,
} from '../../../utils/fileSystem.js';
import { WebTool } from '../tool.js';

const paramsSchema = {
  filePath: z
    .string()
    .describe('Full path to the .twbx file to unpack (from download-workbook or manual upload)'),
  extractTo: z
    .string()
    .optional()
    .describe('Optional extraction directory. Defaults to a temp subdirectory based on filename.'),
};

interface FileInfo {
  path: string;
  size: number;
  sizeFormatted: string;
  category: FileCategory;
}

interface UnpackResult {
  extractionPath: string;
  mainTwbFile: string | null;
  mainTwbPath: string | null;
  summary: {
    totalFiles: number;
    totalSize: number;
    totalSizeFormatted: string;
    twbCount: number;
    dataCount: number;
    imageCount: number;
    otherCount: number;
  };
  categories: {
    twbFiles: string[];
    dataFiles: string[];
    imageFiles: string[];
    otherFiles: string[];
  };
  fileInventory: FileInfo[];
}

/**
 * Validate that a path is safe and within the target directory (Zip Slip protection)
 */
function isPathSafe(targetDir: string, entryPath: string): boolean {
  const resolvedPath = path.resolve(targetDir, entryPath);
  const resolvedTarget = path.resolve(targetDir);
  return resolvedPath.startsWith(resolvedTarget + path.sep) || resolvedPath === resolvedTarget;
}

export const getUnpackTwbxTool = (server: WebMcpServer): WebTool<typeof paramsSchema> => {
  const unpackTwbxTool = new WebTool({
    server,
    name: 'unpack-twbx',
    description: `
Extracts and analyzes the contents of a Tableau .twbx file. A .twbx is a packaged workbook containing the workbook XML (.twb), data extracts, and images.

Returns the extraction path and a categorized inventory of all files. Use with files downloaded via \`download-workbook\` (temp-path fallback) or any other .twbx on disk.

**Parameters:**
- \`filePath\` (required): Absolute path to the .twbx file.
- \`extractTo\` (optional): Absolute path to the extraction directory. Defaults to a subdir under the MCP temp directory.

**Response:** JSON with the extraction path, the main .twb file inside the archive, and a categorized inventory.
`,
    paramsSchema,
    annotations: {
      title: 'Unpack TWBX',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: false,
    },
    callback: async ({ filePath, extractTo }, extra): Promise<CallToolResult> => {
      return await unpackTwbxTool.logAndExecute<UnpackResult>({
        extra,
        args: { filePath, extractTo },
        callback: async () => {
          const exists = await fileExists(filePath);
          if (!exists) {
            return new UnknownError(
              `File not found: ${filePath}. Use download-workbook to fetch a workbook first.`,
              404,
            ).toErr();
          }

          const ext = path.extname(filePath).toLowerCase();
          if (ext !== '.twbx') {
            return new UnknownError(
              `Invalid file type: expected .twbx, got ${ext || '(no extension)'}`,
              400,
            ).toErr();
          }

          const baseName = path.basename(filePath, '.twbx');
          await ensureExtractionsDir();
          const extractionPath = extractTo || getExtractionPath(baseName);

          let zip: AdmZip;
          try {
            zip = new AdmZip(filePath);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return new UnknownError(`Failed to read TWBX file: ${message}`, 500).toErr();
          }

          const entries = zip.getEntries();
          const fileInventory: FileInfo[] = [];
          const categories = {
            twbFiles: [] as string[],
            dataFiles: [] as string[],
            imageFiles: [] as string[],
            otherFiles: [] as string[],
          };

          let totalSize = 0;
          let mainTwbFile: string | null = null;

          try {
            await fs.mkdir(extractionPath, { recursive: true });

            for (const entry of entries) {
              if (entry.isDirectory) continue;

              const entryPath = entry.entryName;

              // Zip Slip protection: reject entries that would escape the extraction directory.
              if (!isPathSafe(extractionPath, entryPath)) {
                return new UnknownError(
                  `Unsafe path detected in archive: ${entryPath}`,
                  400,
                ).toErr();
              }

              const category = categorizeFile(entryPath);
              const size = entry.header.size;

              totalSize += size;

              fileInventory.push({
                path: entryPath,
                size,
                sizeFormatted: formatFileSize(size),
                category,
              });

              switch (category) {
                case 'twb':
                  categories.twbFiles.push(entryPath);
                  if (
                    !mainTwbFile ||
                    entryPath.split('/').length < mainTwbFile.split('/').length
                  ) {
                    mainTwbFile = entryPath;
                  }
                  break;
                case 'data':
                  categories.dataFiles.push(entryPath);
                  break;
                case 'image':
                  categories.imageFiles.push(entryPath);
                  break;
                default:
                  categories.otherFiles.push(entryPath);
              }

              const targetPath = path.join(extractionPath, entryPath);
              const targetDir = path.dirname(targetPath);
              await fs.mkdir(targetDir, { recursive: true });
              await fs.writeFile(targetPath, entry.getData());
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return new UnknownError(`Failed to extract TWBX file: ${message}`, 500).toErr();
          }

          return new Ok({
            extractionPath,
            mainTwbFile,
            mainTwbPath: mainTwbFile ? path.join(extractionPath, mainTwbFile) : null,
            summary: {
              totalFiles: fileInventory.length,
              totalSize,
              totalSizeFormatted: formatFileSize(totalSize),
              twbCount: categories.twbFiles.length,
              dataCount: categories.dataFiles.length,
              imageCount: categories.imageFiles.length,
              otherCount: categories.otherFiles.length,
            },
            categories,
            fileInventory,
          });
        },
        constrainSuccessResult: (result) => ({ type: 'success', result }),
      });
    },
  });

  return unpackTwbxTool;
};
