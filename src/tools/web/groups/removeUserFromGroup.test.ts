import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Err, Ok } from 'ts-results-es';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getRemoveUserFromGroupTool } from './removeUserFromGroup.js';

const mocks = vi.hoisted(() => ({
  mockRemoveUserFromGroup: vi.fn(),
  mockAssertAdmin: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      groupsMethods: {
        removeUserFromGroup: mocks.mockRemoveUserFromGroup,
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

describe('removeUserFromGroupTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAssertAdmin.mockResolvedValue(new Ok(true));
  });

  it('should create a tool instance', () => {
    const tool = getRemoveUserFromGroupTool(new WebMcpServer());
    expect(tool.name).toBe('remove-user-from-group');
  });

  it('should remove the user and return a success message', async () => {
    mocks.mockRemoveUserFromGroup.mockResolvedValue(undefined);
    const result = await getToolResult({ groupId: 'g1', userId: 'u1' });
    expect(result.isError).toBe(false);
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('successfully removed');
    expect(mocks.mockRemoveUserFromGroup).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      groupId: 'g1',
      userId: 'u1',
    });
  });

  it('should reject non-admin caller', async () => {
    mocks.mockAssertAdmin.mockResolvedValue(new Err('nope'));
    const result = await getToolResult({ groupId: 'g1', userId: 'u1' });
    expect(result.isError).toBe(true);
    expect(mocks.mockRemoveUserFromGroup).not.toHaveBeenCalled();
  });
});

async function getToolResult(args: any): Promise<CallToolResult> {
  const tool = getRemoveUserFromGroupTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}
