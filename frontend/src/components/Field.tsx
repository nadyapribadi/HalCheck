import React from "react";

interface SelectFieldProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  hint?: string;
  disabled?: boolean;
}

// docs/09 §6 SearchableSelect: "replaces free-text input wherever a
// controlled reference list applies". A native select backed only by
// reference-list values enforces that at the control itself -- there is no
// text path to mistype a value the ledger would then have to reject.
export function SelectField({
  label,
  value,
  options,
  onChange,
  placeholder = "Select…",
  hint,
  disabled,
}: SelectFieldProps): React.ReactElement {
  return (
    <div className="field">
      <label>
        {label}
        <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled}>
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      {hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  hint?: string;
  placeholder?: string;
  required?: boolean;
}

export function TextField({
  label,
  value,
  onChange,
  type = "text",
  hint,
  placeholder,
  required,
}: TextFieldProps): React.ReactElement {
  return (
    <div className="field">
      <label>
        {label}
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          required={required}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      {hint ? <div className="field-hint">{hint}</div> : null}
    </div>
  );
}
