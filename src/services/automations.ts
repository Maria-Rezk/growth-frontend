import { env } from '@/config/env';
import { apiRoutes } from '@/config/apiRoutes';
import { http, unwrap, unwrapList } from '@/lib/http';
import { demoDelay, makeId } from '@/services/demoStore';
import {
  AutomationActionType,
  AutomationTriggerType,
  type AutomationRule,
  type AutomationRuleInput,
  type AutomationRun,
} from '@/types/domain';

/*
  Which action each trigger can drive. The API accepts only these pairs: a
  post coming back with changes makes fix-up tasks, a lead turning interested
  makes a follow-up. Offering the full cross product in the form would be
  offering combinations that 400.
*/
export const AUTOMATION_ACTIONS: Record<AutomationTriggerType, AutomationActionType> = {
  [AutomationTriggerType.POST_CHANGES_REQUESTED]: AutomationActionType.CREATE_POST_CHANGES_TASKS,
  [AutomationTriggerType.LEAD_BECAME_INTERESTED]: AutomationActionType.CREATE_LEAD_FOLLOW_UP_TASK,
};

/** One sentence per trigger, in the words a person would use, not the enum's. */
export const AUTOMATION_TRIGGER_COPY: Record<AutomationTriggerType, { when: string; then: string }> = {
  [AutomationTriggerType.POST_CHANGES_REQUESTED]: {
    when: 'The client asks for changes on a post',
    then: 'Create fix-up tasks for copy and design',
  },
  [AutomationTriggerType.LEAD_BECAME_INTERESTED]: {
    when: 'A lead becomes Interested',
    then: 'Create a follow-up task',
  },
};

type RawRule = Partial<AutomationRule> & { id: string; trigger?: string; action?: string; active?: boolean; enabled?: boolean };

/*
  The reference lists the routes and enums but not the row shape, so this
  accepts the likely spellings (`isActive` / `active` / `enabled`,
  `triggerType` / `trigger`) and is the one place to tighten once confirmed.
*/
export function normalizeRule(raw: RawRule, companyId: string): AutomationRule {
  return {
    id: raw.id,
    companyId: raw.companyId ?? companyId,
    name: raw.name ?? '',
    triggerType: (raw.triggerType ?? raw.trigger) as AutomationTriggerType,
    actionType: (raw.actionType ?? raw.action) as AutomationActionType,
    isActive: raw.isActive ?? raw.active ?? raw.enabled ?? true,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

type RawRun = Partial<AutomationRun> & {
  id: string;
  rule?: { id?: string; name?: string } | null;
  success?: boolean;
  errorMessage?: string | null;
  trigger?: string;
  action?: string;
};

export function normalizeRun(raw: RawRun, companyId: string): AutomationRun {
  const error = raw.error ?? raw.errorMessage ?? null;
  return {
    id: raw.id,
    companyId: raw.companyId ?? companyId,
    ruleId: raw.ruleId ?? raw.rule?.id ?? '',
    ruleName: raw.ruleName ?? raw.rule?.name,
    status: raw.status ?? (raw.success === false || error ? 'FAILED' : 'SUCCESS'),
    triggerType: raw.triggerType ?? raw.trigger,
    actionType: raw.actionType ?? raw.action,
    entityType: raw.entityType,
    entityId: raw.entityId,
    error,
    createdAt: raw.createdAt,
  };
}

const demoRules: AutomationRule[] = [
  {
    id: 'demo-rule-1',
    companyId: 'demo-company',
    name: 'Fix-ups when the client asks for changes',
    triggerType: AutomationTriggerType.POST_CHANGES_REQUESTED,
    actionType: AutomationActionType.CREATE_POST_CHANGES_TASKS,
    isActive: true,
    createdAt: new Date(Date.now() - 20 * 864e5).toISOString(),
  },
  {
    id: 'demo-rule-2',
    companyId: 'demo-company',
    name: 'Follow up interested leads',
    triggerType: AutomationTriggerType.LEAD_BECAME_INTERESTED,
    actionType: AutomationActionType.CREATE_LEAD_FOLLOW_UP_TASK,
    isActive: false,
    createdAt: new Date(Date.now() - 10 * 864e5).toISOString(),
  },
];

const demoRuns: AutomationRun[] = [
  {
    id: 'demo-run-1',
    companyId: 'demo-company',
    ruleId: 'demo-rule-1',
    ruleName: demoRules[0].name,
    status: 'SUCCESS',
    triggerType: AutomationTriggerType.POST_CHANGES_REQUESTED,
    actionType: AutomationActionType.CREATE_POST_CHANGES_TASKS,
    entityType: 'POST',
    entityId: 'demo-post-1',
    createdAt: new Date(Date.now() - 3 * 36e5).toISOString(),
  },
  {
    id: 'demo-run-2',
    companyId: 'demo-company',
    ruleId: 'demo-rule-2',
    ruleName: demoRules[1].name,
    status: 'FAILED',
    triggerType: AutomationTriggerType.LEAD_BECAME_INTERESTED,
    actionType: AutomationActionType.CREATE_LEAD_FOLLOW_UP_TASK,
    entityType: 'LEAD',
    entityId: 'demo-lead-1',
    error: 'No active member to assign the follow-up task to.',
    createdAt: new Date(Date.now() - 30 * 36e5).toISOString(),
  },
];

export const automationsService = {
  async listRules(companyId: string): Promise<AutomationRule[]> {
    if (env.demoMode) return demoDelay(demoRules.filter((rule) => rule.companyId === companyId));
    const response = await http.get(apiRoutes.automations.rules(companyId));
    return unwrapList<RawRule>(response.data).map((rule) => normalizeRule(rule, companyId));
  },

  async createRule(companyId: string, payload: Required<Pick<AutomationRuleInput, 'name' | 'triggerType'>> & AutomationRuleInput): Promise<AutomationRule> {
    // The action follows from the trigger, so the form never has to ask for it.
    const body = { ...payload, actionType: payload.actionType ?? AUTOMATION_ACTIONS[payload.triggerType], isActive: payload.isActive ?? true };
    if (env.demoMode) {
      const rule: AutomationRule = { id: makeId('rule'), companyId, createdAt: new Date().toISOString(), ...body, actionType: body.actionType };
      demoRules.unshift(rule);
      return demoDelay(rule);
    }
    const response = await http.post(apiRoutes.automations.rules(companyId), body);
    return normalizeRule(unwrap<RawRule>(response.data), companyId);
  },

  async updateRule(companyId: string, ruleId: string, payload: AutomationRuleInput): Promise<AutomationRule> {
    if (env.demoMode) {
      const rule = demoRules.find((item) => item.id === ruleId);
      if (!rule) throw new Error('Rule not found.');
      Object.assign(rule, payload);
      return demoDelay({ ...rule });
    }
    const response = await http.patch(apiRoutes.automations.rule(companyId, ruleId), payload);
    return normalizeRule(unwrap<RawRule>(response.data), companyId);
  },

  async listRuns(companyId: string, params?: { status?: string; ruleId?: string; limit?: number; offset?: number }): Promise<AutomationRun[]> {
    if (env.demoMode) {
      return demoDelay(demoRuns.filter((run) => run.companyId === companyId
        && (!params?.status || run.status === params.status)
        && (!params?.ruleId || run.ruleId === params.ruleId)));
    }
    const response = await http.get(apiRoutes.automations.runs(companyId), { params });
    return unwrapList<RawRun>(response.data).map((run) => normalizeRun(run, companyId));
  },
};
