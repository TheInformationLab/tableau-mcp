import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Err, Ok } from 'ts-results-es';

import { WebMcpServer } from '../../../server.web.js';
import { Provider } from '../../../utils/provider.js';
import { getMockRequestHandlerExtra } from '../toolContext.mock.js';
import { mockProject } from './mockProject.js';
import { getUpdateProjectTool } from './updateProject.js';

const mocks = vi.hoisted(() => ({
  mockUpdateProject: vi.fn(),
  mockAssertAdmin: vi.fn(),
  mockIsProjectAllowed: vi.fn(),
}));

vi.mock('../../../restApiInstance.js', () => ({
  useRestApi: vi.fn().mockImplementation(async ({ callback }) =>
    callback({
      projectsMethods: {
        updateProject: mocks.mockUpdateProject,
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

describe('updateProjectTool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.mockAssertAdmin.mockResolvedValue(new Ok(true));
    mocks.mockIsProjectAllowed.mockResolvedValue({ allowed: true });
  });

  it('should create a tool instance with correct properties', () => {
    const tool = getUpdateProjectTool(new WebMcpServer());
    expect(tool.name).toBe('update-project');
    expect(tool.description).toContain('Updates an existing project');
  });

  it('should call updateProject with the supplied fields', async () => {
    mocks.mockUpdateProject.mockResolvedValue(mockProject);

    const result = await getToolResult({
      projectId: 'proj-1',
      name: 'Renamed',
      description: 'new desc',
    });

    expect(result.isError).toBeFalsy();
    expect(mocks.mockUpdateProject).toHaveBeenCalledWith({
      siteId: 'test-site-id',
      projectId: 'proj-1',
      project: expect.objectContaining({ name: 'Renamed', description: 'new desc' }),
    });
    expect(mocks.mockIsProjectAllowed).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: 'proj-1' }),
    );
  });

  it('should reject when the target project is not allowed', async () => {
    mocks.mockIsProjectAllowed.mockResolvedValueOnce({
      allowed: false,
      message: 'blocked',
    });

    const result = await getToolResult({ projectId: 'proj-1', name: 'x' });

    expect(result.isError).toBe(true);
    expect(mocks.mockUpdateProject).not.toHaveBeenCalled();
  });

  it('should reject when moving to a disallowed parent', async () => {
    mocks.mockIsProjectAllowed
      .mockResolvedValueOnce({ allowed: true }) // target
      .mockResolvedValueOnce({ allowed: false, message: 'parent blocked' });

    const result = await getToolResult({ projectId: 'proj-1', parentProjectId: 'bad-parent' });

    expect(result.isError).toBe(true);
    expect(mocks.mockUpdateProject).not.toHaveBeenCalled();
  });

  it('should reject when the caller is not admin', async () => {
    mocks.mockAssertAdmin.mockResolvedValue(new Err('Not admin'));

    const result = await getToolResult({ projectId: 'proj-1', name: 'x' });

    expect(result.isError).toBe(true);
    expect(mocks.mockUpdateProject).not.toHaveBeenCalled();
  });

  it('should surface REST failures as errors', async () => {
    mocks.mockUpdateProject.mockRejectedValue(new Error('Network fail'));

    const result = await getToolResult({ projectId: 'proj-1', name: 'x' });

    expect(result.isError).toBe(true);
  });
});

async function getToolResult(args: {
  projectId: string;
  name?: string;
  description?: string;
  contentPermissions?: 'LockedToProject' | 'ManagedByOwner' | 'LockedToProjectWithoutNested';
  parentProjectId?: string;
  ownerId?: string;
}): Promise<CallToolResult> {
  const tool = getUpdateProjectTool(new WebMcpServer());
  const callback = await Provider.from(tool.callback);
  return await callback(args, getMockRequestHandlerExtra());
}
