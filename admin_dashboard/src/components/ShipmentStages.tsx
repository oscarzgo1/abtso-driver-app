import { Check } from 'lucide-react';
import type { TimelineStep } from './ui/tracking-timeline';

// Delivery stages as a horizontal timeline (the "Release Cycle Timeline"
// pattern from 21st.dev, c-timeline-8): every stage is a column with a bar
// across the top, the time above its name, an indicator on the bar and the
// detail underneath. Finished stages fill the bar, the stage in progress
// gets a pulsing indicator, and stages still to come stay grey. Wide
// timelines scroll sideways instead of squeezing the columns.

export default function ShipmentStages({ steps }: { steps: TimelineStep[] }) {
  const done = steps.filter(s => s.status === 'completed').length;
  const active = steps.findIndex(s => s.status === 'active');

  return (
    <div>
      <p className="stl-summary">
        {done} of {steps.length} stages complete{active >= 0 ? `, now: ${steps[active].title}` : ''}
      </p>
      <div className="stl" role="list">
        {steps.map((step, i) => (
          <div key={`${step.title}-${i}`} role="listitem" className={`stl-item stl-item--${step.status}`}>
            <div className="stl-head">
              <span className="stl-bar" />
              <span className="stl-time">{step.time ?? ' '}</span>
              <span className="stl-title">{step.title}</span>
              <span className="stl-dot">{step.status === 'completed' && <Check size={10} strokeWidth={3} />}</span>
            </div>
            <p className="stl-detail">{step.detail ?? ''}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
