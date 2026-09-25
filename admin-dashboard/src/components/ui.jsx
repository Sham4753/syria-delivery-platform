import { useCallback, useState } from 'react'

export function Button({ children, variant = 'primary', busy = false, ...props }) {
  return <button className={`ui-button ${variant}`} disabled={busy || props.disabled} {...props}>{busy ? 'جارٍ الحفظ…' : children}</button>
}

export function Modal({ title, children, onClose }) {
  return <div className="modal-backdrop" role="presentation" onMouseDown={e => e.target === e.currentTarget && onClose()}><section className="modal-card" role="dialog" aria-modal="true" dir="rtl"><div className="modal-header"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="إغلاق">×</button></div>{children}</section></div>
}

export function Field({ label, error, ...props }) {
  return <label className="field"><span>{label}</span><input {...props} />{error && <small className="field-error">{error}</small>}</label>
}

export function SelectField({ label, children, ...props }) {
  return <label className="field"><span>{label}</span><select {...props}>{children}</select></label>
}

export function EmptyState({ children = 'لا توجد بيانات' }) { return <div className="empty-state">{children}</div> }

export function useToast() {
  const [toast, setToast] = useState(null)
  const notify = useCallback((message, type = 'success') => { setToast({ message, type }); window.setTimeout(() => setToast(null), 3500) }, [])
  return { toast, notify }
}

export function Toast({ toast }) { return toast ? <div className={`toast ${toast.type}`} role="status">{toast.message}</div> : null }
