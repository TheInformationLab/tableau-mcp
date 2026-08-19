import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import AdmZip from 'adm-zip';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getUnpackTwbxTool } from './unpackTwbx.js';

async function makeTwbx(dir: string, entries: Record<string, string>): Promise<string> {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.from(content, 'utf-8'));
  }
  const twbxPath = path.join(dir, 'test.twbx');
  zip.writeZip(twbxPath);
  return twbxPath;
}

async function getToolResult(args: {
  filePath: string;
  extractTo?: string;
}): Promise<CallToolResult> {
  const tool = getUnpackTwbxTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}

describe('unpackTwbxTool', () => {
  let tmpDir: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'unpack-twbx-test-'));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  });

  it('should have correct name', () => {
    const tool = getUnpackTwbxTool(new WebMcpServer());
    expect(tool.name).toBe('unpack-twbx');
  });

  it('should reject non-.twbx files', async () => {
    const badPath = path.join(tmpDir, 'not-a-twbx.txt');
    await fs.writeFile(badPath, 'hi');
    const result = await getToolResult({ filePath: badPath });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('Invalid file type');
  });

  it('should reject missing files', async () => {
    const result = await getToolResult({
      filePath: path.join(tmpDir, 'does-not-exist.twbx'),
    });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('File not found');
  });

  it('should extract a valid TWBX and categorize files', async () => {
    const twbxPath = await makeTwbx(tmpDir, {
      'workbook.twb': '<workbook />',
      'data/extract.hyper': 'binary',
      'images/thumbnail.png': 'png-bytes',
      'notes.txt': 'other',
    });
    const extractTo = path.join(tmpDir, 'out');
    const result = await getToolResult({ filePath: twbxPath, extractTo });
    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.summary.twbCount).toBe(1);
    expect(parsed.summary.dataCount).toBe(1);
    expect(parsed.summary.imageCount).toBe(1);
    expect(parsed.summary.otherCount).toBe(1);
    expect(parsed.mainTwbFile).toBe('workbook.twb');
    expect(parsed.extractionPath).toBe(extractTo);
    // The workbook.twb file should exist on disk.
    await fs.access(path.join(extractTo, 'workbook.twb'));
  });

  it('should reject a Zip Slip path traversal entry', async () => {
    const zip = new AdmZip();
    zip.addFile('../evil.txt', Buffer.from('pwned'));
    const twbxPath = path.join(tmpDir, 'evil.twbx');
    zip.writeZip(twbxPath);
    const extractTo = path.join(tmpDir, 'out');
    const result = await getToolResult({ filePath: twbxPath, extractTo });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('Unsafe path');
  });
});
