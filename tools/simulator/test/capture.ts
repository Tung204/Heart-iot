import { createCapturedIo, type CapturedIo } from '../src/io';

export function capture(): CapturedIo {
  return createCapturedIo();
}
