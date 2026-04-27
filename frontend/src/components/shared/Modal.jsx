import React from 'react';

export default function Modal({ isOpen, onClose, title, children, size = '' }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${size === 'lg' ? 'modal-lg' : ''}`}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-icon" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" style={{width:16,height:16}}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" stroke="currentColor"/>
            </svg>
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmModal({ isOpen, onClose, onConfirm, title = 'Confirmar exclusão', message }) {
  if (!isOpen) return null;
  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{maxWidth: 380}}>
        <div className="modal-body">
          <div className="confirm-content">
            <svg viewBox="0 0 24 24" fill="none" style={{width:48,height:48,color:'var(--danger)',margin:'0 auto 12px',display:'block'}}>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" stroke="currentColor"/>
            </svg>
            <h3 style={{fontSize:16}}>{title}</h3>
            {message && <p>{message}</p>}
          </div>
          <div className="confirm-actions">
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-danger" onClick={onConfirm}>Confirmar</button>
          </div>
        </div>
      </div>
    </div>
  );
}
