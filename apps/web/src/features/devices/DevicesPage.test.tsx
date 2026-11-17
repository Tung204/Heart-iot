import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DevicesPage } from './DevicesPage';
import { errorEnvelope, mockResponse, renderPage, SUBJECT } from '../../test/utils';

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
});
