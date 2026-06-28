// @author: frontend-ai | phase: 2 | component: Switch
import React from 'react';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  ariaLabel: string;
}

/** 渲染统一开关控件。 */
export const Switch: React.FC<SwitchProps> = ({ checked, onChange, disabled = false, ariaLabel }) => (
  <button
    type="button"
    aria-label={ariaLabel}
    aria-pressed={checked}
    disabled={disabled}
    onClick={(): void => onChange(!checked)}
    className={`relative h-5 w-9 rounded-full transition disabled:opacity-50 ${checked ? 'bg-accent' : 'bg-border'}`}
  >
    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${checked ? 'left-[18px]' : 'left-0.5'}`} />
  </button>
);
