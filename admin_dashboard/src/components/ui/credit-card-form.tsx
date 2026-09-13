'use client';

import React, { useEffect, useMemo, useState } from 'react';

type CardState = {
  number: string; // raw digits (no spaces)
  holder: string; // uppercase
  month: string; // "01".."12" or ""
  year: string; // "2025".."2034" or ""
  cvv: string; // up to 4
};

type CardValidity = {
  number: boolean; // length >= 13
  holder: boolean; // >= 2 chars
  month: boolean; // 01..12
  year: boolean; // >= current year
  cvv: boolean; // 3-4 digits
  allValid: boolean;
};

interface CreditCardFormProps {
  defaultNumber?: string;
  defaultHolder?: string;
  defaultMonth?: string;
  defaultYear?: string;
  defaultCVV?: string;
  maskMiddle?: boolean;
  showSubmit?: boolean;
  submitLabel?: string;
  onChange?: (state: CardState, validity: CardValidity) => void;
  onSubmit?: (state: CardState, validity: CardValidity) => void;
  className?: string;
}

function formatNumberSpaces(num: string): string {
  return num.replace(/\s+/g, '').replace(/(\d{4})(?=\d)/g, '$1 ');
}

function clampDigits(value: string, maxLen: number) {
  return value.replace(/\D/g, '').slice(0, maxLen);
}

/** Adapted from the 21st.dev "CreditCardForm" reference (@rahil1202/
 * credit-card-form): the live-updating card preview (digit slots that
 * slide in as they're typed, CVV back-face flip, focus-tracking highlight
 * ring), form logic, and validation are all kept literal.
 *
 * Two real deviations from the literal source:
 * 1. The reference ships as `<style jsx>` (a Next.js/styled-jsx feature
 *    this Vite app doesn't have), with several of its inner rules —
 *    `input, select {}`, `label {}`, `* { box-sizing: border-box }` — left
 *    completely unscoped. styled-jsx auto-scopes those to the component
 *    instance at compile time; a plain `<style>` tag doesn't, so left
 *    as-is they'd leak those rules onto every input/label/element on the
 *    page. Ported here as a plain `<style>` tag with every such rule
 *    manually prefixed under `.ccp` to reproduce that scoping, and
 *    `width: 100vw` on the outer wrapper narrowed to `100%` since this
 *    now renders inside the Billing modal panel, not as its own page.
 * 2. Re-skinned from the reference's pink/blue accent rings and near-
 *    black form chrome to Tachyo's palette (brand red + charcoal), and
 *    the decorative "card network" mark — two overlapping circles in
 *    orange/red — replaced with a plain chip glyph: the original shape
 *    reads as a specific real card network's trademark, which has no
 *    place on a card that never charges anything. Card face itself stays
 *    a fixed dark gradient regardless of site theme, same as a real card
 *    would look the same in light or dark mode; the form panel below it
 *    is theme-aware (`var(--card-bg)` etc.) like the rest of the app. */
const CreditCardForm = ({
  defaultNumber = '',
  defaultHolder = '',
  defaultMonth = '',
  defaultYear = '',
  defaultCVV = '',
  maskMiddle = true,
  showSubmit = true,
  submitLabel = 'Pay Now',
  onChange,
  onSubmit,
  className = '',
}: CreditCardFormProps) => {
  const [number, setNumber] = useState(clampDigits(defaultNumber, 19));
  const [holder, setHolder] = useState(defaultHolder.toUpperCase());
  const [month, setMonth] = useState(defaultMonth);
  const [year, setYear] = useState(defaultYear);
  const [cvv, setCVV] = useState(clampDigits(defaultCVV, 4));
  const [focusField, setFocusField] = useState<null | 'number' | 'holder' | 'expire' | 'cvv'>(null);

  const flip = focusField === 'cvv';
  const years = useMemo(() => {
    const start = new Date().getFullYear();
    return Array.from({ length: 10 }, (_, i) => String(start + i));
  }, []);

  const validity: CardValidity = useMemo(() => {
    const numberValid = number.length >= 13;
    const holderValid = holder.trim().length >= 2;
    const monthValid = !!month && +month >= 1 && +month <= 12;
    const yearValid = !!year && +year >= new Date().getFullYear();
    const cvvValid = /^\d{3,4}$/.test(cvv);
    return {
      number: numberValid,
      holder: holderValid,
      month: monthValid,
      year: yearValid,
      cvv: cvvValid,
      allValid: numberValid && holderValid && monthValid && yearValid && cvvValid,
    };
  }, [number, holder, month, year, cvv]);

  useEffect(() => {
    onChange?.({ number, holder, month, year, cvv }, validity);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [number, holder, month, year, cvv, validity]);

  const displayDigits = useMemo(() => number.slice(0, 16).split(''), [number]);

  const displayedSlots = useMemo(() => {
    const arr: { textTop: string; filed: boolean }[] = [];
    for (let i = 0; i < 16; i++) {
      let content = '#';
      if (i < displayDigits.length) {
        const d = displayDigits[i];
        const shouldMask = maskMiddle && i >= 4 && i <= 11;
        content = shouldMask ? '*' : d;
      }
      arr.push({ textTop: content, filed: i < displayDigits.length });
    }
    return arr;
  }, [displayDigits, maskMiddle]);

  const highlightClass = (() => {
    switch (focusField) {
      case 'number': return 'highlight__number';
      case 'holder': return 'highlight__holder';
      case 'expire': return 'highlight__expire';
      case 'cvv': return 'highlight__cvv';
      default: return 'hidden';
    }
  })();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit?.({ number, holder, month, year, cvv }, validity);
  };

  return (
    <section className={`ccp ${className}`}>
      <div className="wrap">
        <section id="card" className={`card ${flip ? 'flip' : ''}`}>
          <div id="highlight" className={highlightClass} />

          <section className="card__front">
            <div className="card__header">
              <div>TACHYO</div>
              {/* Generic chip glyph — not a real card network mark */}
              <svg width="40" height="28" viewBox="0 0 40 28" fill="none">
                <rect x="1" y="1" width="38" height="26" rx="5" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
                <line x1="1" y1="10" x2="39" y2="10" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
                <line x1="14" y1="1" x2="14" y2="27" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                <line x1="26" y1="1" x2="26" y2="27" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
              </svg>
            </div>

            <div id="card_number" className="card__number" aria-label="Card number">
              {displayedSlots.map((slot, idx) => (
                <span key={idx} className="slot">
                  <span className={`digit ${slot.filed ? 'filed' : ''}`}>
                    <span className="row placeholder">#</span>
                    <span className="row value">{slot.textTop}</span>
                  </span>
                </span>
              ))}
            </div>

            <div className="card__footer">
              <div className="card__holder">
                <div className="card__section__title">Card Holder</div>
                <div id="card_holder">{holder || 'NAME ON CARD'}</div>
              </div>
              <div className="card__expires">
                <div className="card__section__title">Expires</div>
                <span id="card_expires_month">{month || 'MM'}</span>/
                <span id="card_expires_year">{year ? year.slice(-2) : 'YY'}</span>
              </div>
            </div>
          </section>

          <section className="card__back">
            <div className="card__hide_line" />
            <div className="card_cvv">
              <span>CVV</span>
              <div id="card_cvv_field" className="card_cvv_field">
                {'*'.repeat(cvv.length)}
              </div>
            </div>
          </section>
        </section>

        <form className="form" onSubmit={handleSubmit} noValidate>
          <div>
            <label htmlFor="cc-number">Card Number</label>
            <input
              id="cc-number"
              inputMode="numeric"
              autoComplete="cc-number"
              placeholder="1234 5678 9012 3456"
              value={formatNumberSpaces(number)}
              onChange={(e) => setNumber(clampDigits(e.target.value, 19))}
              onFocus={() => setFocusField('number')}
              onBlur={() => setFocusField(null)}
              aria-invalid={!validity.number}
            />
            {!validity.number && number.length >= 1 && number.length < 13 && (
              <small className="err">Card number looks incomplete</small>
            )}
          </div>

          <div>
            <label htmlFor="cc-holder">Card Holder</label>
            <input
              id="cc-holder"
              type="text"
              autoComplete="cc-name"
              placeholder="JANE DOE"
              value={holder}
              onChange={(e) => setHolder(e.target.value.toUpperCase())}
              onFocus={() => setFocusField('holder')}
              onBlur={() => setFocusField(null)}
              aria-invalid={!validity.holder}
            />
          </div>

          <div className="filed__group">
            <div>
              <label>Expiration Date</label>
              <div className="filed__date">
                <select
                  id="cc-expiration-month"
                  value={month || ''}
                  onChange={(e) => setMonth(e.target.value)}
                  onFocus={() => setFocusField('expire')}
                  onBlur={() => setFocusField(null)}
                  aria-invalid={!validity.month}
                >
                  <option value="" disabled>Month</option>
                  {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <select
                  id="cc-expiration-year"
                  value={year || ''}
                  onChange={(e) => setYear(e.target.value)}
                  onFocus={() => setFocusField('expire')}
                  onBlur={() => setFocusField(null)}
                  aria-invalid={!validity.year}
                >
                  <option value="" disabled>Year</option>
                  {years.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="cc-cvv">CVV</label>
              <input
                id="cc-cvv"
                inputMode="numeric"
                autoComplete="cc-csc"
                placeholder="***"
                value={cvv}
                onChange={(e) => setCVV(clampDigits(e.target.value, 4))}
                onFocus={() => setFocusField('cvv')}
                onBlur={() => setFocusField(null)}
                aria-invalid={!validity.cvv}
              />
            </div>
          </div>

          {showSubmit && (
            <button className="submit" type="submit" disabled={!validity.allValid} aria-disabled={!validity.allValid}>
              {validity.allValid ? submitLabel : 'Complete all fields'}
            </button>
          )}
        </form>
      </div>

      <style>{`
        .ccp { width: 100%; display: flex; justify-content: center; color: var(--charcoal); }
        .ccp * { box-sizing: border-box; }
        .ccp .wrap { width: 100%; max-width: 900px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; }
        @media (max-width: 820px) { .ccp .wrap { grid-template-columns: 1fr; } }

        .ccp #highlight { position: absolute; border: 1px solid #fff; border-radius: 12px; z-index: 1; width: 0; height: 0; top: 0; left: 0; box-shadow: 0 0 5px #fff; transition: 0.3s; }
        .ccp #highlight.highlight__number { width: 346px; height: 40px; top: 92px; left: 18px; }
        .ccp #highlight.highlight__holder { width: 264px; height: 56px; top: 156px; left: 18px; }
        .ccp #highlight.highlight__expire { width: 86px; height: 56px; top: 156px; left: 323px; }
        .ccp #highlight.highlight__cvv { width: 381px; height: 91px; top: 83px; left: 18px; }
        .ccp #highlight.hidden { display: none; }

        .ccp .card { position: relative; width: 100%; max-width: 420px; margin: 0 auto; transform-style: preserve-3d; transition: 0.8s; perspective: 1000px; }
        .ccp .card.flip { transform: rotateY(180deg); }

        .ccp .card__front, .ccp .card__back {
          width: 100%; max-width: 420px; height: 233px; border-radius: 20px; padding: 24px 30px 30px;
          background: linear-gradient(to right bottom, #3a3a3a, #0d0d0d);
          box-shadow: 0 33px 50px -15px rgba(0, 0, 0, 0.5);
          color: #fff; overflow: hidden; margin: 0 auto; backface-visibility: hidden; position: relative;
        }
        @media (max-width: 450px) {
          .ccp .card__front, .ccp .card__back { padding: 12px 14px 16px; height: 206px; }
          .ccp #highlight.highlight__number { width: 300px; left: 14px; }
          .ccp #highlight.highlight__holder { width: 220px; left: 14px; }
          .ccp #highlight.highlight__expire { left: 280px; }
          .ccp #highlight.highlight__cvv { width: 330px; left: 14px; }
        }

        .ccp .card__back { position: absolute; top: 0; left: 0; transform: rotateY(180deg); padding: 24px 0 0; }

        .ccp .card__front::before, .ccp .card__back::before {
          content: ''; position: absolute; border: 16px solid #CC0000; border-radius: 100%;
          left: -17%; top: -45px; height: 300px; width: 300px; filter: blur(13px); opacity: 0.55;
        }
        .ccp .card__front::after, .ccp .card__back::after {
          content: ''; position: absolute; border: 16px solid #1a1a1a; border-radius: 100%;
          width: 300px; top: 55%; left: -200px; height: 300px; filter: blur(13px); opacity: 0.55;
        }

        .ccp .card__hide_line { height: 40px; width: 100%; background-color: #6b7280; position: relative; z-index: 1; }

        .ccp .card_cvv { position: relative; z-index: 1; margin-top: 24px; padding: 0 32px; display: flex; flex-direction: column; align-items: end; font-size: 14px; font-weight: 600; text-transform: uppercase; }
        .ccp .card_cvv_field { margin-top: 6px; background-color: #fff; border-radius: 12px; height: 44px; width: 100%; color: #000; display: flex; align-items: center; justify-content: end; padding: 0 12px; font-size: 25px; line-height: 21px; }

        .ccp .card__header { display: flex; align-items: center; justify-content: space-between; font-weight: 800; letter-spacing: 0.06em; margin-bottom: 32px; position: relative; z-index: 1; }
        .ccp .card__number { font-size: 22px; margin-bottom: 32px; position: relative; z-index: 1; display: flex; height: 33px; overflow: hidden; color: #fff; }
        .ccp .card__number .slot { display: inline-flex; margin-right: 0; }
        .ccp .card__number .slot:nth-child(4n) { margin-right: 10px; }
        .ccp .card__number .digit { display: flex; flex-direction: column; height: 33px; line-height: 33px; transition: transform 0.2s; }
        .ccp .card__number .digit.filed { transform: translateY(-33px); }
        .ccp .card__number .row { height: 33px; display: block; }

        .ccp .card__footer { display: flex; align-items: center; justify-content: space-between; position: relative; z-index: 1; }
        .ccp .card__holder { text-transform: uppercase; }
        .ccp .card__section__title { font-size: 11px; font-weight: 600; text-transform: uppercase; opacity: 0.7; }

        .ccp .form {
          border-radius: 14px; background: var(--card-bg); width: 100%; max-width: 600px; margin: 0 auto; padding: 22px;
          border: 1px solid var(--border-color); box-shadow: 0 4px 18px rgba(0, 0, 0, 0.08); display: grid; gap: 12px; color: var(--charcoal);
        }
        .ccp label { display: block; margin: 6px 0 4px; color: var(--charcoal-light); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; }
        .ccp input, .ccp select {
          height: 48px; display: block; width: 100%; border: 1px solid var(--border-color); padding: 0 16px;
          transition: border-color 150ms ease, box-shadow 150ms ease; border-radius: 10px; outline: none;
          background-color: var(--input-bg); color: var(--charcoal); font-size: 14px;
        }
        .ccp input:focus, .ccp select:focus { border-color: var(--brand-red); box-shadow: 0 0 0 3px var(--brand-red-light); }
        .ccp .filed__group { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
        @media (max-width: 520px) { .ccp .filed__group { grid-template-columns: 1fr; } }
        .ccp .filed__date { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .ccp .err { color: var(--brand-red); font-size: 12px; margin-top: 2px; }
        .ccp .submit {
          margin-top: 8px; height: 46px; border: none; border-radius: 10px; background: var(--brand-red);
          color: #fff; font-weight: 800; letter-spacing: 0.02em; cursor: pointer;
          opacity: ${validity.allValid ? 1 : 0.55};
        }
        .ccp .submit:disabled { cursor: not-allowed; }
      `}</style>
    </section>
  );
};

export { CreditCardForm };
export type { CardState, CardValidity };
