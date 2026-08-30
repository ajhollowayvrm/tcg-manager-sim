// Settings modal: currently just save management. `window.confirm` doesn't
// work in the iOS shell (ios/Sources/Shell.swift never wires up a
// WKUIDelegate, so JS dialogs silently no-op) — this is an in-app confirm
// instead, not a native one, so it works identically on web and in the app.

import { useState } from 'react'

export default function SettingsPanel({ onReset, onClose }) {
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="modal" role="dialog" aria-modal="true">
      <div className="modal__sheet">
        <header className="modal__head">
          <h2>Settings</h2>
          <button className="btn btn--ghost" onClick={onClose}>✕</button>
        </header>

        <div className="modal__body">
          <div className="builder__section">
            <h3 className="builder__h3">Save</h3>
            {!confirming ? (
              <button className="btn btn--ghost btn--reset" onClick={() => setConfirming(true)}>
                ↺ Reset save
              </button>
            ) : (
              <div className="settings__confirm">
                <p>
                  This wipes your current run — sets, cash, everything — and
                  starts fresh. This can't be undone.
                </p>
                <div className="settings__confirmrow">
                  <button className="btn btn--ghost" onClick={() => setConfirming(false)}>Cancel</button>
                  <button className="btn btn--ban" onClick={onReset}>Yes, wipe it</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
