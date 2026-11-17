/**
 * Bộ đọc tham số dòng lệnh tối giản (không thêm dependency).
 * Lỗi tham số được thu vào `errors` để CLI in ra và trả exit code 2.
 */

export class Args {
  readonly errors: string[] = [];

  private readonly flags = new Map<string, string | true>();
  private readonly positionals: string[] = [];

  constructor(args: readonly string[]) {
    for (let index = 0; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === undefined) {
        continue;
      }
      if (arg === '--help' || arg === '-h') {
        this.flags.set('help', true);
        continue;
      }
      if (!arg.startsWith('--')) {
        this.positionals.push(arg);
        continue;
      }
      const equals = arg.indexOf('=');
      if (equals > 2) {
        this.flags.set(arg.slice(2, equals), arg.slice(equals + 1));
        continue;
      }
      const name = arg.slice(2);
      const next = args[index + 1];
      if (next === undefined || next.startsWith('--')) {
        this.flags.set(name, true);
        continue;
      }
      this.flags.set(name, next);
      index += 1;
    }
  }

  hasHelp(): boolean {
    return this.flags.has('help');
  }

  /** Kiểm tham số lạ/thiếu giá trị; gọi sau khi đọc các tham số đã biết. */
  checkKnown(allowed: readonly string[]): void {
    for (const [name, value] of this.flags) {
      if (name === 'help') {
        continue;
      }
      if (!allowed.includes(name)) {
        this.errors.push(`tham số không được hỗ trợ: --${name}`);
      } else if (value === '') {
        this.errors.push(`--${name} cần giá trị`);
      }
    }
    for (const positional of this.positionals) {
      this.errors.push(`tham số không được hỗ trợ: "${positional}"`);
    }
  }

  boolean(name: string): boolean {
    const value = this.flags.get(name);
    return value === true || value === 'true' || value === '1';
  }

  int(name: string, fallback: number, min: number, max: number): number {
    const value = this.flags.get(name);
    if (value === undefined) {
      return fallback;
    }
    if (value === true) {
      this.errors.push(`--${name} cần giá trị số nguyên`);
      return fallback;
    }
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
      this.errors.push(`--${name} phải là số nguyên trong khoảng ${min}..${max} (nhận: "${value}")`);
      return fallback;
    }
    return parsed;
  }

  enum<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
    const value = this.flags.get(name);
    if (value === undefined) {
      return fallback;
    }
    if (value === true) {
      this.errors.push(`--${name} cần giá trị (${allowed.join('|')})`);
      return fallback;
    }
    if (!(allowed as readonly string[]).includes(value)) {
      this.errors.push(`--${name} không hợp lệ: "${value}" (chấp nhận: ${allowed.join('|')})`);
      return fallback;
    }
    return value as T;
  }
}
