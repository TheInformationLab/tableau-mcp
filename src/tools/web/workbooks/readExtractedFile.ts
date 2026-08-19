import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Ok } from 'ts-results-es';
import { z } from 'zod';

import { UnknownError } from '../../../errors/mcpToolError.js';
import { WebMcpServer } from '../../../server.web.js';
import { fileExists, formatFileSize, TEMP_BASE } from '../../../utils/fileSystem.js';
import { WebTool } from '../tool.js';

const DEFAULT_MAX_SIZE = 10 * 1024 * 1024; // 10MB

const paramsSchema = {
  filePath: z
    .string()
    .describe(
      'Absolute path to the file to read. Must be within the tableau-mcp temp directory (path-traversal guard).',
    ),
  maxSizeBytes: z
    .number()
    .optional()
    .describe('Maximum file size in bytes. Default 10485760 (10MB). Returns error if exceeded.'),
};

interface ReadFileResult {
  filePath: string;
  fileName: string;
  size: number;
  sizeFormatted: string;
  content: string;
  truncated: boolean;
}

/**
 * Validate that a path is safe and within the allowed directory.
 */
function isPathAllowed(filePath: string): boolean {
  if (filePath.includes('..')) {
    return false;
  }

  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(TEMP_BASE);

  return resolvedPath.startsWith(resolvedBase + path.sep) || resolvedPath === resolvedBase;
}

export const getReadExtractedFileTool = (
  server: WebMcpServer,
): WebTool<typeof paramsSchema> => {
  const readExtractedFileTool = new WebTool({
    server,
    name: 'read-extracted-file',
    description: `
Reads the contents of a text-based file from the MCP server's temp filesystem.

Typically used after \`unpack-twbx\` to read TWB XML files or other extracted content. Only allows reading files within the tableau-mcp temp directory (path-traversal guard).

**Parameters:**
- \`filePath\` (required): Absolute path to the file. Must be within the MCP temp directory.
- \`maxSizeBytes\` (optional): Maximum file size in bytes. Default 10MB.

**Response:** JSON with the file path, name, size, and text content.
`,
    paramsSchema,
    annotations: {
      title: 'Read Extracted File',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
    callback: async ({ filePath, maxSizeBytes }, extra): Promise<CallToolResult> => {
      const maxSize = maxSizeBytes ?? DEFAULT_MAX_SIZE;

      return await readExtractedFileTool.logAndExecute<ReadFileResult>({
        extra,
        args: { filePath, maxSizeBytes: maxSize },
        callback: async () => {
          if (!isPathAllowed(filePath)) {
            return new UnknownError(
              `Access denied: Path must be within ${TEMP_BASE} and cannot contain '..'`,
              403,
            ).toErr();
          }

          const resolvedPath = path.resolve(filePath);

          const exists = await fileExists(resolvedPath);
          if (!exists) {
            return new UnknownError(`File not found: ${resolvedPath}`, 404).toErr();
          }

          let stats;
          try {
            stats = await fs.stat(resolvedPath);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return new UnknownError(`Failed to read file stats: ${message}`, 500).toErr();
          }

          if (!stats.isFile()) {
            return new UnknownError('Path is not a file', 400).toErr();
          }

          if (stats.size > maxSize) {
            return new UnknownError(
              `File size (${formatFileSize(stats.size)}) exceeds limit (${formatFileSize(maxSize)})`,
              413,
            ).toErr();
          }

          let content: string;
          try {
            content = await fs.readFile(resolvedPath, 'utf-8');
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return new UnknownError(`Failed to read file: ${message}`, 500).toErr();
          }

          return new Ok({
            filePath: resolvedPath,
            fileName: path.basename(resolvedPath),
            size: stats.size,
            sizeFormatted: formatFileSize(stats.size),
            content,
            truncated: false,
          });
        },
        constrainSuccessResult: (result) => ({ type: 'success', result }),
      });
    },
  });

  return readExtractedFileTool;
};
