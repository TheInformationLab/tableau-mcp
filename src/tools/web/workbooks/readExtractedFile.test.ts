import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs/promises';
import * as path from 'path';

import { WebMcpServer } from '../../../server.web.js';
import { TEMP_BASE } from '../../../utils/fileSystem.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getReadExtractedFileTool } from './readExtractedFile.js';

async function getToolResult(args: {
  filePath: string;
  maxSizeBytes?: number;
}): Promise<CallToolResult> {
  const tool = getReadExtractedFileTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}

describe('readExtractedFileTool', () => {
  const testDir = path.join(TEMP_BASE, 'read-extracted-file-test');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });
  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  it('should have correct name', () => {
    const tool = getReadExtractedFileTool(new WebMcpServer());
    expect(tool.name).toBe('read-extracted-file');
  });

  it('should reject paths containing ..', async () => {
    const result = await getToolResult({ filePath: path.join(TEMP_BASE, '..', 'secret.txt') });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('Access denied');
  });

  it('should reject paths outside TEMP_BASE', async () => {
    const result = await getToolResult({ filePath: '/etc/hosts' });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('Access denied');
  });

  it('should read a file within TEMP_BASE', async () => {
    const filePath = path.join(testDir, 'sample.xml');
    await fs.writeFile(filePath, '<hello>world</hello>');
    const result = await getToolResult({ filePath });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.content).toBe('<hello>world</hello>');
    expect(parsed.fileName).toBe('sample.xml');
  });

  it('should return error for missing file', async () => {
    const result = await getToolResult({ filePath: path.join(testDir, 'missing.xml') });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('File not found');
  });

  it('should enforce size limit', async () => {
    const filePath = path.join(testDir, 'big.txt');
    await fs.writeFile(filePath, 'x'.repeat(2000));
    const result = await getToolResult({ filePath, maxSizeBytes: 100 });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('exceeds limit');
  });
});
