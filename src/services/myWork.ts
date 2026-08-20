import { tasksService } from '@/services/tasks';
import type { Company, ListParams, Task } from '@/types/domain';

/**
 * A task carrying the client it belongs to.
 *
 * On the cross-client screen the client is a label on the row, so it has to
 * travel with the task — there is no single "active client" to read it from.
 */
export interface MyWorkTask extends Task {
  clientId: string;
  clientName: string;
}

export interface MyWorkResult {
  tasks: MyWorkTask[];
  /** Clients whose tasks could not be loaded, so the screen can say so. */
  unavailableClients: string[];
}

/**
 * Cross-client "my work".
 *
 * There is no server endpoint that spans clients — `/companies/:id/tasks/my`
 * is per client — so this fans out one request per membership and merges the
 * results. That is deliberate and safe: the list of clients is exactly the
 * list the signed-in user is a member of, so no request reaches a client they
 * cannot already open. A single cross-client endpoint would be one request
 * instead of N and is the natural backend follow-up.
 *
 * `Promise.allSettled`, not `all`: one client erroring (permissions changed
 * mid-session, a slow shard) must not blank the whole screen. Failures are
 * reported by name instead.
 */
export const myWorkService = {
  async listAcrossClients(companies: Company[], params?: ListParams): Promise<MyWorkResult> {
    const settled = await Promise.allSettled(
      companies.map((company) => tasksService.listMine(company.id, params)),
    );

    const tasks: MyWorkTask[] = [];
    const unavailableClients: string[] = [];

    settled.forEach((result, index) => {
      const company = companies[index];
      if (result.status === 'rejected') {
        unavailableClients.push(company.name);
        return;
      }
      result.value.forEach((task) => {
        tasks.push({ ...task, clientId: company.id, clientName: company.name });
      });
    });

    return { tasks, unavailableClients };
  },
};
