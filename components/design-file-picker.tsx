"use client";
import { useId, useRef, useState, useEffect } from "react";
import { FileUp, FileCheck2, Loader2, RefreshCw, X } from "lucide-react";
import type { Locale } from "@/lib/i18n";
import { filePickerCopy, fileSize } from "@/lib/file-picker-copy";
import { inspectDesignFile } from "@/lib/direct-upload";
export type UploadPhase = "uploading" | "staged";
export default function DesignFilePicker({
  label,
  inputLabel,
  kind,
  locale,
  value,
  required = false,
  disabled = false,
  error = "",
  phase,
  onChange,
  onChecking,
}: {
  label: string;
  inputLabel?: string;
  kind?: string;
  locale: Locale;
  value?: File;
  required?: boolean;
  disabled?: boolean;
  error?: string;
  phase?: UploadPhase;
  onChange: (file: File | undefined) => void;
  onChecking?: (busy: boolean) => void;
}) {
  const id = useId(),
    input = useRef<HTMLInputElement>(null),
    attempt = useRef(0),
    [checking, C] = useState(false),
    [invalid, E] = useState(""),
    [candidate, F] = useState<File>();
  const c = filePickerCopy[locale];
  useEffect(
    () => () => {
      attempt.current++;
    },
    [],
  );
  async function selected(file?: File) {
    if (!file) return;
    const revision = ++attempt.current;
    E("");
    F(file);
    C(true);
    onChecking?.(true);
    onChange(undefined);
    try {
      await inspectDesignFile(file);
      if (revision === attempt.current) onChange(file);
    } catch {
      if (revision === attempt.current)
        E(!file.size || file.size > 25 * 1024 * 1024 ? c.size : c.format);
    } finally {
      if (revision === attempt.current) {
        C(false);
        onChecking?.(false);
      }
    }
  }
  const problem = invalid || error,
    shown = checking || invalid ? candidate : value;
  const status = problem
    ? c.invalid
    : checking
      ? c.checking
      : phase
        ? c[phase]
        : value
          ? c.selected
          : c.empty;
  return (
    <fieldset
      className={`design-file-picker ${problem ? "has-error" : ""}`}
      aria-label={label}
      data-file-kind={kind}
      aria-busy={checking || !!phase}
      disabled={disabled}
    >
      <legend>
        <FileUp size={17} aria-hidden="true" />
        <span>{label}</span>
        <small>{required ? c.required : c.optional}</small>
      </legend>
      <input
        hidden
        className="design-file-input"
        type="file"
        id={id}
        ref={input}
        tabIndex={-1}
        aria-label={inputLabel || `${c.file}: ${label}`}
        accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          void selected(file);
        }}
      />
      <div className="design-file-body">
        <span className="design-file-icon" aria-hidden="true">
          {checking ? (
            <Loader2 className="spin" size={21} />
          ) : shown ? (
            <FileCheck2 size={21} />
          ) : (
            <FileUp size={21} />
          )}
        </span>
        <div className="design-file-meta">
          {shown ? (
            <>
              <b className="design-file-name">{shown.name}</b>
              <small
                className="design-file-size"
                title={`${shown.size} ${c.bytes}`}
              >
                {fileSize(shown.size, locale)}
              </small>
            </>
          ) : (
            <span className="muted">{c.empty}</span>
          )}
          <p id={id + "-status"} role="status">
            {status}
          </p>
        </div>
      </div>
      <div className="design-file-actions">
        <button
          className="btn design-file-button"
          type="button"
          aria-controls={id}
          aria-describedby={id + "-types"}
          disabled={disabled || checking}
          onClick={() => input.current?.click()}
        >
          {shown ? <RefreshCw size={15} /> : <FileUp size={15} />}{" "}
          {shown ? c.replace : c.choose}
        </button>
        {shown && !phase && (
          <button
            type="button"
            className="text-btn"
            disabled={disabled || checking}
            onClick={() => {
              attempt.current++;
              E("");
              F(undefined);
              if (input.current) input.current.value = "";
              onChange(undefined);
            }}
          >
            <X size={14} />
            {c.remove}
          </button>
        )}
      </div>
      <small id={id + "-types"} className="design-file-types">
        {c.types}
      </small>
      {problem && (
        <p className="field-error" role="alert">
          {problem}
        </p>
      )}
    </fieldset>
  );
}
