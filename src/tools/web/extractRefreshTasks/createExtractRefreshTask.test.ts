import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Err, Ok } from 'ts-results-es';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getCreateExtractRefreshTaskTool } from './createExtractRefreshTask.js';

const mocks = vi.hoisted(() => ({
  mockCreateExtractRefreshTask: vi.fn(),
  mockAssertAdmin: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      tasksMethods: {
        createExtractRefreshTask: mocks.mockCreateExtractRefreshTask,
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

describe('createExtractRefreshTaskTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAssertAdmin.mockResolvedValue(new Ok(true));
  });

  it('should create a tool instance with correct properties', () => {
    const tool = getCreateExtractRefreshTaskTool(new WebMcpServer());
    expect(tool.name).toBe('create-extract-refresh-task');
    expect(tool.description).toContain('Creates a new scheduled extract refresh task');
  });

  it('should create a task for a datasource', async () => {
    mocks.mockCreateExtractRefreshTask.mockResolvedValue({
      extractRefresh: { id: 'task-1' },
      schedule: { frequency: 'Daily' },
    });

    const result = await getToolResult({
      type: 'FullRefresh',
      datasourceId: 'ds-1',
      frequency: 'Daily',
      frequencyDetails: { start: '02:00:00' },
    });

    expect(result.isError).toBeFalsy();
    expect(mocks.mockCreateExtractRefreshTask).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      type: 'FullRefresh',
      workbookId: undefined,
      datasourceId: 'ds-1',
      frequency: 'Daily',
      frequencyDetails: { start: '02:00:00' },
    });
  });

  it('should reject when neither workbookId nor datasourceId is supplied', async () => {
    const result = await getToolResult({ type: 'FullRefresh', frequency: 'Daily' });
    expect(result.isError).toBe(true);
    expect(mocks.mockCreateExtractRefreshTask).not.toHaveBeenCalled();
  });

  it('should reject when both workbookId and datasourceId are supplied', async () => {
    const result = await getToolResult({
      type: 'FullRefresh',
      workbookId: 'wb-1',
      datasourceId: 'ds-1',
      frequency: 'Daily',
    });
    expect(result.isError).toBe(true);
    expect(mocks.mockCreateExtractRefreshTask).not.toHaveBeenCalled();
  });

  it('should reject when the caller is not admin', async () => {
    mocks.mockAssertAdmin.mockResolvedValue(new Err('Not admin'));

    const result = await getToolResult({
      type: 'FullRefresh',
      datasourceId: 'ds-1',
      frequency: 'Daily',
    });
    expect(result.isError).toBe(true);
    expect(mocks.mockCreateExtractRefreshTask).not.toHaveBeenCalled();
  });

  it('should surface REST failures as errors', async () => {
    mocks.mockCreateExtractRefreshTask.mockRejectedValue(new Error('API Error'));

    const result = await getToolResult({
      type: 'FullRefresh',
      datasourceId: 'ds-1',
      frequency: 'Daily',
    });
    expect(result.isError).toBe(true);
  });
});

async function getToolResult(args: {
  type: 'FullRefresh' | 'IncrementalRefresh';
  workbookId?: string;
  datasourceId?: string;
  frequency: 'Hourly' | 'Daily' | 'Weekly' | 'Monthly';
  frequencyDetails?: {
    start?: string;
    end?: string;
    intervals?: { interval?: Array<Record<string, unknown>> };
  };
}): Promise<CallToolResult> {
  const tool = getCreateExtractRefreshTaskTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}
