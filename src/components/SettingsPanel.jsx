// Settings modal: save management. `window.confirm` doesn't work in the iOS
// shell (ios/Sources/Shell.swift never wires up a WKUIDelegate, so JS dialogs
// silently no-op) — every confirm here is in-app, not native, so it behaves
// identically on web and in the app.

import { useRef, useState } from 'react'
import { useModal } from './useModal.js'
import { clearPrestige } from '../game/persistence.js'

export default function SettingsPanel({ state, saveError, onExport, onImport, onReset, onClose }) {
  const [confirming, setConfirming] = useState(null) // 'run' | 'career' | null
  const [importNote, setImportNote] = useState(null)
  const fileRef = useRef(null)
  const modalRef = useModal(onClose)

  const download = () => {
    const text = onExport()
    const name = `${(state?.config?.companyName || 'studio').replace(/\W+/g, '-').toLowerCase()}-wk${state?.week ?? 0}.json`

    // Inside the iOS shell, `a.download` is INERT — WKWebView ignores it, so the
    // button would look like it worked and produce nothing. Shell.swift exposes
    // a `saveFile` bridge that writes the text to a temp file and hands it to
    // the iOS share sheet instead. See ios/README.md.
    if (window.__TCG_MANAGER_NATIVE__ && window.webkit?.messageHandlers?.saveFile) {
      window.webkit.messageHandlers.saveFile.postMessage({ name, text })
      return
    }

    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const pickFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const ok = onImport(String(reader.result))
      setImportNote(ok
        ? 'Save loaded.'
        : "That file isn't a save this version can read.")
    }
    reader.onerror = () => setImportNote("Couldn't read that file.")
    reader.readAsText(file)
  }

  return (
    <div className="modal" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="modal__sheet" ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="modal__head">
          <h2 id="settings-title">Settings</h2>
          <button className="btn btn--ghost" onClick={onClose} aria-label="Close settings">✕</button>
        </header>

        <div className="modal__body">
          {saveError && (
            <p className="settings__error" role="alert">⚠ {saveError}</p>
          )}

          <div className="builder__section">
            <h3 className="builder__h3">Save</h3>
            <p className="field__note">
              Your run saves itself automatically. Export a copy if you want a
              backup, or to move it to another browser.
            </p>
            <div className="settings__row">
              <button className="btn" onClick={download}>⬇ Download save</button>
              <button className="btn" onClick={() => fileRef.current?.click()}>⬆ Load save</button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = '' }}
              />
            </div>
            {importNote && <p className="field__note">{importNote}</p>}
          </div>

          <div className="builder__section">
            <h3 className="builder__h3">Start over</h3>
            {confirming !== 'run' ? (
              <button className="btn btn--ghost btn--reset" onClick={() => setConfirming('run')}>
                ↺ Reset this run
              </button>
            ) : (
              <div className="settings__confirm">
                <p>
                  This wipes your current run — sets, cash, everything — and starts
                  fresh. Your banked legacy and hall of fame are kept.
                </p>
                <div className="settings__confirmrow">
                  <button className="btn btn--ghost" onClick={() => setConfirming(null)}>Cancel</button>
                  <button className="btn btn--ban" onClick={onReset}>Yes, wipe the run</button>
                </div>
              </div>
            )}
          </div>

          {/* Deliberately separate from resetting a run. Prestige and the hall
              of fame are a CAREER — they survive every reset by design, so
              erasing them has to be its own explicit act. */}
          <div className="builder__section">
            <h3 className="builder__h3">Career</h3>
            <p className="field__note">
              {(state?.prestige?.banked ?? 0) > 0
                ? `${Math.round(state.prestige.banked).toLocaleString()} legacy banked across ${state.prestige.runs} retired ${state.prestige.runs === 1 ? 'studio' : 'studios'}.`
                : 'No legacy banked yet — retire a studio to start a career.'}
            </p>
            {confirming !== 'career' ? (
              <button className="btn btn--ghost btn--reset" onClick={() => setConfirming('career')}>
                ↺ Erase career history
              </button>
            ) : (
              <div className="settings__confirm">
                <p>
                  This erases your banked legacy, every unlocked perk, and the hall
                  of fame. Your current run is untouched. This can't be undone.
                </p>
                <div className="settings__confirmrow">
                  <button className="btn btn--ghost" onClick={() => setConfirming(null)}>Cancel</button>
                  <button
                    className="btn btn--ban"
                    onClick={() => { clearPrestige(); setConfirming(null); onClose() }}
                  >
                    Yes, erase it
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
