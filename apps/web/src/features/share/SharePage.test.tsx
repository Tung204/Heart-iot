import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  errorEnvelope,
  mockResponse,
  renderApp,
  SESSION,
  SUBJECT,
  type FetchHandler,
} from '../../test/utils';

/**
 * P1-2/P2-6 (QA v2): trang chia sẻ phải nói rõ phạm vi dữ liệu và có công tắc
 * riêng cho số đo/lịch sử. Mặc định bật (tương thích hành vi cũ); tắt thì payload
 * gửi `canViewMeasurements:false`, ô “Số ngày lịch sử” bị vô hiệu hóa.
 */

const CAREGIVER = {
  id: '4f5d6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b',
  email: 'chi.hoa@example.test',
  displayName: 'Chị Hoa',
  role: 'user',
  status: 'active',
  createdAt: '2026-11-10T00:00:00.000Z',
};

const CARE_LINK = {
  id: '5f6d7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b',
  subjectId: SUBJECT.id,
  caregiver: CAREGIVER,
  permissions: {
    historyDays: 30,
    canReceiveAlerts: true,
    canAcknowledge: true,
    canResolve: false,
    canViewAi: false,
    canViewMeasurements: false,
  },
  status: 'active',
  sharedFrom: '2026-11-12T00:00:00.000Z',
  acceptedAt: '2026-11-12T00:00:00.000Z',
  revokedAt: null,
};

const SHARE_PATH = `/app/subjects/${SUBJECT.id}/share`;

const CAREGIVER_SUBJECT = {
  ...SUBJECT,
  ownerUserId: '9f8d7a6b-5c4d-4e3f-8a9b-0c1d2e3f4a5b',
  role: 'caregiver',
  permissions: { ...SUBJECT.permissions, canResolve: false, canViewAi: false },
};

/** Mở form mời: form không tự bật để không đẩy lời mời đã gửi xuống dưới. */
async function openInviteForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Mời người thân' }));
  await screen.findByLabelText(/Email người được mời/);
}

function shareHandler(onCreate: (body: unknown) => void): FetchHandler {
  return (url, init) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    if (u.endsWith('/me')) return mockResponse(SESSION);
    if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
    if (u.includes('/emergency-contacts')) return mockResponse({ items: [] });
    if (u.includes('/care-links')) return mockResponse({ items: [CARE_LINK] });
    if (u.includes('/invitations') && method === 'POST') {
      const body = JSON.parse(String(init?.body)) as {
        email: string;
        permissions: Record<string, unknown>;
      };
      onCreate(body);
      return mockResponse(
        {
          invitation: {
            id: '6f7d8a9b-0c1d-4e2f-9a3b-4c5d6e7f8a9b',
            subjectId: SUBJECT.id,
            email: body.email,
            permissions: body.permissions,
            status: 'pending',
            createdAt: '2026-11-15T00:00:00.000Z',
            expiresAt: '2026-11-18T00:00:00.000Z',
            acceptedAt: null,
            revokedAt: null,
          },
          token: 'x'.repeat(40),
          acceptUrl: `http://localhost:5173/invite/${'x'.repeat(40)}`,
        },
        201,
      );
    }
    if (u.includes('/invitations')) return mockResponse({ items: [] });
    return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
  };
}

describe('SharePage — quyền xem số đo tách khỏi quyền nhận cảnh báo', () => {
  it('mặc định bật; tắt thì vô hiệu hóa số ngày lịch sử và gửi canViewMeasurements:false', async () => {
    const bodies: unknown[] = [];
    const user = userEvent.setup();
    renderApp(SHARE_PATH, shareHandler((body) => bodies.push(body)));

    await openInviteForm(user);
    const measureCheckbox = await screen.findByRole(
      'checkbox',
      { name: 'Cho phép xem số đo và lịch sử' },
      { timeout: 5000 },
    );
    expect(measureCheckbox).toBeChecked();
    // Hint nói rõ phạm vi dữ liệu, gồm CSV — không chỉ email/hạn lời mời.
    expect(
      screen.getByText(/Gồm nhịp tim, số bước chân, lịch sử đo và tệp CSV/),
    ).toBeInTheDocument();

    const historyDays = screen.getByLabelText('Số ngày lịch sử được xem') as HTMLInputElement;
    expect(historyDays).toBeEnabled();

    await user.click(measureCheckbox);
    expect(measureCheckbox).not.toBeChecked();
    expect(historyDays).toBeDisabled();
    expect(
      screen.getByText('Không áp dụng vì bạn không chia sẻ số đo và lịch sử.'),
    ).toBeInTheDocument();
    // Tóm tắt AI đọc dữ liệu đo → không cho bật khi quyền số đo đang tắt.
    expect(screen.getByRole('checkbox', { name: /Xem tóm tắt AI/ })).toBeDisabled();

    await user.type(screen.getByLabelText(/Email người được mời/), 'chi.hoa@example.test');
    await user.click(screen.getByRole('button', { name: 'Tạo lời mời' }));

    await waitFor(() => expect(bodies).toHaveLength(1), { timeout: 5000 });
    expect(bodies[0]).toMatchObject({
      email: 'chi.hoa@example.test',
      permissions: { canViewMeasurements: false, canViewAi: false },
    });
    expect(
      await screen.findByText('Đã tạo lời mời', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it('danh sách người nhận hiển thị quyền số đo hiện tại', async () => {
    renderApp(SHARE_PATH, shareHandler(() => undefined));

    const meta = await screen.findAllByText(/không xem số đo/, {}, { timeout: 5000 });
    expect(meta.length).toBeGreaterThan(0);
    // Không báo “xem 30 ngày lịch sử” khi quyền số đo đang tắt.
    expect(screen.queryByText(/xem số đo 30 ngày/)).not.toBeInTheDocument();
  });

  it('người thân (không phải owner) không gọi API invitations/care-links', async () => {
    const calls: string[] = [];
    const handler: FetchHandler = (url, init) => {
      const u = String(url);
      calls.push(`${init?.method ?? 'GET'} ${u}`);
      if (u.endsWith('/me')) return mockResponse(SESSION);
      if (u.endsWith('/subjects')) return mockResponse({ items: [CAREGIVER_SUBJECT] });
      if (u.includes('/emergency-contacts')) return mockResponse({ items: [] });
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    };
    renderApp(`/app/subjects/${CAREGIVER_SUBJECT.id}/share`, handler);

    expect(
      await screen.findByText('Chỉ chủ hồ sơ quản lý chia sẻ', {}, { timeout: 5000 }),
    ).toBeInTheDocument();
    await waitFor(() => expect(calls.some((call) => call.endsWith('/subjects'))).toBe(true));
    expect(calls.filter((call) => call.includes('/invitations'))).toHaveLength(0);
    expect(calls.filter((call) => call.includes('/care-links'))).toHaveLength(0);
    expect(calls.filter((call) => call.includes('/emergency-contacts'))).toHaveLength(0);
  });

  it('token lời mời chỉ hiện một lần: ẩn là mất khỏi DOM, không xem lại được', async () => {
    const user = userEvent.setup();
    renderApp(SHARE_PATH, shareHandler(() => undefined));

    await openInviteForm(user);
    await user.type(screen.getByLabelText(/Email người được mời/), 'chi.hoa@example.test');
    await user.click(screen.getByRole('button', { name: 'Tạo lời mời' }));

    const token = 'x'.repeat(40);
    await waitFor(() =>
      expect(document.querySelector('.share-created__url')?.textContent ?? '').toContain(token),
    );
    expect(
      screen.getByText(/Đường dẫn và mã chỉ hiển thị đúng một lần này/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ẩn đường dẫn và mã' }));
    expect(document.querySelector('.share-created__url')).toBeNull();
    expect(screen.queryByText('Đã tạo lời mời')).not.toBeInTheDocument();
  });
});
