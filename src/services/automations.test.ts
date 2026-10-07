import { describe, expect, it } from 'vitest';
import { AutomationActionType, AutomationTriggerType, PostAssetType } from '@/types/domain';
import { AUTOMATION_ACTIONS, normalizeRule, normalizeRun } from './automations';
import { guessAssetType, normalizeAsset } from './postAssets';

describe('automation rules', () => {
  it('every trigger maps to the one action the API accepts for it', () => {
    expect(AUTOMATION_ACTIONS[AutomationTriggerType.POST_CHANGES_REQUESTED]).toBe(AutomationActionType.CREATE_POST_CHANGES_TASKS);
    expect(AUTOMATION_ACTIONS[AutomationTriggerType.LEAD_BECAME_INTERESTED]).toBe(AutomationActionType.CREATE_LEAD_FOLLOW_UP_TASK);
    expect(Object.keys(AUTOMATION_ACTIONS).sort()).toEqual(Object.values(AutomationTriggerType).sort());
  });

  it('normalises the documented shape and tolerates alternative spellings', () => {
    const rule = normalizeRule({ id: 'r1', name: 'Fix-ups', triggerType: 'POST_CHANGES_REQUESTED', actionType: 'CREATE_POST_CHANGES_TASKS', isActive: false }, 'c1');
    expect(rule).toMatchObject({ id: 'r1', companyId: 'c1', isActive: false, triggerType: 'POST_CHANGES_REQUESTED' });
    expect(normalizeRule({ id: 'r2', name: 'x', trigger: 'LEAD_BECAME_INTERESTED', action: 'CREATE_LEAD_FOLLOW_UP_TASK', enabled: true }, 'c1').triggerType).toBe('LEAD_BECAME_INTERESTED');
    // A rule with no flag is on: the API creates rules active.
    expect(normalizeRule({ id: 'r3', name: 'y' }, 'c1').isActive).toBe(true);
  });

  it('reads a run as failed when it carries an error, even without a status', () => {
    expect(normalizeRun({ id: 'u1', ruleId: 'r1', errorMessage: 'boom' }, 'c1')).toMatchObject({ status: 'FAILED', error: 'boom' });
    expect(normalizeRun({ id: 'u2', rule: { id: 'r1', name: 'Fix-ups' } }, 'c1')).toMatchObject({ status: 'SUCCESS', ruleId: 'r1', ruleName: 'Fix-ups' });
    expect(normalizeRun({ id: 'u3', ruleId: 'r1', status: 'FAILED' }, 'c1').status).toBe('FAILED');
  });
});

describe('post assets', () => {
  it('normalises a row, tolerating `type` and a bare fileId', () => {
    const asset = normalizeAsset({ id: 'a1', type: 'VIDEO', fileId: 'f1' }, 'p1');
    expect(asset).toMatchObject({ postId: 'p1', assetType: 'VIDEO', label: null, file: { id: 'f1' } });
  });

  it('guesses a sensible type from the file', () => {
    expect(guessAssetType({ type: 'video/mp4', name: 'a.mp4' })).toBe(PostAssetType.VIDEO);
    expect(guessAssetType({ type: '', name: 'cut.MOV' })).toBe(PostAssetType.VIDEO);
    expect(guessAssetType({ type: 'image/png', name: 'a.png' })).toBe(PostAssetType.DESIGN);
    expect(guessAssetType({ type: 'application/pdf', name: 'brief.pdf' })).toBe(PostAssetType.DOCUMENT);
  });
});
