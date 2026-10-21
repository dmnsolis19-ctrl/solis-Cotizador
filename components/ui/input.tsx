import * as React from "react"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  const Control = type === "number" ? NumberInput : "input"
  return (
    <Control
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

// Keep the text being edited while callers store numbers (Number("") is 0).
// Native number validation, refs and change events still belong to the input.
function NumberInput({ value, onChange, onFocus, onClick, onBlur, ...props }: React.ComponentProps<"input">) {
  const [draft, setDraft] = React.useState<string | null>(null)
  const controlled = value !== undefined
  const matches = draft !== null && (String(value ?? "") === draft ||
    (Number.isFinite(Number(value)) && Number(draft) === Number(value)))

  React.useEffect(() => {
    if (!matches) setDraft(null)
  }, [value, matches])

  const selectZero = (input: HTMLInputElement) => {
    if (!props.readOnly && input.value !== "" && Number(input.value) === 0) input.select()
  }

  return <input {...props} type="number" inputMode={props.inputMode ?? "decimal"}
    value={controlled && matches ? draft! : value}
    onFocus={event => { onFocus?.(event); if (!event.defaultPrevented) selectZero(event.currentTarget) }}
    onClick={event => { onClick?.(event); if (!event.defaultPrevented) selectZero(event.currentTarget) }}
    onChange={event => {
      // Also handle keyboards that leave the initial zero in front of a digit.
      const current = event.currentTarget.value
      const text = current.replace(/^(-?)0+(?=\d)/, "$1")
      if (text !== current) event.currentTarget.value = text
      if (controlled) setDraft(text)
      onChange?.(event)
    }}
    onBlur={event => { setDraft(null); onBlur?.(event) }}
  />
}

export { Input }
