import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = {
  requestId: string;
  actorUserId?: string;
};

export const requestContextStorage = new AsyncLocalStorage<RequestContext>();

export function currentRequestId(): string | undefined {
  return requestContextStorage.getStore()?.requestId;
}

export function setActorUserId(actorUserId: string): void {
  const store = requestContextStorage.getStore();
  if (store) store.actorUserId = actorUserId;
}

export function currentActorUserId(): string | undefined {
  return requestContextStorage.getStore()?.actorUserId;
}
