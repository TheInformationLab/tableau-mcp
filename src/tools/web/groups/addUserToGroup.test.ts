import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Err, Ok } from 'ts-results-es';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { mockUser } from '../users/mockUser.js';
import { getAddUserToGroupTool } from './addUserToGroup.js';

const mocks = vi.hoisted(() => ({
  mockAddUserToGroup: vi.fn(),
  mockAssertAdmin: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      groupsMethods: {
        addUserToGroup: mocks.mockAddUserToGroup,
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

describe('addUserToGroupTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAssertAdmin.mockResolvedValue(new Ok(true));
  });

  it('should create a tool instance', () => {
    const tool = getAddUserToGroupTool(new WebMcpServer());
    expect(tool.name).toBe('add-user-to-group');
  });

  it('should add the user and return the record', async () => {
    mocks.mockAddUserToGroup.mockResolvedValue(mockUser);
    const result = await getToolResult({ groupId: 'g1', userId: 'u1' });
    expect(result.isError).toBe(false);
    expect(mocks.mockAddUserToGroup).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      groupId: 'g1',
      userId: 'u1',
    });
  });

  it('should reject non-admin caller', async () => {
    mocks.mockAssertAdmin.mockResolvedValue(new Err('nope'));
    const result = await getToolResult({ groupId: 'g1', userId: 'u1' });
    expect(result.isError).toBe(true);
    expect(mocks.mockAddUserToGroup).not.toHaveBeenCalled();
  });
});

async function getToolResult(args: any): Promise<CallToolResult> {
  const tool = getAddUserToGroupTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}
