import { errorMessage, isRouteMissing } from '@/lib/http';
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
  /**
   * Why they failed — the first rejection, in words.
   *
   * Without it the screen can report *which* clients failed but not what went
   * wrong, and a fan-out that fails for every client is indistinguishable from
   * a user who genuinely has nothing to do.
   */
  failure?: string;
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
    let firstRejection: unknown;

    settled.forEach((result, index) => {
      const company = companies[index];
      if (result.status === 'rejected') {
        unavailableClients.push(company.name);
        if (firstRejection === undefined) firstRejection = result.reason;
        return;
      }
      result.value.forEach((task) => {
        tasks.push({ ...task, clientId: company.id, clientName: company.name });
      });
    });

    return { tasks, unavailableClients, failure: describeFailure(firstRejection) };
  },
};

function describeFailure(rejection: unknown): string | undefined {
  if (rejection === undefined) return undefined;
  /*
    Every client failing the same way is almost always one cause, not N. A
    route miss is the one worth naming: `/companies/:id/tasks/my` is a SPEC
    endpoint, and until it ships the raw "Cannot GET /api/companies/…/tasks/my"
    is accurate and meaningless to anyone not reading the router.
  */
  if (isRouteMissing(rejection)) {
    return 'The per-client task list has not shipped on this backend yet.';
  }
  return errorMessage(rejection);
}

/** A review waiting on me, carrying the client it belongs to. */
export type MyReviewTask = MyWorkTask;

export interface MyReviewsResult {
  tasks: MyReviewTask[];
  unavailableClients: string[];
  failure?: string;
}

/**
 * Cross-client approval queue.
 *
 * `/companies/:id/tasks/approval-queue` is per client, and somebody who
 * approves on five clients should not tour five workspaces every morning.
 * Same fan-out as `listAcrossClients`: one request per membership, merged,
 * oldest submission first. When the backend ships a single
 * `/me/approval-queue`, this becomes one call and nothing above it changes.
 */
export const myReviewsService = {
  async listAcrossClients(companies: Company[]): Promise<MyReviewsResult> {
    const settled = await Promise.allSettled(
      companies.map((company) => tasksService.approvalQueue(company.id, { limit: 100, offset: 0 })),
    );

    const tasks: MyReviewTask[] = [];
    const unavailableClients: string[] = [];
    let firstRejection: unknown;

    settled.forEach((result, index) => {
      const company = companies[index];
      if (result.status === 'rejected') {
        unavailableClients.push(company.name);
        if (firstRejection === undefined) firstRejection = result.reason;
        return;
      }
      result.value.items.forEach((task) => {
        tasks.push({ ...task, clientId: company.id, clientName: company.name });
      });
    });

    tasks.sort((left, right) => (left.submittedForReviewAt ?? '').localeCompare(right.submittedForReviewAt ?? ''));
    return { tasks, unavailableClients, failure: describeFailure(firstRejection) };
  },
};
