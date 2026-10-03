import { useId, type ReactNode } from "react";

interface StepperProps {
  /** What the control moves through, such as "Split". */
  label: string;
  value: number;
  min: number;
  max: number;
  onChange(value: number): void;
  /** Spoken in place of the bare number. */
  valueText?: string;
  /** Extra buttons after Next, such as Play. */
  children?: ReactNode;
  name: string;
}

/** A range input with Previous and Next buttons, for stepping through a run. */
export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  valueText,
  children,
  name,
}: StepperProps) {
  const id = useId();
  return (
    <div className="how-stepper" data-stepper={name}>
      <label htmlFor={id}>{label}</label>
      <div className="how-stepper-row">
        <button
          type="button"
          className="button secondary"
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
        >
          Previous
        </button>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          aria-valuetext={valueText}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <button
          type="button"
          className="button secondary"
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
        >
          Next
        </button>
        {children}
      </div>
    </div>
  );
}

interface ChoiceProps<T extends string> {
  legend: string;
  value: T;
  options: { value: T; label: string }[];
  onChange(value: T): void;
  name: string;
}

/** Radio buttons laid out as a segmented control. Arrow keys move between them. */
export function Choice<T extends string>({
  legend,
  value,
  options,
  onChange,
  name,
}: ChoiceProps<T>) {
  const group = useId();
  return (
    <fieldset className="how-choice" data-choice={name}>
      <legend>{legend}</legend>
      <div>
        {options.map((option) => (
          <label key={option.value}>
            <input
              type="radio"
              name={group}
              checked={option.value === value}
              onChange={() => onChange(option.value)}
            />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
