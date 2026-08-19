import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Err, Ok } from 'ts-results-es';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getRunExtractRefreshTaskTool } from './runExtractRefreshTask.js';

const mocks = vi.hoisted(() => ({
  mockRunExtractRefreshTask: vi.fn(),
  mockAssertAdmin: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      tasksMethods: {
        runExtractRefreshTask: mocks.mockRunExtractRefreshTask,
      },
      siteId: 'test-site-id',
    }),
  ),
}));

vi.mock('../../../config.js', () => ({
  getConfig: vi.fn(() => ({
    adminToolsEnabled: true,
    productTelemetryEnabled: false,
    productTelemetryEndpoint: 'https://test.com',
    server: 'https://test.tableau.com',
  })),
}));

vi.mock('../adminGate.js', () => ({
  assertAdmin: (...args: unknown[]) => mocks.mockAssertAdmin(...args),
}));

describe('runExtractRefreshTaskTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAssertAdmin.mockResolvedValue(new Ok(true));
  });

  it('should create a tool instance with correct properties', () => {
    const tool = getRunExtractRefreshTaskTool(new WebMcpServer());
    expect(tool.name).toBe('run-extract-refresh-task');
    expect(tool.description).toContain('Runs an extract refresh task immediately');
  });

  it('should return the queued Job on success', async () => {
    mocks.mockRunExtractRefreshTask.mockResolvedValue({ id: 'job-1', mode: 'Asynchronous' });

    const result = await getToolResult({ taskId: 'task-1' });

    expect(result.isError).toBeFalsy();
    expect(mocks.mockRunExtractRefreshTask).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      taskId: 'task-1',
    });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(JSON.parse(text)).toMatchObject({ id: 'job-1' });
  });

  it('should reject when the caller is not admin', async () => {
    mocks.mockAssertAdmin.mockResolvedValue(new Err('Not admin'));

    const result = await getToolResult({ taskId: 'task-1' });
    expect(result.isError).toBe(true);
    expect(mocks.mockRunExtractRefreshTask).not.toHaveBeenCalled();
  });

  it('should surface REST failures as errors', async () => {
    mocks.mockRunExtractRefreshTask.mockRejectedValue(new Error('boom'));

    const result = await getToolResult({ taskId: 'task-1' });
    expect(result.isError).toBe(true);
  });
});

async function getToolResult(args: { taskId: string }): Promise<CallToolResult> {
  const tool = getRunExtractRefreshTaskTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}
