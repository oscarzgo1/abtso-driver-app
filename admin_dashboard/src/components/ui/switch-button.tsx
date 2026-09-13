import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

// Adapted from the catalogue reference, which imports from "motion/react"
// (the Motion library's newer package name) and installs a fresh "motion"
// dependency. This app already has framer-motion installed — same
// library, same exports — so no new dependency was added; the import was
// just pointed at the one we already have.

type SwitchProps = {
  value: boolean;
  onToggle: () => void;
  iconOn: ReactNode;
  iconOff: ReactNode;
  className?: string;
};

export function Switch({ value, onToggle, iconOn, iconOff, className = '' }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      className={`flex w-12 cursor-pointer rounded-full p-0.5 ${value ? 'justify-end' : 'justify-start'} ${className}`}
      style={{ background: value ? 'var(--brand-red, #CC0000)' : 'var(--border-color, #E4E4E7)', border: 'none', transition: 'background-color 0.25s ease' }}
      onClick={onToggle}
    >
      <motion.div
        className="flex justify-center items-center size-6 rounded-full"
        style={{ background: '#FFFFFF' }}
        layout
        transition={{ type: 'spring', duration: 0.6, bounce: 0.2 }}
      >
        {value ? (
          <motion.div
            key="on"
            initial={{ opacity: 0, rotate: -60 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, rotate: 60 }}
            transition={{ duration: 0.3 }}
            className="flex justify-center items-center size-5"
            style={{ color: 'var(--brand-red, #CC0000)' }}
          >
            {iconOn}
          </motion.div>
        ) : (
          <motion.div
            key="off"
            initial={{ opacity: 0, rotate: 60 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, rotate: -60 }}
            transition={{ duration: 0.3 }}
            className="flex justify-center items-center size-5"
            style={{ color: '#71717A' }}
          >
            {iconOff}
          </motion.div>
        )}
      </motion.div>
    </button>
  );
}
