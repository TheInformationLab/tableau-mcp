import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import AdmZip from 'adm-zip';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { WebMcpServer } from '../../../server.web.js';
import { TEMP_BASE } from '../../../utils/fileSystem.js';
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
  let extractBase: string;
  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'unpack-twbx-test-'));
    // extractTo must be within TEMP_BASE per the C1 security constraint; use a
    // unique subdir so parallel test runs don't collide.
    extractBase = path.join(TEMP_BASE, 'test-' + path.basename(tmpDir));
  });
  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(extractBase, { recursive: true, force: true }).catch(() => {});
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
    const extractTo = path.join(extractBase, 'out');
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
    // adm-zip's addFile() sanitizes leading '../', so mutate entryName after adding to
    // construct a real Zip Slip payload that survives round-tripping through the archive.
    zip.addFile('placeholder.txt', Buffer.from('pwned'));
    zip.getEntries()[0].entryName = '../evil.txt';
    const twbxPath = path.join(tmpDir, 'evil.twbx');
    zip.writeZip(twbxPath);
    // extractTo is within TEMP_BASE (C1 constraint); '../evil.txt' still escapes
    // extractTo and is caught by isPathSafe (the Zip Slip guard).
    const extractTo = path.join(extractBase, 'out');
    const result = await getToolResult({ filePath: twbxPath, extractTo });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('Unsafe path');
  });
});
