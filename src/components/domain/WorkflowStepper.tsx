import clsx from 'clsx';
import type { PostStatus } from '@/types/domain';
import { CheckIcon } from '@/components/ui/icons';
import { POST_WORKFLOW } from '@/utils/workflow';

export function WorkflowStepper({ status }: { status: PostStatus }) {
  const activeIndex = POST_WORKFLOW.findIndex((step) => step.status === status);
  const special = status === 'CHANGES_REQUESTED' || status === 'CANCELED';

  return (
    <div className="workflow-card card" aria-label="Post workflow status">
      <div className="workflow-card__header">
        <div>
          <h2>Approval workflow</h2>
          <p className="muted">Move content from draft to published without losing context.</p>
        </div>
        {special ? <span className="workflow-alert">{status === 'CHANGES_REQUESTED' ? 'Changes requested' : 'Canceled'}</span> : null}
      </div>
      <ol className="workflow-stepper">
        {POST_WORKFLOW.map((step, index) => {
          const done = activeIndex > index;
          const active = activeIndex === index;
          return (
            <li key={step.status} className={clsx('workflow-step', done && 'workflow-step--done', active && 'workflow-step--active')}>
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
