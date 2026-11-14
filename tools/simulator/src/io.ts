/**
 * Lớp xuất/nhập của CLI. Mọi dòng ghi ra stdout/stderr đi qua đây để:
 * - mỗi phản hồi là một dòng JSON ngắn;
 * - khóa thiết bị không bao giờ bị in ra (kể cả khi lỗi mạng).
 */

export interface Io {
  out(line: string): void;
  err(line: string): void;
}

export function createConsoleIo(): Io {
  return {
    out: (line: string) => {
      process.stdout.write(`${line}\n`);
    },
    err: (line: string) => {
      process.stderr.write(`${line}\n`);
    },
  };
}

export function jsonLine(value: Record<string, unknown>): string {
  return JSON.stringify(value);
}

/** Lọc bỏ secret khỏi một chuỗi trước khi ghi log. */
export function redactSecrets(text: string, secrets: ReadonlyArray<string | null | undefined>): string {
  let result = text;
  for (const secret of secrets) {
    if (secret !== null && secret !== undefined && secret.length >= 8) {
      result = result.split(secret).join('[redacted]');
    }
  }
  return result;
}

/** Bọc Io gốc, bảo đảm mọi dòng đã lọc secret. */
export function createSafeIo(io: Io, secrets: ReadonlyArray<string | null | undefined>): Io {
  return {
    out: (line: string) => io.out(redactSecrets(line, secrets)),
    err: (line: string) => io.err(redactSecrets(line, secrets)),
  };
}

export interface CapturedIo extends Io {
  readonly stdout: string[];
  readonly stderr: string[];
  text(): string;
}

/** Io thu vào mảng, dùng cho test. */
export function createCapturedIo(): CapturedIo {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    out: (line: string) => {
      stdout.push(line);
    },
    err: (line: string) => {
      stderr.push(line);
    },
    text: () => [...stdout, ...stderr].join('\n'),
  };
}
