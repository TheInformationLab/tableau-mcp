import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Err, Ok } from 'ts-results-es';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getGetExtractRefreshTaskTool } from './getExtractRefreshTask.js';
import { mockExtractRefreshTask } from './mockExtractRefreshTask.js';

const mocks = vi.hoisted(() => ({
  mockGetExtractRefreshTask: vi.fn(),
  mockAssertAdmin: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      tasksMethods: {
        getExtractRefreshTask: mocks.mockGetExtractRefreshTask,
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

describe('getExtractRefreshTaskTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAssertAdmin.mockResolvedValue(new Ok(true));
  });

  it('should create a tool instance with correct properties', () => {
    const tool = getGetExtractRefreshTaskTool(new WebMcpServer());
    expect(tool.name).toBe('get-extract-refresh-task');
    expect(tool.description).toContain('extract refresh task');
  });

  it('should return the task details', async () => {
    mocks.mockGetExtractRefreshTask.mockResolvedValue(mockExtractRefreshTask);

    const result = await getToolResult({ taskId: 'task-123' });

    expect(result.isError).toBeFalsy();
    expect(mocks.mockGetExtractRefreshTask).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      taskId: 'task-123',
    });
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(JSON.parse(text)).toMatchObject({ id: mockExtractRefreshTask.id });
  });

  it('should reject when the caller is not admin', async () => {
    mocks.mockAssertAdmin.mockResolvedValue(new Err('Not admin'));

    const result = await getToolResult({ taskId: 'task-123' });

    expect(result.isError).toBe(true);
    expect(mocks.mockGetExtractRefreshTask).not.toHaveBeenCalled();
  });

  it('should surface REST failures as errors', async () => {
    mocks.mockGetExtractRefreshTask.mockRejectedValue(new Error('API Error'));

    const result = await getToolResult({ taskId: 'task-123' });

    expect(result.isError).toBe(true);
  });
});

async function getToolResult(args: { taskId: string }): Promise<CallToolResult> {
  const tool = getGetExtractRefreshTaskTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}
