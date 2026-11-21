import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DevicesPage } from './DevicesPage';
import { errorEnvelope, mockResponse, renderPage, SUBJECT } from '../../test/utils';

const CLAIMED_DEVICE = {
  deviceId: '3f4d5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b',
  subjectId: SUBJECT.id,
  serial: 'SN-001',
  label: 'Vòng tay',
  online: false,
  lastSeenAt: null,
  freshness: 'never',
  lastHeartRateBpm: null,
  lastHeartRateQuality: null,
  lastMeasuredAt: null,
  batteryPercent: null,
  firmwareVersion: null,
  clockStatus: 'unknown',
  healthDataVisible: false,
};

const CAREGIVER_SUBJECT = {
  ...SUBJECT,
  ownerUserId: '9f8d7a6b-5c4d-4e3f-8a9b-0c1d2e3f4a5b',
  role: 'caregiver',
  permissions: { ...SUBJECT.permissions, canViewMeasurements: false, canViewAi: false },
};

// FR-06 / gắn thiết bị — claim code sai hợp đồng bị chặn ở client, mã hợp lệ gọi đúng API.
describe('DevicesPage — claim code', () => {
  it('mã quá ngắn → lỗi field, không gọi API claim', async () => {
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const u = String(input);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.includes(`/subjects/${SUBJECT.id}/devices`)) return mockResponse({ items: [] });
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    vi.stubGlobal('fetch', mock);
    renderPage(<DevicesPage />);
    const user = userEvent.setup();

    await screen.findByText('Chưa gắn thiết bị nào');
    await user.type(screen.getByLabelText(/^Mã gắn thiết bị/), 'ABC');
    await user.click(screen.getByRole('button', { name: 'Gắn thiết bị' }));

    expect(await screen.findByText('Mã gắn thiết bị quá ngắn.')).toBeInTheDocument();
    const claimCalls = mock.mock.calls.filter(([url]) => String(url).endsWith('/claim'));
    expect(claimCalls).toHaveLength(0);
  });

  it('mã hợp lệ → gọi POST claim với body đúng và làm mới danh sách thiết bị', async () => {
    let postBody: unknown = null;
    renderPage(<DevicesPage />, (url, init) => {
      const u = String(url);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.endsWith('/claim')) {
        postBody = init?.body ? (JSON.parse(String(init.body)) as unknown) : null;
        return mockResponse({
          device: {
            id: '3f4d5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b',
            serial: 'SN-001',
            label: 'Vòng tay',
            status: 'active',
            firmwareVersion: null,
            lastSeenAt: null,
            createdAt: '2026-11-14T00:00:00.000Z',
            assignedSubjectId: SUBJECT.id,
          },
          assignmentId: '4f5d6a7b-8c9d-4e0f-9a2b-3c4d5e6f7a8b',
          subjectId: SUBJECT.id,
        });
      }
      if (u.includes(`/subjects/${SUBJECT.id}/devices`)) return mockResponse({ items: [] });
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await screen.findByText('Chưa gắn thiết bị nào');
    await user.type(screen.getByLabelText(/^Mã gắn thiết bị/), 'A3B7K9Q2W');
    await user.click(screen.getByRole('button', { name: 'Gắn thiết bị' }));

    await waitFor(() => expect(postBody).toEqual({ claimCode: 'A3B7K9Q2W' }));
  });

  it('claim thành công: báo “Đã gắn thiết bị”, không hứa thiết bị đã trực tuyến, tải lại danh sách', async () => {
    let devicesCalls = 0;
    renderPage(<DevicesPage />, (url, init) => {
      const u = String(url);
      if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
      if (u.endsWith('/claim')) {
        return mockResponse({
          device: {
            id: CLAIMED_DEVICE.deviceId,
            serial: CLAIMED_DEVICE.serial,
            label: CLAIMED_DEVICE.label,
            status: 'active',
            firmwareVersion: null,
            lastSeenAt: null,
            createdAt: '2026-11-14T00:00:00.000Z',
            assignedSubjectId: SUBJECT.id,
          },
          assignmentId: '4f5d6a7b-8c9d-4e0f-9a2b-3c4d5e6f7a8b',
          subjectId: SUBJECT.id,
        });
      }
      if (u.includes(`/subjects/${SUBJECT.id}/devices`)) {
        devicesCalls += 1;
        return mockResponse({ items: devicesCalls > 1 ? [CLAIMED_DEVICE] : [] });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await screen.findByText('Chưa gắn thiết bị nào');
    await user.type(screen.getByLabelText(/^Mã gắn thiết bị/), 'A3B7K9Q2W');
    await user.click(screen.getByRole('button', { name: 'Gắn thiết bị' }));

    const notice = await screen.findByText(/Đã gắn thiết bị vào hồ sơ/);
    expect(notice).toBeInTheDocument();
    expect(notice.textContent).toMatch(/không có nghĩa thiết bị đang trực tuyến/);
    // Danh sách tải lại: thiết bị mới hiện trạng thái “Chưa từng kết nối”, không “Trực tuyến”.
    expect(await screen.findByText('Chưa từng kết nối')).toBeInTheDocument();
    expect(screen.queryByText('Dữ liệu mới')).not.toBeInTheDocument();
  });
});

describe('DevicesPage — quyền người thân (chỉ đọc) và redaction số đo', () => {
  it('caregiver không thấy form claim/tháo gắn và không gửi request ghi nào', async () => {
    const calls: string[] = [];
    renderPage(<DevicesPage />, (url, init) => {
      const u = String(url);
      calls.push(`${init?.method ?? 'GET'} ${u}`);
      if (u.endsWith('/subjects')) return mockResponse({ items: [CAREGIVER_SUBJECT] });
      if (u.includes(`/subjects/${CAREGIVER_SUBJECT.id}/devices`)) {
        return mockResponse({ items: [CLAIMED_DEVICE] });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByText('Vòng tay')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gắn thiết bị' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tháo gắn/ })).not.toBeInTheDocument();
    expect(screen.getByText(/chỉ đọc metadata và trạng thái kết nối/)).toBeInTheDocument();
    expect(calls.some((call) => call.startsWith('POST') || call.startsWith('DELETE'))).toBe(false);

    // Thiếu quyền xem số đo: không render nhịp tim dù response có trường này.
    expect(screen.queryByText('Nhịp tim gần nhất')).not.toBeInTheDocument();
    expect(screen.getByText('Pin')).toBeInTheDocument();
  });
});
