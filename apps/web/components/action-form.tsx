'use client';

import { useEffect, useId, useRef, useState, type FormHTMLAttributes, type FormEvent } from 'react';

type Props = FormHTMLAttributes<HTMLFormElement> & { pendingLabel?: string; confirmMessage?: string };
const checkedNavigations = new WeakSet<Event>();

// Preserve native POSTs and submitter values, including without JavaScript.
export function ActionForm({ children, pendingLabel = 'Saving…', confirmMessage, ...props }: Props) {
  const form = useRef<HTMLFormElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const submitter = useRef<HTMLButtonElement | HTMLInputElement | null>(null);
  const approved = useRef(false);
  const busy = useRef(false);
  const dirty = useRef(false);
  const originalButton = useRef<{ button: HTMLElement; text: string | null } | null>(null);
  const [pending, setPending] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<{ id: string; label: string; message: string }[]>([]);
  const errorId = useId();

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current && !busy.current) { event.preventDefault(); event.returnValue = ''; }
    };
    const beforeNavigation = (event: MouseEvent) => {
      if (!dirty.current || busy.current || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!(link instanceof HTMLAnchorElement) || link.target || link.hasAttribute('download')) return;
      const next = new URL(link.href, location.href);
      if (next.pathname === location.pathname && next.search === location.search) return;
      if (checkedNavigations.has(event)) return;
      checkedNavigations.add(event);
      if (!window.confirm('Leave this page? Your unsaved changes will be lost.')) { event.preventDefault(); event.stopPropagation(); }
    };
    const reset = () => {
      busy.current = false; dirty.current = false; setPending(false);
      if (originalButton.current) originalButton.current.button.textContent = originalButton.current.text;
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('pageshow', reset);
    document.addEventListener('click', beforeNavigation, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('pageshow', reset);
      document.removeEventListener('click', beforeNavigation, true);
    };
  }, []);

  function validate() {
    const invalid = Array.from(form.current?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea') ?? [])
      .filter(field => field.willValidate && !field.validity.valid);
    setErrors(invalid.map(field => {
      const disclosure = field.closest('details');
      if (disclosure) disclosure.open = true;
      const id = field.id || `${errorId}-${field.name}`;
      field.id = id; field.setAttribute('aria-invalid', 'true');
      const hint = `${errorId}-${id}-error`;
      const descriptions = new Set((field.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean));
      descriptions.add(hint); field.setAttribute('aria-describedby', [...descriptions].join(' '));
      return { id, label: field.labels?.[0]?.textContent?.trim() || field.name, message: field.validationMessage };
    }));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    if (busy.current) { event.preventDefault(); return; }
    const button = (event.nativeEvent as SubmitEvent).submitter;
    const message = confirmMessage ?? button?.getAttribute('data-confirm');
    if (message && !approved.current) {
      event.preventDefault();
      setConfirmation(message);
      submitter.current = button instanceof HTMLButtonElement || button instanceof HTMLInputElement ? button : null;
      dialog.current?.showModal();
      return;
    }
    approved.current = false;
    busy.current = true; setPending(true); setErrors([]);
    // Disabling the submitter would discard its name/value in a native POST.
    if (button instanceof HTMLButtonElement) {
      originalButton.current = { button, text: button.textContent };
      button.textContent = pendingLabel;
    }
  }

  return <>
    <form {...props} ref={form} onSubmit={submit} aria-busy={pending}
      onInvalidCapture={validate} onInput={event => {
        dirty.current = true;
        const field = event.target;
        if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement || field instanceof HTMLTextAreaElement) {
          if (field.validity.valid) {
            field.removeAttribute('aria-invalid');
            const descriptions = (field.getAttribute('aria-describedby') ?? '').split(' ').filter(id => id !== `${errorId}-${field.id}-error`);
            field.setAttribute('aria-describedby', descriptions.join(' '));
            setErrors(previous => previous.filter(error => error.id !== field.id));
          }
        }
      }} onChange={() => { dirty.current = true; }}>
      {children}
      {errors.length > 0 && <div className="form-errors" role="alert">
        <strong>Check these fields</strong>
        <ul>{errors.map(error => <li key={error.id} id={`${errorId}-${error.id}-error`}><a href={`#${error.id}`} onClick={() => document.getElementById(error.id)?.focus()}>{error.label}: {error.message}</a></li>)}</ul>
      </div>}
      {pending && <p className="form-progress" role="status">{pendingLabel} Please wait.</p>}
    </form>
    <dialog ref={dialog} className="confirmation-dialog" aria-labelledby={`${errorId}-title`} aria-describedby={`${errorId}-description`}
      onClose={() => { submitter.current = null; approved.current = false; }}>
      <h2 id={`${errorId}-title`}>Confirm this change</h2>
      <p id={`${errorId}-description`}>{confirmation}</p>
      <div className="decision-actions">
        <button className="button button-secondary" type="button" autoFocus onClick={() => dialog.current?.close()}>Cancel</button>
        <button className="button button-danger" type="button" onClick={() => {
          const selected = submitter.current;
          dialog.current?.close();
          approved.current = true;
          form.current?.requestSubmit(selected ?? undefined);
        }}>Confirm change</button>
      </div>
    </dialog>
  </>;
}
