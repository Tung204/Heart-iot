const N = 3362;
const dates = Array.from({ length: N }, (_, i) => new Date(Date.now() - i * 60_000));
const opts = { hour: '2-digit', minute: '2-digit', hour12: false };
const opts2 = { dateStyle: 'medium', timeStyle: 'short' };

function bench(label, fn) {
  const t = performance.now();
  fn();
  console.log(label.padEnd(48), (performance.now() - t).toFixed(1) + 'ms');
}

bench('new Intl.DateTimeFormat xN (hour/minute)', () => {
  for (const d of dates) new Intl.DateTimeFormat('vi-VN', opts).format(d);
});
const cached = new Intl.DateTimeFormat('vi-VN', opts);
bench('Intl.DateTimeFormat tái sử dụng xN', () => {
  for (const d of dates) cached.format(d);
});
bench('new Intl.DateTimeFormat xN (dateStyle+timeStyle)', () => {
  for (const d of dates) new Intl.DateTimeFormat('vi-VN', opts2).format(d);
});
const cached2 = new Intl.DateTimeFormat('vi-VN', opts2);
bench('Intl.DateTimeFormat tái sử dụng xN (date+time)', () => {
  for (const d of dates) cached2.format(d);
});
