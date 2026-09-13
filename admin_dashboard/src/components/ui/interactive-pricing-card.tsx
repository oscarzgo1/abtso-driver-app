'use client'; // This component requires client-side state for the slider

import * as React from 'react';
import { Check, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils'; // Assumes shadcn's 'cn' utility
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';

// Define the props for the component for strong typing and reusability
export interface InteractivePricingCardProps {
  planName: string;
  planDescription: string;
  pricePerUnit: number;
  unitName: string;
  minUnits: number;
  maxUnits: number;
  initialUnits: number;
  features: string[];
  ctaText: string;
  currency?: string;
  className?: string;
  highlighted?: boolean; // To make one plan stand out
  badgeLabel?: string; // Defaults to "Popular" — lets a caller say e.g. "Current Plan"
  units?: number; // Controlled unit count, so a caller can share one slider value across cards
  onUnitsChange?: (units: number) => void;
  onCtaClick?: () => void;
  ctaDisabled?: boolean;
  footerNote?: React.ReactNode; // Extra line under the CTA (e.g. an inline success message)
  priceCaption?: React.ReactNode; // Extra line under the price (e.g. an annual-billing note)
  /** Hard ceiling for the typed-in unit count (the slider's own max stays
   * the comfortable drag range — this is the guard for someone typing
   * "1000" directly). Defaults to 100,000, a sanity bound, not a plan limit. */
  maxTypedUnits?: number;
}

export function InteractivePricingCard({
  planName,
  planDescription,
  pricePerUnit,
  unitName,
  minUnits,
  maxUnits,
  initialUnits,
  features,
  ctaText,
  currency = '$',
  className,
  highlighted = false,
  badgeLabel = 'Popular',
  units: controlledUnits,
  onUnitsChange,
  onCtaClick,
  ctaDisabled = false,
  footerNote,
  priceCaption,
  maxTypedUnits = 100000,
}: InteractivePricingCardProps) {
  // State to manage the number of units selected by the user
  const [internalUnits, setInternalUnits] = React.useState(initialUnits);
  const units = controlledUnits ?? internalUnits;
  const setUnits = onUnitsChange ?? setInternalUnits;

  // Clicking the driver count turns it into a plain number input, so
  // someone can type an exact figure (e.g. 1,000) well past what's
  // practical to reach by dragging a slider limited to a sane range.
  const [isEditingUnits, setIsEditingUnits] = React.useState(false);
  const [unitsDraft, setUnitsDraft] = React.useState(String(units));

  const commitUnitsDraft = () => {
    const parsed = parseInt(unitsDraft, 10);
    const clamped = Number.isFinite(parsed) ? Math.min(Math.max(parsed, minUnits), maxTypedUnits) : units;
    setUnits(clamped);
    setIsEditingUnits(false);
  };

  // Calculate the total price based on the current number of units
  const totalPrice = (units * pricePerUnit).toFixed(2);

  return (
    <Card
      className={cn(
        'relative flex w-full max-w-[280px] flex-col',
        highlighted ? 'border-primary' : '',
        className
      )}
      style={{
        boxShadow: highlighted
          ? '0 12px 28px -8px rgba(204, 0, 0, 0.35), 0 4px 12px rgba(0, 0, 0, 0.12)'
          : '0 6px 18px -6px rgba(0, 0, 0, 0.14)',
      }}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">{planName}</CardTitle>
          {highlighted && <Badge variant="default">{badgeLabel}</Badge>}
        </div>
        <CardDescription className="text-xs">{planDescription}</CardDescription>
      </CardHeader>

      <CardContent className="flex-1 px-4">
        <div className="mb-3 text-center">
          <span className="text-3xl font-bold">
            {currency}
            {totalPrice}
          </span>
          <span className="text-xs text-muted-foreground">/month</span>
        </div>
        {priceCaption && <div className="-mt-2 mb-3 text-center text-xs text-muted-foreground">{priceCaption}</div>}

        <div className="space-y-3">
          {/* Interactive Slider */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-sm font-medium">
              {isEditingUnits ? (
                <input
                  type="number"
                  className="w-16 rounded border border-input bg-background px-1.5 py-0.5 text-sm text-foreground"
                  value={unitsDraft}
                  min={minUnits}
                  max={maxTypedUnits}
                  autoFocus
                  onChange={(e) => setUnitsDraft(e.target.value)}
                  onBlur={commitUnitsDraft}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitUnitsDraft();
                    if (e.key === 'Escape') setIsEditingUnits(false);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:text-primary"
                  title={`Type an exact ${unitName} count`}
                  onClick={() => {
                    setUnitsDraft(String(units));
                    setIsEditingUnits(true);
                  }}
                >
                  {`${units} ${unitName}${units > 1 ? 's' : ''}`}
                  <Pencil className="h-3 w-3 opacity-60" />
                </button>
              )}
              <span>
                {currency}
                {pricePerUnit}/{unitName}
              </span>
            </div>
            <Slider
              value={[Math.min(units, maxUnits)]}
              onValueChange={(value) => setUnits(value[0])}
              min={minUnits}
              max={maxUnits}
              step={1}
              aria-label={`Select number of ${unitName}s`}
            />
          </div>

          {/* Features List */}
          <ul className="space-y-2 text-xs">
            {features.map((feature, index) => (
              <li key={index} className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-primary flex-shrink-0" />
                <span className="text-muted-foreground">{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      </CardContent>

      <CardFooter className="flex-col items-stretch gap-2 px-4 pb-4">
        <Button className="w-full" size="default" variant={highlighted ? 'default' : 'outline'} onClick={onCtaClick} disabled={ctaDisabled}>
          {ctaText}
        </Button>
        {footerNote}
      </CardFooter>
    </Card>
  );
}
