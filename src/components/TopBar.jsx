// Persistent header: resources, the clock, and the play/pause/speed controls.

const SPEEDS = [1, 2, 4]

function formatCash(n) {
  return '$' + n.toLocaleString('en-US')
}

export default function TopBar({ game }) {
  const { state, play, pause, setSpeed } = game
  const { week, cash, playerBase, clock } = state

  return (
    <header className="topbar">
      <div className="topbar__brand">TCG&nbsp;Manager</div>

      <div className="topbar__stats">
        <Stat label="Week" value={week} />
        <Stat label="Cash" value={formatCash(cash)} />
        <Stat label="Players" value={playerBase.toLocaleString('en-US')} />
      </div>

      <div className="topbar__clock">
        {clock.paused ? (
          <button className="btn btn--play" onClick={play}>▶ Play</button>
        ) : (
          <button className="btn btn--pause" onClick={() => pause('Paused.')}>❚❚ Pause</button>
        )}
        <div className="speeds">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={'btn btn--speed' + (clock.speed === s ? ' is-active' : '')}
              onClick={() => setSpeed(s)}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {clock.pauseReason && clock.paused && (
        <div className="topbar__reason">{clock.pauseReason}</div>
      )}
    </header>
  )
}

function Stat({ label, value }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
    </div>
  )
}
