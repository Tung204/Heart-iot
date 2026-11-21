import {
  claimDeviceSchema,
  claimResultSchema,
  releaseResultSchema,
  type ClaimDeviceInput,
  type ClaimResult,
  type ReleaseResult,
} from '@heart-iot/contracts/devices';
import { subjectDevicesResponseSchema, type SubjectDevicesResponse } from '@heart-iot/contracts/measurements';
import { apiRequest, parseResponse } from '../../lib/api';

/** GET /subjects/:id/devices — thiết bị đang gắn với hồ sơ kèm trạng thái. */
export async function fetchSubjectDevices(
  subjectId: string,
  signal?: AbortSignal,
): Promise<SubjectDevicesResponse> {
  const data = await apiRequest<unknown>(`/subjects/${subjectId}/devices`, { signal });
  return parseResponse(subjectDevicesResponseSchema, data);
}

/** POST /subjects/:id/devices/claim — gắn thiết bị bằng mã dùng một lần. */
export async function claimDevice(
  subjectId: string,
  input: ClaimDeviceInput,
): Promise<ClaimResult> {
  const data = await apiRequest<unknown>(`/subjects/${subjectId}/devices/claim`, {
    method: 'POST',
    body: input,
  });
  return parseResponse(claimResultSchema, data);
}

/** POST /devices/:id/release — tháo gắn thiết bị khỏi hồ sơ. */
export async function releaseDevice(
  deviceId: string,
  input?: { reason?: string },
): Promise<ReleaseResult> {
  const data = await apiRequest<unknown>(`/devices/${deviceId}/release`, {
    method: 'POST',
    body: input ?? {},
  });
  return parseResponse(releaseResultSchema, data);
}

export { claimDeviceSchema };
