/**
 * Shared type contracts for CustomSelect.
 */

export type CustomSelectOption = {
  value: string;
  label: string;
};

export type CustomSelectProps = {
  value: string;
  options: CustomSelectOption[];
  ariaLabel: string;
  onChange: (value: string) => void;
  className?: string;
};
