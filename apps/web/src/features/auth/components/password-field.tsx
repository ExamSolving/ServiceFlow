"use client";

import { useState, type ComponentProps } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type PasswordFieldProps = ComponentProps<"input"> & {
  id: string;
  label: string;
  error?: string;
  hint?: React.ReactNode;
  action?: React.ReactNode;
};

export function PasswordField({
  id,
  label,
  error,
  hint,
  action,
  ...props
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="sf-field">
      <div className="sf-label-row">
        <Label htmlFor={id}>{label}</Label>
        {action}
      </div>
      <div className="sf-input-wrap">
        <LockKeyhole className="sf-input-icon" size={18} aria-hidden="true" />
        <Input
          {...props}
          id={id}
          type={visible ? "text" : "password"}
          className="sf-input sf-password-input"
          aria-invalid={!!error}
          aria-describedby={
            error ? `${id}-error` : hint ? `${id}-hint` : undefined
          }
        />
        <button
          type="button"
          className="sf-password-toggle"
          onClick={() => setVisible(!visible)}
          disabled={props.disabled}
          aria-label={
            visible
              ? `Hide ${label.toLowerCase()}`
              : `Show ${label.toLowerCase()}`
          }
          aria-pressed={visible}
        >
          {visible ? (
            <EyeOff size={18} aria-hidden="true" />
          ) : (
            <Eye size={18} aria-hidden="true" />
          )}
        </button>
      </div>
      {error ? (
        <p className="sf-field-error" id={`${id}-error`} role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="sf-field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
