import type { ComponentProps } from 'react';

interface TextFieldProps extends Omit<ComponentProps<'input'>, 'id' | 'className'> {
  id: string;
  label: string;
  error?: string;
  hint?: string;
}

/** Trường nhập có label thật, hint và thông báo lỗi nối bằng aria-describedby. */
export function TextField({ id, label, error, hint, required, ...inputProps }: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {required ? (
          <span className="field__required" aria-hidden="true">
            {' '}
            *
          </span>
        ) : null}
      </label>
      {hint ? (
        <p className="field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      <input
        id={id}
        className={`field__input${error ? ' field__input--error' : ''}`}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : hintId}
        required={required}
        {...inputProps}
      />
      {error ? (
        <p className="field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
