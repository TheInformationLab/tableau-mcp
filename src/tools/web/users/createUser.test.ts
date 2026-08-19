import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Err, Ok } from 'ts-results-es';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getCreateUserTool } from './createUser.js';
import { mockUser } from './mockUser.js';

const mocks = vi.hoisted(() => ({
  mockCreateUser: vi.fn(),
  mockAssertAdmin: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      usersMethods: {
        createUser: mocks.mockCreateUser,
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

describe('createUserTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAssertAdmin.mockResolvedValue(new Ok(true));
  });

  it('should create a tool instance with correct properties', () => {
    const tool = getCreateUserTool(new WebMcpServer());
    expect(tool.name).toBe('create-user');
    expect(tool.description).toContain('Adds a new user');
  });

  it('should create the user and return the record', async () => {
    mocks.mockCreateUser.mockResolvedValue(mockUser);
    const result = await getToolResult({
      name: 'jsmith',
      siteRole: 'Creator',
    });
    expect(result.isError).toBe(false);
    expect(mocks.mockCreateUser).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      user: { name: 'jsmith', siteRole: 'Creator', authSetting: undefined },
    });
  });

  it('should pass authSetting when provided', async () => {
    mocks.mockCreateUser.mockResolvedValue(mockUser);
    await getToolResult({ name: 'jdoe', siteRole: 'Viewer', authSetting: 'SAML' });
    expect(mocks.mockCreateUser).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      user: { name: 'jdoe', siteRole: 'Viewer', authSetting: 'SAML' },
    });
  });

  it('should reject a non-admin caller', async () => {
    mocks.mockAssertAdmin.mockResolvedValue(new Err('nope'));
    const result = await getToolResult({ name: 'jsmith', siteRole: 'Creator' });
    expect(result.isError).toBe(true);
    expect(mocks.mockCreateUser).not.toHaveBeenCalled();
  });
});

async function getToolResult(args: any): Promise<CallToolResult> {
  const tool = getCreateUserTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}
