import { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { FeedbackContext } from '../context/FeedbackContext';

const ICONS = {
    success: CheckCircle2,
    error: XCircle,
    warning: AlertTriangle,
    info: Info,
};

const DEFAULT_CONFIRM = {
    title: 'Confirm action',
    message: 'Are you sure you want to continue?',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    tone: 'primary',
};

function normalizeToast(input) {
    if (typeof input === 'string') {
        return { type: 'info', title: input, message: '', duration: 4200 };
    }
    return {
        type: input.type || 'info',
        title: input.title || '',
        message: input.message || '',
        duration: input.duration ?? 4200,
    };
}

export function FeedbackProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const [confirmState, setConfirmState] = useState(null);
    const resolverRef = useRef(null);

    const removeToast = useCallback((id) => {
        setToasts(items => items.filter(item => item.id !== id));
    }, []);

    const notify = useCallback((input) => {
        const toast = {
            ...normalizeToast(input),
            id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        };
        setToasts(items => [...items, toast].slice(-5));
        if (toast.duration > 0) {
            window.setTimeout(() => removeToast(toast.id), toast.duration);
        }
        return toast.id;
    }, [removeToast]);

    const confirm = useCallback((options = {}) => {
        const next = { ...DEFAULT_CONFIRM, ...options };
        setConfirmState(next);
        return new Promise(resolve => {
            resolverRef.current = resolve;
        });
    }, []);

    const closeConfirm = useCallback((result) => {
        const resolve = resolverRef.current;
        resolverRef.current = null;
        setConfirmState(null);
        resolve?.(result);
    }, []);

    const value = useMemo(() => ({
        notify,
        confirm,
        success: (title, message) => notify({ type: 'success', title, message }),
        error: (title, message) => notify({ type: 'error', title, message, duration: 6500 }),
        warning: (title, message) => notify({ type: 'warning', title, message, duration: 5600 }),
        info: (title, message) => notify({ type: 'info', title, message }),
    }), [confirm, notify]);

    return (
        <FeedbackContext.Provider value={value}>
            {children}
            <div className="toast-stack" aria-live="polite" aria-relevant="additions removals">
                {toasts.map(toast => {
                    const Icon = ICONS[toast.type] || Info;
                    return (
                        <div key={toast.id} className={`toast toast-${toast.type}`}>
                            <Icon size={18} />
                            <span>
                                {toast.title && <strong>{toast.title}</strong>}
                                {toast.message && <small>{toast.message}</small>}
                            </span>
                            <button type="button" onClick={() => removeToast(toast.id)} aria-label="Dismiss notification">
                                <X size={16} />
                            </button>
                        </div>
                    );
                })}
            </div>

            {confirmState && (
                <div className="confirm-backdrop" role="presentation" onMouseDown={() => closeConfirm(false)}>
                    <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title" onMouseDown={e => e.stopPropagation()}>
                        <div className={`confirm-icon tone-${confirmState.tone}`}>
                            <AlertTriangle size={22} />
                        </div>
                        <div className="confirm-body">
                            <h2 id="confirm-title">{confirmState.title}</h2>
                            {confirmState.message && <p>{confirmState.message}</p>}
                            {confirmState.details && <div className="confirm-details">{confirmState.details}</div>}
                        </div>
                        <div className="confirm-actions">
                            <button type="button" className="btn-secondary" onClick={() => closeConfirm(false)}>
                                {confirmState.cancelLabel}
                            </button>
                            <button type="button" className={`btn ${confirmState.tone === 'danger' ? 'btn-danger' : ''}`} onClick={() => closeConfirm(true)}>
                                {confirmState.confirmLabel}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </FeedbackContext.Provider>
    );
}
