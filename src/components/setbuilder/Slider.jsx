// A labeled slider with end captions, for the set's high-level levers.

export default function Slider({ label, value, min = 0, max = 100, step = 1, onChange, left, right, format }) {
  return (
    <label className="slider">
      <div className="slider__head">
        <span className="slider__label">{label}</span>
        <span className="slider__value">{format ? format(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {(left || right) && (
        <div className="slider__ends">
          <span>{left}</span>
          <span>{right}</span>
        </div>
      )}
    </label>
  )
}
