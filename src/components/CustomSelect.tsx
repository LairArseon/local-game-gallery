/**
 * Reusable, accessible select replacement used by setup, filter, and modal flows.
 *
 * This control is intentionally lightweight but still supports keyboard-friendly
 * interaction patterns expected from a dropdown: open/close toggling, option
 * focus movement, and enter/escape behavior. It also normalizes option rendering
 * so styling stays consistent across panels and overlays where native select
 * styling would otherwise diverge heavily between platforms.
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { ChevronDown } from 'lucide-react';

type CustomSelectOption = {
  value: string;
  label: string;
};

type CustomSelectProps = {
  value: string;
  options: CustomSelectOption[];
  ariaLabel: string;
  onChange: (value: string) => void;
  className?: string;
};

export function CustomSelect({ value, options, ariaLabel, onChange, className }: CustomSelectProps) {
  const menuId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));

  useEffect(() => {
    setHighlightedIndex(selectedIndex);
  }, [selectedIndex, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    // Close on outside interactions so overlays behave like native selects.
    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (rootRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    optionRefs.current[highlightedIndex]?.focus();
  }, [highlightedIndex, isOpen]);

  function moveHighlight(delta: number) {
    setHighlightedIndex((current) => {
      if (!options.length) {
        return 0;
      }

      return (current + delta + options.length) % options.length;
    });
  }

  function commitHighlightedOption() {
    const nextOption = options[highlightedIndex];
    if (!nextOption) {
      return;
    }

    onChange(nextOption.value);
    setIsOpen(false);
    // Restore trigger focus for keyboard continuity after selecting from menu.
    triggerRef.current?.focus();
  }

  function handleTriggerKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!isOpen) {
        setHighlightedIndex(selectedIndex);
        setIsOpen(true);
        return;
      }

      moveHighlight(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen) {
        setHighlightedIndex(selectedIndex);
        setIsOpen(true);
        return;
      }

      moveHighlight(-1);
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }

      commitHighlightedOption();
      return;
    }

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault();
      setIsOpen(false);
    }
  }

  function handleMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveHighlight(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveHighlight(-1);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      setHighlightedIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      setHighlightedIndex(Math.max(0, options.length - 1));
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      commitHighlightedOption();
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      setIsOpen(false);
      triggerRef.current?.focus();
      return;
    }

    if (event.key === 'Tab') {
      setIsOpen(false);
    }
  }

  const selectedOption = options.find((option) => option.value === value) ?? options[0];

  return (
    <div className={`custom-select ${className ?? ''}`.trim()} ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="custom-select__trigger"
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-controls={menuId}
        aria-activedescendant={isOpen ? `${menuId}-option-${highlightedIndex}` : undefined}
        onClick={() => setIsOpen((current) => !current)}
        onKeyDown={handleTriggerKeyDown}
      >
        <span>{selectedOption?.label ?? ''}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className="custom-select__menu" id={menuId} role="listbox" aria-label={ariaLabel} onKeyDown={handleMenuKeyDown}>
          {options.map((option, index) => (
            <button
              key={option.value || '__empty__'}
              ref={(element) => {
                optionRefs.current[index] = element;
              }}
              id={`${menuId}-option-${index}`}
              type="button"
              role="option"
              aria-selected={value === option.value}
              tabIndex={index === highlightedIndex ? 0 : -1}
              className={`custom-select__option ${value === option.value ? 'custom-select__option--selected' : ''}`}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
                triggerRef.current?.focus();
              }}
              onMouseEnter={() => setHighlightedIndex(index)}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
