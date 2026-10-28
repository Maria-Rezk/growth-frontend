import clsx from 'clsx';
import type { PostStatus } from '@/types/domain';
import { CheckIcon } from '@/components/ui/icons';
import { POST_WORKFLOW, postWorkflowStatus } from '@/utils/workflow';

export function WorkflowStepper({ status }: { status: PostStatus }) {
  const activeIndex = POST_WORKFLOW.findIndex((step) => step.status === postWorkflowStatus(status));
  const special = status === 'CHANGES_REQUESTED' || status === 'CANCELED';
  const current = activeIndex >= 0 ? POST_WORKFLOW[activeIndex] : null;

  return (
    <div className="workflow-card card" aria-label="Post workflow status">
      <div className="workflow-card__header">
        <div>
          <h2>Approval workflow</h2>
          <p className="muted">From draft to client approval to published. Publishing is recorded by a person; nothing posts automatically.</p>
        </div>
        {special ? <span className="workflow-alert">{status === 'CHANGES_REQUESTED' ? 'Changes requested' : 'Canceled'}</span> : null}
        {status === 'SCHEDULED' ? <span className="workflow-alert workflow-alert--info">Scheduled</span> : null}
      </div>
      {/* Phones (CSS): where the post is, in one line. The steps below stay,
          compacted to a row of numbered dots with their names. */}
      {current ? (
        <p className="workflow-stepper__summary">
          Step {activeIndex + 1} of {POST_WORKFLOW.length}: <strong>{current.label}</strong>. {current.description}
        </p>
      ) : null}
      <ol className="workflow-stepper">
        {POST_WORKFLOW.map((step, index) => {
          const done = activeIndex > index;
          const active = activeIndex === index;
          return (
            <li key={step.status} className={clsx('workflow-step', done && 'workflow-step--done', active && 'workflow-step--active')} aria-current={active ? 'step' : undefined}>
              <span className="workflow-step__dot">{done ? <CheckIcon size={13} /> : index + 1}</span>
              <div>
                <strong>{step.label}</strong>
                <p>{step.description}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
