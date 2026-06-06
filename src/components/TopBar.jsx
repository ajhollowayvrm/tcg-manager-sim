// Persistent header: resources, the clock, and the play/pause/speed controls.

const SPEEDS = [1, 2, 4]

function formatCash(n) {
  return '$' + n.toLocaleString('en-US')
}

export default function TopBar({ game, onDesignSet }) {
  const { state, play, pause, setSpeed, reset } = game
  const { week, cash, playerBase, clock, lastRevenue, gameOver } = state
  const rev = lastRevenue?.total ?? 0

  return (
    <header className="topbar">
      <div className="topbar__brand">TCG&nbsp;Manager</div>

      <div className="topbar__stats">
        <Stat label="Week" value={week} />
        <Stat label="Cash" value={formatCash(cash)} className={cash < 50_000 ? 'stat--low' : ''} />
        <Stat
          label="Revenue/wk"
          value={rev > 0 ? '+' + formatCash(rev) : '—'}
          className={rev > 0 ? 'stat--rev' : ''}
        />
        <Stat label="Players" value={playerBase.toLocaleString('en-US')} className={playerBase < 2_000 ? 'stat--low' : ''} />
      </div>

      <button className="btn btn--design" onClick={onDesignSet} disabled={!!gameOver}>+ Design a Set</button>

      <div className="topbar__clock">
        {clock.paused ? (
          <button className="btn btn--play" onClick={play} disabled={!!gameOver}>▶ Play</button>
        ) : (
          <button className="btn btn--pause" onClick={() => pause('Paused.')}>❚❚ Pause</button>
        )}
        <div className="speeds">
          {SPEEDS.map((s) => (
            <button
              key={s}
              className={'btn btn--speed' + (clock.speed === s ? ' is-active' : '')}
              onClick={() => setSpeed(s)}
              disabled={!!gameOver}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>

      {gameOver ? (
        <div className="topbar__reason topbar__reason--over">
          💀 {gameOver.reason}
          <button className="btn btn--newgame" onClick={reset}>New Game</button>
        </div>
      ) : (
        clock.pauseReason && <div className={'topbar__reason' + (clock.paused ? '' : ' topbar__reason--live')}>{clock.pauseReason}</div>
      )}
    </header>
  )
}

function Stat({ label, value, className = '' }) {
  return (
    <div className={'stat ' + className}>
      <span className="stat__label">{label}</span>
      <span className="stat__value">{value}</span>
    </div>
  )
}
