import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Err, Ok } from 'ts-results-es';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { getCreateProjectTool } from './createProject.js';
import { mockProject } from './mockProject.js';

const mocks = vi.hoisted(() => ({
  mockCreateProject: vi.fn(),
  mockAssertAdmin: vi.fn(),
  mockIsProjectAllowed: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      projectsMethods: {
        createProject: mocks.mockCreateProject,
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

vi.mock('../resourceAccessChecker.js', () => ({
  resourceAccessChecker: {
    isProjectAllowed: (...args: unknown[]) => mocks.mockIsProjectAllowed(...args),
  },
}));

describe('createProjectTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAssertAdmin.mockResolvedValue(new Ok(true));
    mocks.mockIsProjectAllowed.mockResolvedValue({ allowed: true });
  });

  it('should create a tool instance with correct properties', () => {
    const tool = getCreateProjectTool(new WebMcpServer());
    expect(tool.name).toBe('create-project');
    expect(tool.description).toContain('Creates a new project');
  });

  it('should call createProject with a top-level project', async () => {
    mocks.mockCreateProject.mockResolvedValue(mockProject);

    const result = await getToolResult({ name: 'Samples' });

    expect(result.isError).toBeFalsy();
    expect(mocks.mockCreateProject).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      project: {
        name: 'Samples',
        description: undefined,
        contentPermissions: undefined,
        parentProjectId: undefined,
      },
    });
    // Bounded-context check must be skipped for top-level creates.
    expect(mocks.mockIsProjectAllowed).not.toHaveBeenCalled();
  });

  it('should call createProject with a nested project and gate on parent bounded-context', async () => {
    mocks.mockCreateProject.mockResolvedValue(mockProject);

    const result = await getToolResult({ name: 'Nested', parentProjectId: 'parent-luid-123' });

    expect(result.isError).toBeFalsy();
    expect(mocks.mockIsProjectAllowed).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'parent-luid-123' }),
    );
    expect(mocks.mockCreateProject).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      project: expect.objectContaining({
        name: 'Nested',
        parentProjectId: 'parent-luid-123',
      }),
    });
  });

  it('should reject when the parent project is not allowed by bounded-context', async () => {
    mocks.mockIsProjectAllowed.mockResolvedValue({
      allowed: false,
      message: 'Parent project not allowed.',
    });

    const result = await getToolResult({ name: 'Nested', parentProjectId: 'parent-luid-123' });

    expect(result.isError).toBe(true);
    expect(mocks.mockCreateProject).not.toHaveBeenCalled();
  });

  it('should reject when the caller is not admin', async () => {
    mocks.mockAssertAdmin.mockResolvedValue(new Err('Not admin'));

    const result = await getToolResult({ name: 'Samples' });

    expect(result.isError).toBe(true);
    expect(mocks.mockCreateProject).not.toHaveBeenCalled();
  });

  it('should surface REST failures as errors', async () => {
    mocks.mockCreateProject.mockRejectedValue(new Error('Network fail'));

    const result = await getToolResult({ name: 'Samples' });

    expect(result.isError).toBe(true);
  });
});

async function getToolResult(args: {
  name: string;
  description?: string;
  contentPermissions?: 'LockedToProject' | 'ManagedByOwner' | 'LockedToProjectWithoutNested';
  parentProjectId?: string;
}): Promise<CallToolResult> {
  const tool = getCreateProjectTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}
