import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getUpdateDefaultPermissionsTool } from './updateDefaultPermissions.js';

const mocks = vi.hoisted(() => ({
  mockUpdateDefaultPermissions: vi.fn(),
  mockGuardMutation: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      permissionsMethods: {
        updateDefaultPermissions: mocks.mockUpdateDefaultPermissions,
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
      getEstablishedNonce: () => 'mock-nonce-xyz',
    })),
  };
});

function mockGuardSuccess(): void {
  mocks.mockGuardMutation.mockResolvedValue(
    new Ok({
      actor: { siteLuid: 'test-site-id', siteName: 'tc25' },
      target: { id: 'x', kind: 'permission' },
      recordOutcome: vi.fn(),
    }),
  );
}

async function getToolResult(args: any): Promise<CallToolResult> {
  const tool = getUpdateDefaultPermissionsTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}

describe('updateDefaultPermissionsTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGuardSuccess();
  });

  it('should reject invalid capability without calling guard', async () => {
    const result = await getToolResult({
      projectId: 'p1',
      resourceType: 'workbooks',
      granteeType: 'user',
      granteeId: 'u1',
      capabilities: [{ name: 'BadCap', mode: 'Allow' }],
    });

    expect(result.isError).toBe(true);
    expect(mocks.mockGuardMutation).not.toHaveBeenCalled();
  });

  it('preview should not apply the change', async () => {
    const result = await getToolResult({
      projectId: 'p1',
      resourceType: 'workbooks',
      granteeType: 'group',
      granteeId: 'g1',
      capabilities: [{ name: 'Read', mode: 'Allow' }],
    });
    expect(result.isError).toBeFalsy();
    expect(mocks.mockUpdateDefaultPermissions).not.toHaveBeenCalled();
  });

  it('confirm should call updateDefaultPermissions with the correct shape', async () => {
    mocks.mockUpdateDefaultPermissions.mockResolvedValue({ granteeCapabilities: [] });
    await getToolResult({
      projectId: 'p1',
      resourceType: 'workbooks',
      granteeType: 'user',
      granteeId: 'u1',
      capabilities: [{ name: 'Read', mode: 'Allow' }],
      confirm: true,
      confirmationToken: 'mock-nonce-xyz',
    });

    expect(mocks.mockUpdateDefaultPermissions).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      projectId: 'p1',
      resourceType: 'workbooks',
      granteeCapabilities: [
        {
          user: { id: 'u1' },
          capabilities: { capability: [{ name: 'Read', mode: 'Allow' }] },
        },
      ],
    });
  });
});
