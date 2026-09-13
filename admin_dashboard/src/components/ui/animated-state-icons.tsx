"use client";

import { useEffect, useRef, useState } from "react";

/** Adapted from the "Animated State Icons" catalogue component
 * (dev.yadhakim) — same SVG paths for the three icons that have a real,
 * existing state to drive them in this app (Bell/notification, Eye/hidden,
 * Volume/mute). The other nine icons in that set (heart, send, play/pause,
 * etc.) have no matching feature here, so they aren't ported.
 *
 * One real, necessary change from the reference: its own icons auto-toggle
 * on a dumb interval timer (`useAutoToggle`), looping regardless of any
 * actual state — a bell that "rings" every 2.8s whether or not there's a
 * real notification would be actively misleading here, not a genuine
 * upgrade. These take an explicit `on` prop instead and animate only when
 * the real state they represent actually changes.
 *
 * A second, later change, this time from framer-motion to plain CSS: every
 * icon here originally toggled its visual state via framer-motion's
 * `animate` prop on an already-mounted element. That was confirmed broken
 * in this app — the DOM's raw `style` attribute updates correctly on a
 * prop change, but the browser's actual computed/rendered output silently
 * stays on the old value (verified via `getComputedStyle`, not just
 * `getAttribute` or a screenshot — both of those looked fine while the
 * real render was stuck). Reproduced across framer-motion `animate`,
 * framer-motion `pathLength`, and even a framer-motion-free plain CSS
 * `transition` — the common factor was always "update an animated value on
 * an element that was already on screen," never the specific animation
 * technique. What's reliable instead: conditionally *mounting* each visual
 * state as its own element, animated in via a plain CSS `@keyframes` that
 * plays once automatically on mount — mounting/unmounting was the one
 * thing that worked correctly all session. Every icon below now uses that
 * pattern; see [[feedback-framer-motion-prop-update-bug]] in project
 * memory for the full investigation. */

interface StateIconProps {
  on: boolean;
  size?: number;
  color?: string;
  className?: string;
}

/** Bell that rings (rotation flourish) the moment `on` first goes true,
 * plus a red dot that stays mounted for as long as `on` is true — replaces
 * the plain static Bell used for Flags & Reviews, driven by
 * totalFlagCount > 0 instead of a timer.
 *
 * The ring is a one-shot effect on the false→true transition, not a
 * persistent state (the bell doesn't stay tilted while flags remain), so
 * it can't be driven by conditionally mounting on `on` alone — it needs to
 * replay every time a *new* transition happens while `on` stays true
 * across renders. Solved by remounting the `<g>` via a `key` that only
 * increments on that specific transition, which retriggers its CSS
 * `@keyframes` the same reliable way as every other icon here. */
export function NotificationIcon({ on, size = 16, color = "currentColor", className }: StateIconProps) {
  const [shakeKey, setShakeKey] = useState(0);
  const wasOn = useRef(on);
  useEffect(() => {
    if (on && !wasOn.current) setShakeKey(k => k + 1);
    wasOn.current = on;
  }, [on]);

  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} style={{ width: size, height: size }}>
      <g key={shakeKey} style={shakeKey > 0 ? { animation: "bell-shake 0.6s ease", transformOrigin: "20px 6px" } : undefined}>
        <path d="M28 16a8 8 0 00-16 0c0 8-4 10-4 10h24s-4-2-4-10" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M17.5 30a3 3 0 005 0" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      </g>
      {on && (
        <circle
          cx="28" cy="10" r="4" fill="var(--brand-red)"
          style={{ transformOrigin: "28px 10px", animation: "state-icon-pop-in 0.4s cubic-bezier(0.32,0.72,0,1) forwards" }}
        />
      )}
    </svg>
  );
}

/** Eye that closes to a slash the moment a password/PIN field switches
 * to hidden — replaces the static Eye/EyeOff pairs at login, company
 * signup, and new-password fields. `on` = hidden (password masked),
 * matching how those fields already name their own state (showPassword
 * etc.) inverted at the call site. */
export function EyeToggleIcon({ on, size = 16, color = "currentColor", className }: StateIconProps) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} style={{ width: size, height: size }}>
      {!on && (
        <g key="visible" style={{ animation: "state-icon-pop-in 0.25s ease forwards" }}>
          <path d="M4 20s6-10 16-10 16 10 16 10-6 10-16 10S4 20 4 20z" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="20" cy="20" r="5" stroke={color} strokeWidth={2.4} />
        </g>
      )}
      {on && (
        <g key="hidden" style={{ animation: "state-icon-pop-in 0.25s ease forwards" }}>
          <path d="M4 20s6-10 16-10 16 10 16 10-6 10-16 10S4 20 4 20z" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" opacity={0.3} />
          <circle cx="20" cy="20" r="5" stroke={color} strokeWidth={2.4} opacity={0.2} style={{ transform: "scale(0.6)", transformOrigin: "20px 20px" }} />
          <line x1="6" y1="34" x2="34" y2="6" stroke={color} strokeWidth={2.8} strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}

/** Spinning ring that morphs into a checkmark — replaces the plain
 * text-only save buttons across Settings (Update Password, Create
 * Account, Add Depot, Save Thresholds, Save Changes). Render only while
 * `saving` or `success` is true; the button stays icon-free otherwise,
 * matching how it looked before this was added.
 *
 * Deviation from the reference: the reference's DownloadDoneIcon/CopiedIcon
 * variants crossfade their two states with an internal AnimatePresence and a
 * `pathLength` stroke animation, both framer-motion. Neither survived
 * testing here — nor did a follow-up plain-CSS-transition rewrite, nor does
 * the *existing*, already-shipped EyeToggleIcon a few lines down in this
 * same file (confirmed independently: its slash line's raw `style` updates
 * correctly on toggle, but the browser's computed style stays stuck at the
 * old value — a real, pre-existing bug, not something new, flagged
 * separately). Any technique where a value changes via a *prop update on an
 * already-mounted element* fails silently in this app. What's proven
 * reliable all session is conditional *mounting*: an element that doesn't
 * exist until its condition is true, animated in via a plain CSS
 * `@keyframes` that plays once automatically on mount — no dependency on a
 * later prop change ever being picked up. */
export function SaveIcon({ saving, success, size = 14, color = "currentColor", className }: { saving: boolean; success: boolean; size?: number; color?: string; className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} style={{ width: size, height: size }}>
      {saving && (
        <circle
          cx="20" cy="20" r="16" stroke={color} strokeWidth={3.5}
          strokeLinecap="round" strokeDasharray="25 75"
          style={{ transformOrigin: "20px 20px", animation: "spin 1s linear infinite" }}
        />
      )}
      {success && (
        <path
          d="M12 20l6 6 10-12" stroke={color} strokeWidth={3.5}
          strokeLinecap="round" strokeLinejoin="round"
          style={{ transformOrigin: "20px 20px", animation: "state-icon-pop-in 0.3s cubic-bezier(0.32,0.72,0,1) forwards" }}
        />
      )}
    </svg>
  );
}

/** Arrow drops into a tray, then briefly morphs into a checkmark —
 * replaces the static Download icon on the CSV/Excel export buttons.
 * `done` is flipped true for ~1.2s by the caller right after export —
 * these exports build the file synchronously client-side, so there's no
 * real loading phase to show, only a confirmation flash. Same
 * mount-driven adaptation as SaveIcon, for the same reason (see its
 * comment above). */
export function DownloadIcon({ done, size = 13, color = "currentColor", className }: { done: boolean; size?: number; color?: string; className?: string }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} style={{ width: size, height: size }}>
      <path d="M8 28v4a2 2 0 002 2h20a2 2 0 002-2v-4" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
      {!done && (
        <g>
          <line x1="20" y1="6" x2="20" y2="24" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
          <polyline points="14,18 20,24 26,18" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />
        </g>
      )}
      {done && (
        <path
          d="M14 22l6 6 8-10" stroke={color} strokeWidth={3}
          strokeLinecap="round" strokeLinejoin="round"
          style={{ transformOrigin: "20px 20px", animation: "state-icon-pop-in 0.3s cubic-bezier(0.32,0.72,0,1) 0.15s forwards" }}
        />
      )}
    </svg>
  );
}

/** Speaker whose sound waves fade and an X crosses them the moment the
 * alarm is muted — replaces the static Volume2/VolumeX pairs on the
 * Alert Monitors mute button and the Settings audio switch. `on` =
 * muted, matching isAudioMuted directly. */
export function VolumeIcon({ on, size = 16, color = "currentColor", className }: StateIconProps) {
  return (
    <svg viewBox="0 0 40 40" fill="none" className={className} style={{ width: size, height: size }}>
      <path d="M8 16h5l7-6v20l-7-6H8a1 1 0 01-1-1V17a1 1 0 011-1z" stroke={color} strokeWidth={2.4} strokeLinejoin="round" />
      {!on && (
        <g key="unmuted" style={{ animation: "state-icon-pop-in 0.3s ease forwards" }}>
          <path d="M26 14a8 8 0 010 12" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
          <path d="M30 10a14 14 0 010 20" stroke={color} strokeWidth={2.2} strokeLinecap="round" opacity={0.5} />
        </g>
      )}
      {on && (
        <g key="muted" style={{ animation: "state-icon-pop-in 0.25s ease forwards" }}>
          <line x1="26" y1="16" x2="34" y2="24" stroke={color} strokeWidth={2.8} strokeLinecap="round" />
          <line x1="34" y1="16" x2="26" y2="24" stroke={color} strokeWidth={2.8} strokeLinecap="round" />
        </g>
      )}
    </svg>
  );
}
