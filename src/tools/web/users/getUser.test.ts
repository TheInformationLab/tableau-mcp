import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Err, Ok } from 'ts-results-es';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getGetUserTool } from './getUser.js';
import { mockUser } from './mockUser.js';

const mocks = vi.hoisted(() => ({
  mockQueryUserOnSite: vi.fn(),
  mockAssertAdmin: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      usersMethods: {
        queryUserOnSite: mocks.mockQueryUserOnSite,
      },
      siteId: 'test-site-id',
      userId: 'test-user-id',
    }),
  ),
}));

vi.mock('../adminGate.js', () => ({
  assertAdmin: mocks.mockAssertAdmin,
}));

vi.mock('../../../config.js', () => ({
  getConfig: vi.fn(() => ({
    adminToolsEnabled: true,
    productTelemetryEnabled: false,
    productTelemetryEndpoint: 'https://test.com',
    server: 'https://test.tableau.com',
  })),
}));

describe('getUserTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAssertAdmin.mockResolvedValue(new Ok(true));
  });

  it('should create a tool instance with correct properties', () => {
    const tool = getGetUserTool(new WebMcpServer());
    expect(tool.name).toBe('get-user');
    expect(tool.description).toContain('Retrieves information about the specified user');
  });

  it('should return the user record on success', async () => {
    mocks.mockQueryUserOnSite.mockResolvedValue(mockUser);
    const result = await getToolResult({ userId: mockUser.id });
    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: string; text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.id).toBe(mockUser.id);
    expect(parsed.name).toBe(mockUser.name);
    expect(mocks.mockQueryUserOnSite).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      userId: mockUser.id,
    });
  });

  it('should surface an error when the user is not admin', async () => {
    mocks.mockAssertAdmin.mockResolvedValue(new Err('This tool requires site administrator permissions'));
    const result = await getToolResult({ userId: mockUser.id });
    expect(result.isError).toBe(true);
    expect(mocks.mockQueryUserOnSite).not.toHaveBeenCalled();
  });

  it('should surface API errors', async () => {
    mocks.mockQueryUserOnSite.mockRejectedValue(new Error('API Error'));
    const result = await getToolResult({ userId: mockUser.id });
    expect(result.isError).toBe(true);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('API Error');
  });
});

async function getToolResult(args: { userId: string }): Promise<CallToolResult> {
  const tool = getGetUserTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}
