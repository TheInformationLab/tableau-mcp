import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getAddPermissionsTool } from './addPermissions.js';

const mocks = vi.hoisted(() => ({
  mockAddWorkbookPermissions: vi.fn(),
  mockAddProjectPermissions: vi.fn(),
  mockGuardMutation: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      permissionsMethods: {
        addWorkbookPermissions: mocks.mockAddWorkbookPermissions,
        addProjectPermissions: mocks.mockAddProjectPermissions,
        addDatasourcePermissions: vi.fn(),
        addViewPermissions: vi.fn(),
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

vi.mock('../_lib/mutationGuard.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_lib/mutationGuard.js')>();
  return { ...actual, guardMutation: mocks.mockGuardMutation };
});

vi.mock('../_lib/evidence.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../_lib/evidence.js')>();
  return {
    ...actual,
    RegistryEvidence: vi.fn().mockImplementation(() => ({
      establish: vi.fn(),
      verify: vi.fn().mockResolvedValue(true),
      describeEvidence: () => ({ kind: 'registry-nonce' }),
      getEstablishedNonce: () => 'mock-nonce-abc',
    })),
  };
});

function mockGuardSuccess(): void {
  mocks.mockGuardMutation.mockResolvedValue(
    new Ok({
      actor: { siteLuid: 'test-site-id', siteName: 'tc25' },
      target: {
        id: 'workbooks/wb1/users/u1',
        kind: 'permission',
      },
      recordOutcome: vi.fn(),
    }),
  );
}

async function getToolResult(args: any): Promise<CallToolResult> {
  const tool = getAddPermissionsTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}

describe('addPermissionsTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGuardSuccess();
  });

  it('should have correct name and admin-gated annotations', () => {
    const tool = getAddPermissionsTool(new WebMcpServer());
    expect(tool.name).toBe('add-permissions');
    expect(tool.annotations?.destructiveHint).toBe(true);
  });

  it('should reject invalid capability without calling guard', async () => {
    const result = await getToolResult({
      resourceType: 'workbooks',
      resourceId: 'wb1',
      granteeType: 'user',
      granteeId: 'u1',
      capabilities: [{ name: 'NotARealCapability', mode: 'Allow' }],
    });

    expect(result.isError).toBe(true);
    expect(mocks.mockGuardMutation).not.toHaveBeenCalled();
  });

  it('preview should return nonce and not call the mutation', async () => {
    const result = await getToolResult({
      resourceType: 'workbooks',
      resourceId: 'wb1',
      granteeType: 'user',
      granteeId: 'u1',
      capabilities: [{ name: 'Read', mode: 'Allow' }],
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('Preview');
    expect(text).toContain('mock-nonce-abc');
    expect(mocks.mockAddWorkbookPermissions).not.toHaveBeenCalled();
  });

  it('confirm should call the REST method', async () => {
    mocks.mockAddWorkbookPermissions.mockResolvedValue({ granteeCapabilities: [] });
    const result = await getToolResult({
      resourceType: 'workbooks',
      resourceId: 'wb1',
      granteeType: 'user',
      granteeId: 'u1',
      capabilities: [{ name: 'Read', mode: 'Allow' }],
      confirm: true,
      confirmationToken: 'mock-nonce-abc',
    });

    expect(result.isError).toBeFalsy();
    expect(mocks.mockAddWorkbookPermissions).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      workbookId: 'wb1',
      granteeCapabilities: [
        {
          user: { id: 'u1' },
          capabilities: { capability: [{ name: 'Read', mode: 'Allow' }] },
        },
      ],
    });
  });

  it('should dispatch to the correct method for projects', async () => {
    mocks.mockAddProjectPermissions.mockResolvedValue({ granteeCapabilities: [] });
    await getToolResult({
      resourceType: 'projects',
      resourceId: 'p1',
      granteeType: 'group',
      granteeId: 'g1',
      capabilities: [{ name: 'Read', mode: 'Allow' }],
      confirm: true,
      confirmationToken: 'mock-nonce-abc',
    });

    expect(mocks.mockAddProjectPermissions).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      projectId: 'p1',
      granteeCapabilities: [
        {
          group: { id: 'g1' },
          capabilities: { capability: [{ name: 'Read', mode: 'Allow' }] },
        },
      ],
    });
  });
});
