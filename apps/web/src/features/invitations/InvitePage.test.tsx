import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SESSION,
  SUBJECT,
  USER,
  errorEnvelope,
  me401Response,
  mockResponse,
  renderApp,
} from '../../test/utils';

const TOKEN = 'token-hop-le-day-du-ky-tu-abc';
const INVITATION = {
  subjectName: SUBJECT.displayName,
  inviterName: 'Ngọc',
  permissions: {
    ...SUBJECT.permissions,
    canViewMeasurements: true,
  },
  expiresAt: '2026-11-20T09:00:00.000Z',
  status: 'pending',
};

const CARE_LINK = {
  id: '4f5d6a7b-8c9d-4e0f-9a1b-2c3d4e5f6a7b',
  subjectId: SUBJECT.id,
  caregiver: USER,
  permissions: INVITATION.permissions,
  status: 'active',
  sharedFrom: '2026-11-17T09:00:00.000Z',
  acceptedAt: '2026-11-17T09:00:00.000Z',
  revokedAt: null,
};

// FR-05 — xem/chấp nhận lời mời: phân loại đúng lỗi link, không lộ email/token,
// hiển thị quyền theo đúng contract, giữ ngữ cảnh khi accept bị từ chối.
describe('InvitePage', () => {
  it('đang kiểm tra: giữ H1 và trạng thái tải, chưa hiện CTA', () => {
    renderApp(`/invite/${TOKEN}`, (url) => {
      if (String(url).endsWith('/me')) return me401Response();
      return new Promise<Response>(() => {
        // Preview chưa trả về.
      });
    });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Lời mời theo dõi' }),
    ).toBeInTheDocument();
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveTextContent('Đang kiểm tra lời mời…');
    expect(screen.queryByRole('button', { name: 'Đồng ý tham gia' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Đăng nhập để tiếp tục' })).toBeNull();
  });

  it('token sai định dạng (422) là lỗi dữ liệu: nêu link không hợp lệ, không mời thử lại', async () => {
    renderApp('/invite/abc1234567', (url) => {
      if (String(url).endsWith('/me')) return me401Response();
      return mockResponse(
        errorEnvelope(
          'token: chuỗi phải có ít nhất 20 ký tự',
          'VALIDATION_FAILED',
        ),
        422,
      );
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lời mời không hợp lệ' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/không đúng định dạng|thiếu ký tự/i)).toBeInTheDocument();
    expect(screen.queryByText('Không kiểm tra được lời mời')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/');
  });

  it('lời mời hết hạn/không tồn tại (404): nêu đã hết hạn hoặc đã dùng, có đường về', async () => {
    renderApp('/invite/token-khong-hop-le', (url) => {
      if (String(url).endsWith('/me')) return me401Response();
      return mockResponse(errorEnvelope('Không tìm thấy lời mời.', 'NOT_FOUND'), 404);
    });

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Lời mời không hợp lệ' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Lời mời này không tồn tại, đã hết hạn hoặc đã được dùng. Hãy kiểm tra lại link hoặc nhờ người mời gửi lời mời mới.',
      ),
    ).toBeInTheDocument();
    const home = screen.getByRole('link', { name: 'Về trang chủ' });
    expect(home).toHaveAttribute('href', '/');
    expect(home).toHaveClass('button');
    expect(screen.getByRole('link', { name: 'Theo dõi sức khỏe' })).toHaveAttribute('href', '/');
    expect(screen.queryByText(/An Nhiên/)).toBeNull();
    expect(screen.getAllByText('Dữ liệu mô phỏng · không thay thế cấp cứu.')).toHaveLength(1);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
  });

  it('lỗi 5xx khi tải lời mời: có Thử lại và tải lại được lời mời hợp lệ', async () => {
    let calls = 0;
    renderApp(`/invite/${TOKEN}`, (url) => {
      const u = String(url);
      if (u.endsWith('/me')) return me401Response();
      calls += 1;
      return calls === 1
        ? mockResponse(errorEnvelope('Máy chủ đang gặp lỗi.', 'INTERNAL'), 500)
        : mockResponse(INVITATION);
    });
    const user = userEvent.setup();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Không kiểm tra được lời mời' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Dữ liệu mô phỏng · không thay thế cấp cứu.')).toHaveLength(1);

    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    // H1 giống nhau ở trạng thái tải và hợp lệ, nên chờ dữ liệu thật của lời mời.
    const intro = await screen.findByText(/mời bạn theo dõi/);
    expect(intro).toHaveTextContent('Ngọc');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Lời mời theo dõi' }),
    ).toBeInTheDocument();
    expect(intro).toHaveTextContent('Bà Năm');
  });

  it('lời mời hợp lệ: nêu người mời, người được theo dõi, vai trò và quyền đúng contract', async () => {
    renderApp(`/invite/${TOKEN}`, (url) => {
      if (String(url).endsWith('/me')) return me401Response();
      return mockResponse(INVITATION);
    });

    const intro = await screen.findByText(/mời bạn theo dõi/);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Lời mời theo dõi' }),
    ).toBeInTheDocument();
    expect(intro).toHaveTextContent('Ngọc');
    expect(intro).toHaveTextContent('Bà Năm');
    expect(intro).toHaveTextContent('vai trò Người thân');
    expect(screen.getByText('Xem số đo, tối đa 30 ngày')).toBeInTheDocument();
    expect(screen.getByText('Nhận cảnh báo')).toBeInTheDocument();
    expect(screen.getByText('Xác nhận hỗ trợ')).toBeInTheDocument();
    expect(screen.getByText('Có thể đóng cảnh báo')).toBeInTheDocument();
    expect(screen.getByText('Không xem câu trả lời từ trợ lý AI')).toBeInTheDocument();
    expect(screen.getByText('Hết hạn')).toBeInTheDocument();

    // Khách: một CTA đăng nhập giữ next về đúng lời mời; đăng ký cũng giữ next.
    const login = screen.getByRole('link', { name: 'Đăng nhập để tiếp tục' });
    expect(login).toHaveClass('button');
    expect(login).toHaveAttribute('href', `/login?next=${encodeURIComponent(`/invite/${TOKEN}`)}`);
    expect(screen.getByRole('link', { name: 'Tạo tài khoản mới' })).toHaveAttribute(
      'href',
      `/register?next=${encodeURIComponent(`/invite/${TOKEN}`)}`,
    );

    // Không lộ email người nhận hay token thô trong nội dung hiển thị.
    expect(document.body.textContent).not.toContain(TOKEN);
    expect(document.body.textContent).not.toContain('@');
    expect(screen.queryByText(/không xem AI/i)).toBeNull();
    expect(screen.getAllByText('Dữ liệu mô phỏng · không thay thế cấp cứu.')).toHaveLength(1);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
  });

  it('không chia sẻ số đo: nói rõ không được xem số đo và lịch sử, không khẳng định 30 ngày', async () => {
    renderApp(`/invite/${TOKEN}`, (url) => {
      if (String(url).endsWith('/me')) return me401Response();
      return mockResponse({
        ...INVITATION,
        permissions: { ...INVITATION.permissions, canViewMeasurements: false },
      });
    });

    expect(await screen.findByText('Không được xem số đo và lịch sử')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Lời mời theo dõi' }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Xem số đo, tối đa/)).toBeNull();
    // Các quyền nhận cảnh báo không bị suy ra từ quyền số đo.
    expect(screen.getByText('Nhận cảnh báo')).toBeInTheDocument();
  });

  it('đã đăng nhập: preview GET trước, bấm Đồng ý mới POST accept và mở ứng dụng', async () => {
    const calls: string[] = [];
    renderApp(`/invite/${TOKEN}`, (url, init) => {
      const u = String(url);
      if (u.endsWith('/me')) return mockResponse({ user: SESSION.user });
      if (u.endsWith(`/invitations/${TOKEN}/accept`)) {
        calls.push(init?.method === 'POST' ? 'POST accept' : 'POST accept wrong method');
        return mockResponse(CARE_LINK);
      }
      if (u.endsWith(`/invitations/${TOKEN}`)) {
        calls.push('GET preview');
        return mockResponse(INVITATION);
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    const acceptButton = await screen.findByRole('button', { name: 'Đồng ý tham gia' });
    expect(calls).toEqual(['GET preview']);
    await user.click(acceptButton);

    expect(await screen.findByText('Đã tham gia')).toBeInTheDocument();
    expect(calls).toEqual(['GET preview', 'POST accept']);
    expect(screen.getByRole('link', { name: 'Mở ứng dụng' })).toHaveAttribute('href', '/app');
    expect(screen.queryByRole('button', { name: 'Đồng ý tham gia' })).toBeNull();
  });

  it('accept bị từ chối: giữ ngữ cảnh lời mời và giải thích đúng thông báo của máy chủ', async () => {
    renderApp(`/invite/${TOKEN}`, (url) => {
      const u = String(url);
      if (u.endsWith('/me')) return mockResponse({ user: SESSION.user });
      if (u.endsWith(`/invitations/${TOKEN}/accept`)) {
        return mockResponse(
          errorEnvelope('Tài khoản đăng nhập không khớp với email được mời.', 'FORBIDDEN'),
          403,
        );
      }
      return mockResponse(INVITATION);
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Đồng ý tham gia' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Tài khoản đăng nhập không khớp với email được mời.');
    // Ngữ cảnh vẫn còn để người dùng hiểu mình đang ở lời mời nào.
    const intro = screen.getByText(/mời bạn theo dõi/);
    expect(intro).toHaveTextContent('Bà Năm');
    expect(intro).toHaveTextContent('Ngọc');
    expect(intro).toHaveTextContent('vai trò Người thân');
    expect(screen.getByText('Xem số đo, tối đa 30 ngày')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đồng ý tham gia' })).toBeInTheDocument();
  });

  it('đổi token thì bỏ lỗi accept của lời mời trước (không dán ngữ cảnh cũ)', async () => {
    const otherToken = 'token-khac-day-du-ky-tu-xyz';
    const { router } = renderApp(`/invite/${TOKEN}`, (url) => {
      const u = String(url);
      if (u.endsWith('/me')) return mockResponse({ user: SESSION.user });
      if (u.endsWith(`/invitations/${TOKEN}/accept`)) {
        return mockResponse(errorEnvelope('Tài khoản không khớp.', 'FORBIDDEN'), 403);
      }
      if (u.endsWith(`/invitations/${otherToken}`)) {
        return mockResponse({ ...INVITATION, subjectName: 'Ông Nguyễn Văn Bình' });
      }
      return mockResponse(INVITATION);
    });
    const user = userEvent.setup();

    await user.click(await screen.findByRole('button', { name: 'Đồng ý tham gia' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tài khoản không khớp.');

    await router.navigate(`/invite/${otherToken}`);
    const subject = await screen.findByText('Ông Nguyễn Văn Bình');
    expect(subject.closest('p')).toHaveTextContent('vai trò Người thân');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Đồng ý tham gia' })).toBeInTheDocument();
  });

  it('không xác định được phiên đăng nhập: báo rõ và cho thử lại', async () => {
    let meCalls = 0;
    renderApp(`/invite/${TOKEN}`, (url) => {
      const u = String(url);
      if (u.endsWith('/me')) {
        meCalls += 1;
        return meCalls === 1
          ? mockResponse(errorEnvelope('Máy chủ đang gặp lỗi.', 'INTERNAL'), 500)
          : mockResponse({ user: SESSION.user });
      }
      return mockResponse(INVITATION);
    });
    const user = userEvent.setup();

    expect(
      await screen.findByText(
        'Không xác định được trạng thái đăng nhập do không kết nối được máy chủ.',
      ),
    ).toBeInTheDocument();
    expect(await screen.findByText(/mời bạn theo dõi/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(
      await screen.findByRole('button', { name: 'Đồng ý tham gia' }),
    ).toBeInTheDocument();
    await waitFor(() => expect(meCalls).toBe(2));
  });
});
