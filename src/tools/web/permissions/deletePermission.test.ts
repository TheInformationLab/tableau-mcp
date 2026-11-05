import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Ok } from 'ts-results-es';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getDeletePermissionTool } from './deletePermission.js';

const mocks = vi.hoisted(() => ({
  mockDeleteWorkbookPermission: vi.fn(),
  mockGuardMutation: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      permissionsMethods: {
        deleteWorkbookPermission: mocks.mockDeleteWorkbookPermission,
        deleteProjectPermission: vi.fn(),
        deleteDatasourcePermission: vi.fn(),
        deleteViewPermission: vi.fn(),
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
      getEstablishedNonce: () => 'mock-nonce-del',
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
  const tool = getDeletePermissionTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}

describe('deletePermissionTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGuardSuccess();
  });

  it('should reject invalid capability', async () => {
    const result = await getToolResult({
      resourceType: 'workbooks',
      resourceId: 'wb1',
      granteeType: 'users',
      granteeId: 'u1',
      capabilityName: 'BogusCap',
      capabilityMode: 'Allow',
    });
    expect(result.isError).toBe(true);
    expect(mocks.mockGuardMutation).not.toHaveBeenCalled();
  });

  it('preview should not delete', async () => {
    const result = await getToolResult({
      resourceType: 'workbooks',
      resourceId: 'wb1',
      granteeType: 'users',
      granteeId: 'u1',
      capabilityName: 'Read',
      capabilityMode: 'Allow',
    });
    expect(result.isError).toBeFalsy();
    expect(mocks.mockDeleteWorkbookPermission).not.toHaveBeenCalled();
    const text = (result.content[0] as { type: string; text: string }).text;
    expect(text).toContain('mock-nonce-del');
  });

  it('confirm should call the correct delete method', async () => {
    mocks.mockDeleteWorkbookPermission.mockResolvedValue(undefined);
    await getToolResult({
      resourceType: 'workbooks',
      resourceId: 'wb1',
      granteeType: 'users',
      granteeId: 'u1',
      capabilityName: 'Read',
      capabilityMode: 'Allow',
      confirm: true,
      confirmationToken: 'mock-nonce-del',
    });

    expect(mocks.mockDeleteWorkbookPermission).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      workbookId: 'wb1',
      granteeType: 'users',
      granteeId: 'u1',
      capabilityName: 'Read',
      capabilityMode: 'Allow',
    });
  });
});
