import { useTextSize } from '../lib/text-size';

/** Nút bật/tắt chế độ "chữ lớn" — trạng thái phản ánh qua aria-pressed và label. */
export function TextSizeToggle() {
  const { size, setSize } = useTextSize();
  const large = size === 'large';
  return (
    <button
      type="button"
      className="text-size-toggle"
      aria-pressed={large}
      onClick={() => setSize(large ? 'default' : 'large')}
    >
      <span className="text-size-toggle__icon" aria-hidden="true">
        Aa
      </span>
      <span className="text-size-toggle__label">{large ? 'Tắt chữ lớn' : 'Bật chữ lớn'}</span>
    </button>
  );
}
