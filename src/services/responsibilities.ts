import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap } from '@/lib/http';
import type {
  AssignResponsibilityPayload,
  BulkAssignResult,
  Paginated,
  ResponsibilityArea,
  ResponsibilityAreaPayload,
  ResponsibilityAssignment,
  ResponsibilityMatrix,
  ResponsibilityType,
  UpdateResponsibilityPayload,
} from '@/types/domain';

// ---------------------------------------------------------------------------
// Demo store (in-file: keeps demoStore.ts untouched). Only used in demo mode.
// ---------------------------------------------------------------------------
const demoAreas: ResponsibilityArea[] = [
  { id: 'demo-area-1', companyId: 'demo-company', name: 'Social Media', areaKey: 'PUBLISHING', description: null, sortOrder: 1, isActive: true, createdById: null, updatedById: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'demo-area-2', companyId: 'demo-company', name: 'Marketing', description: null, sortOrder: 2, isActive: true, createdById: null, updatedById: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];
const demoMatrix: ResponsibilityMatrix = {
  areas: demoAreas.map((area) => ({ id: area.id, name: area.name, sortOrder: area.sortOrder, areaKey: area.areaKey ?? null })),
  members: [
    { userId: 'demo-user-1', fullName: 'Kamal', email: 'kamal@agency.com', role: 'DESIGNER' },
    { userId: 'demo-user-2', fullName: 'Naya', email: 'naya@agency.com', role: 'SOCIAL_MEDIA_MANAGER' },
  ],
  cells: [
    { assignmentId: 'demo-cell-1', areaId: 'demo-area-1', memberUserId: 'demo-user-1', type: 'TO_SUPPORT', customLabel: null, note: null },
  ],
};
const demoDelay = <T>(value: T): Promise<T> => new Promise((resolve) => setTimeout(() => resolve(value), 250));

// ---------------------------------------------------------------------------
// Normalizers — defensive against envelope wrapping and field drift, in line
// with the established service-layer normalization pattern.
// ---------------------------------------------------------------------------
function normalizeMatrix(raw: unknown): ResponsibilityMatrix {
  const data = unwrap<Partial<ResponsibilityMatrix>>(raw as ResponsibilityMatrix) ?? {};
  return {
    areas: Array.isArray(data.areas) ? data.areas : [],
    members: Array.isArray(data.members) ? data.members : [],
    cells: Array.isArray(data.cells) ? data.cells : [],
  };
}

function normalizePaginated<T>(raw: unknown): Paginated<T> {
  const data = (raw ?? {}) as Partial<Paginated<T>> & { data?: Partial<Paginated<T>> };
  const source = Array.isArray(data.items) ? data : (data.data ?? data);
  return {
    items: Array.isArray(source.items) ? source.items : [],
    total: typeof source.total === 'number' ? source.total : 0,
    limit: typeof source.limit === 'number' ? source.limit : 100,
    offset: typeof source.offset === 'number' ? source.offset : 0,
  };
}

export interface ResponsibilityAreaListParams {
  isActive?: boolean;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ResponsibilityAssignmentListParams {
  areaId?: string;
  memberUserId?: string;
  type?: ResponsibilityType;
  limit?: number;
  offset?: number;
}

export const responsibilitiesService = {
  // ------------------------------------------------------------- Areas -----
  async listAreas(companyId: string, params?: ResponsibilityAreaListParams): Promise<Paginated<ResponsibilityArea>> {
    if (env.demoMode) return demoDelay({ items: demoAreas, total: demoAreas.length, limit: 100, offset: 0 });
    const response = await http.get(apiRoutes.responsibilities.areas(companyId), { params });
    return normalizePaginated<ResponsibilityArea>(response.data);
  },

  async createArea(companyId: string, payload: ResponsibilityAreaPayload): Promise<ResponsibilityArea> {
    if (env.demoMode) {
      const area: ResponsibilityArea = {
        id: `demo-area-${Date.now()}`,
        companyId,
        name: payload.name,
        description: payload.description ?? null,
        sortOrder: payload.sortOrder ?? 0,
        isActive: payload.isActive ?? true,
        createdById: null,
        updatedById: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      demoAreas.push(area);
      demoMatrix.areas.push({ id: area.id, name: area.name, sortOrder: area.sortOrder });
      return demoDelay(area);
    }
    const response = await http.post(apiRoutes.responsibilities.areas(companyId), payload);
    return unwrap<ResponsibilityArea>(response.data);
  },

  async updateArea(companyId: string, areaId: string, payload: Partial<ResponsibilityAreaPayload>): Promise<ResponsibilityArea> {
    if (env.demoMode) {
      const area = demoAreas.find((item) => item.id === areaId);
      if (!area) throw new Error('Area not found.');
      Object.assign(area, payload, { updatedAt: new Date().toISOString() });
      return demoDelay(area);
    }
    const response = await http.patch(apiRoutes.responsibilities.area(companyId, areaId), payload);
    return unwrap<ResponsibilityArea>(response.data);
  },

  async deleteArea(companyId: string, areaId: string): Promise<void> {
    if (env.demoMode) {
      const index = demoAreas.findIndex((item) => item.id === areaId);
      if (index >= 0) demoAreas.splice(index, 1);
      demoMatrix.areas = demoMatrix.areas.filter((area) => area.id !== areaId);
      demoMatrix.cells = demoMatrix.cells.filter((cell) => cell.areaId !== areaId);
      await demoDelay(null);
      return;
    }
    await http.delete(apiRoutes.responsibilities.area(companyId, areaId));
  },

  // ------------------------------------------------------- Assignments -----
  async matrix(companyId: string): Promise<ResponsibilityMatrix> {
    if (env.demoMode) return demoDelay({ ...demoMatrix, areas: [...demoMatrix.areas], members: [...demoMatrix.members], cells: [...demoMatrix.cells] });
    const response = await http.get(apiRoutes.responsibilities.matrix(companyId));
    return normalizeMatrix(response.data);
  },

  /** Idempotent upsert of a single cell — backend decides create vs update. */
  async assign(companyId: string, payload: AssignResponsibilityPayload): Promise<ResponsibilityAssignment> {
    if (env.demoMode) {
      const existing = demoMatrix.cells.find((cell) => cell.areaId === payload.areaId && cell.memberUserId === payload.memberUserId);
      if (existing) {
        existing.type = payload.type;
        existing.customLabel = payload.type === 'OTHER' ? payload.customLabel ?? null : null;
        existing.note = payload.note ?? null;
      } else {
        demoMatrix.cells.push({
          assignmentId: `demo-cell-${Date.now()}`,
          areaId: payload.areaId,
          memberUserId: payload.memberUserId,
          type: payload.type,
          customLabel: payload.type === 'OTHER' ? payload.customLabel ?? null : null,
          note: payload.note ?? null,
        });
      }
      return demoDelay({} as ResponsibilityAssignment);
    }
    // Never send customLabel when the type is not OTHER — the backend clears
    // it anyway, and omitting keeps validation errors unambiguous.
    const body: AssignResponsibilityPayload = {
      areaId: payload.areaId,
      memberUserId: payload.memberUserId,
      type: payload.type,
      ...(payload.type === 'OTHER' ? { customLabel: payload.customLabel } : {}),
      ...(payload.note?.trim() ? { note: payload.note.trim() } : {}),
    };
    const response = await http.post(apiRoutes.responsibilities.assignments(companyId), body);
    return unwrap<ResponsibilityAssignment>(response.data);
  },

  async updateAssignment(companyId: string, assignmentId: string, payload: UpdateResponsibilityPayload): Promise<ResponsibilityAssignment> {
    if (env.demoMode) return demoDelay({} as ResponsibilityAssignment);
    const response = await http.patch(apiRoutes.responsibilities.assignment(companyId, assignmentId), payload);
    return unwrap<ResponsibilityAssignment>(response.data);
  },

  async clearAssignment(companyId: string, assignmentId: string): Promise<void> {
    if (env.demoMode) {
      demoMatrix.cells = demoMatrix.cells.filter((cell) => cell.assignmentId !== assignmentId);
      await demoDelay(null);
      return;
    }
    await http.delete(apiRoutes.responsibilities.assignment(companyId, assignmentId));
  },

  /** Atomic grid save — all-or-nothing; on 400 nothing was persisted. */
  async bulkAssign(companyId: string, items: AssignResponsibilityPayload[]): Promise<BulkAssignResult> {
    if (env.demoMode) return demoDelay({ created: items.length, updated: 0, total: items.length });
    const response = await http.post(apiRoutes.responsibilities.bulk(companyId), { items });
    return unwrap<BulkAssignResult>(response.data);
  },

  async listAssignments(companyId: string, params?: ResponsibilityAssignmentListParams): Promise<Paginated<ResponsibilityAssignment>> {
    if (env.demoMode) return demoDelay({ items: [], total: 0, limit: 100, offset: 0 });
    const response = await http.get(apiRoutes.responsibilities.assignments(companyId), { params });
    return normalizePaginated<ResponsibilityAssignment>(response.data);
  },
};