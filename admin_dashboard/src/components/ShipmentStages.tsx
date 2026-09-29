import { useEffect, useState } from 'react';
import { Clock, PackageCheck, Truck, MapPin, CircleCheck, LogOut, Inbox, type LucideIcon } from 'lucide-react';
import type { TimelineStep } from './ui/tracking-timeline';

// A stage rail for one shipment: an icon badge per stage joined by a rail
// that FILLS from the first stage to the current one, with a soft pulse on
// the stage in progress. Deliberately not the staggered fade-in timeline
// the dashboard's Tracking panel uses — this one shows how far along the
// shipment is at a glance (a header count, a filling rail) as well as the
// detail and time of each stage.

const ICONS: Record<string, LucideIcon> = {
  'Clocked in': Clock,
  'Load assigned': Inbox,
  'Load attached': Inbox,
  Load: Inbox,
  'Accepted & coupled': PackageCheck,
  'On the road': Truck,
  Delivered: MapPin,
  'Clocked out': LogOut,
};

export default function ShipmentStages({ steps }: { steps: TimelineStep[] }) {
  const doneCount = steps.filter(s => s.status === 'completed').length;
  const activeIndex = steps.findIndex(s => s.status === 'active');
  // Rail fills through every completed stage up to the current one.
  const lastReached = activeIndex >= 0 ? activeIndex : Math.max(0, steps.map(s => s.status).lastIndexOf('completed'));
  const targetFill = steps.length > 1 ? (lastReached / (steps.length - 1)) * 100 : 0;

  // Animate from empty each time a different shipment is shown.
  const signature = steps.map(s => s.title + s.status).join('|');
  const [fill, setFill] = useState(0);
  useEffect(() => {
    setFill(0);
    const t = setTimeout(() => setFill(targetFill), 60);
    return () => clearTimeout(t);
  }, [signature, targetFill]);

  return (
    <div className="stage-rail">
      <div className="stage-rail-head">
        <span>Stage {Math.min(doneCount + (activeIndex >= 0 ? 1 : 0), steps.length)} of {steps.length}</span>
        <span className="stage-rail-pct">{Math.round(targetFill)}%</span>
      </div>
      <div className="stage-rail-body">
        <div className="stage-rail-track">
          <div className="stage-rail-fill" style={{ height: `${fill}%` }} />
        </div>
        {steps.map((step) => {
          const Icon = step.status === 'completed' ? CircleCheck : ICONS[step.title] ?? Clock;
          return (
            <div key={step.title} className={`stage-row stage-row--${step.status}`}>
              <span className="stage-badge"><Icon size={15} /></span>
              <div className="stage-text">
                <p className="stage-title">{step.title}</p>
                {step.detail && <p className="stage-detail">{step.detail}</p>}
              </div>
              <span className="stage-time">{step.time ?? (step.status === 'pending' ? '' : '')}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
