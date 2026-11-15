import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { EmergencyContact } from '@annhien/contracts/contacts';
import { EmergencyContactsSection } from './EmergencyContactsSection';
import {
  errorEnvelope,
  mockResponse,
  renderPage,
  stubFetch,
  SUBJECT,
  type FetchHandler,
} from '../../test/utils';

/**
 * Liên hệ khẩn cấp trên trang chia sẻ (FR-09):
 * chủ hồ sơ thêm/sửa/xóa, giới hạn 5, người thân chỉ đọc, `tel:` đúng số.
 */

function contact(overrides: Partial<EmergencyContact> = {}): EmergencyContact {
  return {
    id: crypto.randomUUID(),
    subjectId: SUBJECT.id,
    name: 'Cô Hoa',
    relationship: 'Con gái',
    phone: '0909 123 456',
    isPrimary: true,
    createdAt: '2026-11-14T08:00:00.000Z',
    updatedAt: '2026-11-14T08:00:00.000Z',
    ...overrides,
  };
}

const CONTACTS_URL = `/subjects/${SUBJECT.id}/emergency-contacts`;

/** Handler có trạng thái: giữ danh sách như server thật giữa các lần gọi. */
function statefulHandler(initial: EmergencyContact[]) {
  const state = { items: [...initial] };
  const handler: FetchHandler = (url, init) => {
    const u = String(url);
    const method = init?.method ?? 'GET';
    const path = u.replace(/^.*\/api\/v1/, '');
    if (!path.startsWith(CONTACTS_URL)) {
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    }
    const contactId = path.slice(CONTACTS_URL.length + 1);
    const body = init?.body ? (JSON.parse(String(init.body)) as Partial<EmergencyContact>) : null;

    if (method === 'POST') {
      const created = contact({ ...body, id: crypto.randomUUID(), isPrimary: state.items.length === 0 });
      state.items.push(created);
      return mockResponse(created, 201);
    }
    if (method === 'PATCH') {
      const index = state.items.findIndex((item) => item.id === contactId);
      const current = state.items[index];
      if (!current) return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
      const updated = { ...current, ...body } as EmergencyContact;
      state.items[index] = updated;
      return mockResponse(updated);
    }
    if (method === 'DELETE') {
      state.items = state.items.filter((item) => item.id !== contactId);
      return mockResponse(undefined, 204);
    }
    return mockResponse({ items: state.items });
  };
  return { state, handler };
}

describe('EmergencyContactsSection — chủ hồ sơ quản lý liên hệ khẩn cấp', () => {
  it('hiển thị tên, quan hệ, badge "Chính" và liên kết tel: đúng số', async () => {
    renderPage(
      <EmergencyContactsSection subjectId={SUBJECT.id} />,
      statefulHandler([
        contact({ name: 'Cô Hoa', phone: '0909 123 456' }),
        contact({ id: crypto.randomUUID(), name: 'Chú Bảo', relationship: 'Hàng xóm', phone: '+84 912 345 678', isPrimary: false }),
      ]).handler,
    );

    expect(await screen.findByText('Cô Hoa')).toBeInTheDocument();
    expect(screen.getByText('Chính')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gọi Cô Hoa' })).toHaveAttribute(
      'href',
      'tel:0909123456',
    );
    expect(screen.getByRole('link', { name: 'Gọi Chú Bảo' })).toHaveAttribute(
      'href',
      'tel:+84912345678',
    );
  });

  it('thêm liên hệ: gửi POST đúng dữ liệu và danh sách cập nhật (FR-09)', async () => {
    const { state, handler } = statefulHandler([contact({ name: 'Cô Hoa' })]);
    let posted: unknown = null;
    const wrapped: FetchHandler = (url, init) => {
      if (init?.method === 'POST') posted = JSON.parse(String(init.body)) as unknown;
      return handler(url, init);
    };
    renderPage(<EmergencyContactsSection subjectId={SUBJECT.id} />, wrapped);
    const user = userEvent.setup();

    await screen.findByText('Cô Hoa');
    await user.click(screen.getByRole('button', { name: 'Thêm liên hệ' }));

    await user.type(screen.getByLabelText(/^Tên người liên hệ/), 'Chú Bảo');
    await user.type(screen.getByLabelText(/^Quan hệ với người được theo dõi/), 'Hàng xóm');
    await user.type(screen.getByLabelText(/^Số điện thoại/), '0912 345 678');
    await user.click(screen.getByRole('button', { name: 'Thêm liên hệ' }));

    await waitFor(() =>
      expect(posted).toEqual({
        name: 'Chú Bảo',
        relationship: 'Hàng xóm',
        phone: '0912 345 678',
        isPrimary: false,
      }),
    );
    expect(await screen.findByText('Chú Bảo')).toBeInTheDocument();
    expect(state.items).toHaveLength(2);
    // Form đóng sau khi lưu thành công.
    expect(screen.queryByLabelText(/^Tên người liên hệ/)).not.toBeInTheDocument();
  });

  it('sửa liên hệ: form điền sẵn và gửi PATCH đúng id', async () => {
    const first = contact({ name: 'Cô Hoa' });
    const { handler } = statefulHandler([first]);
    let patchedUrl = '';
    let patchedBody: unknown = null;
    const wrapped: FetchHandler = (url, init) => {
      if (init?.method === 'PATCH') {
        patchedUrl = String(url);
        patchedBody = JSON.parse(String(init.body)) as unknown;
      }
      return handler(url, init);
    };
    renderPage(<EmergencyContactsSection subjectId={SUBJECT.id} />, wrapped);
    const user = userEvent.setup();

    await screen.findByText('Cô Hoa');
    await user.click(screen.getByRole('button', { name: 'Sửa liên hệ Cô Hoa' }));
    const nameInput = screen.getByLabelText(/^Tên người liên hệ/);
    expect(nameInput).toHaveValue('Cô Hoa');

    await user.clear(nameInput);
    await user.type(nameInput, 'Cô Hoa Nguyễn');
    await user.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(patchedUrl).toContain(`/emergency-contacts/${first.id}`));
    expect(patchedBody).toMatchObject({ name: 'Cô Hoa Nguyễn', isPrimary: true });
    expect(await screen.findByText('Cô Hoa Nguyễn')).toBeInTheDocument();
  });

  it('xóa liên hệ cần xác nhận hai bước rồi gọi DELETE', async () => {
    const first = contact({ name: 'Cô Hoa' });
    const second = contact({ id: crypto.randomUUID(), name: 'Chú Bảo', isPrimary: false });
    const { state, handler } = statefulHandler([first, second]);
    let deletedUrl = '';
    const wrapped: FetchHandler = (url, init) => {
      if (init?.method === 'DELETE') deletedUrl = String(url);
      return handler(url, init);
    };
    renderPage(<EmergencyContactsSection subjectId={SUBJECT.id} />, wrapped);
    const user = userEvent.setup();

    await screen.findByText('Cô Hoa');
    await user.click(screen.getByRole('button', { name: 'Xóa liên hệ Cô Hoa' }));
    // Chưa xác nhận thì chưa gọi API.
    expect(deletedUrl).toBe('');
    expect(
      screen.getByRole('group', { name: 'Xác nhận xóa liên hệ Cô Hoa' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Xác nhận xóa' }));
    await waitFor(() => expect(deletedUrl).toContain(`/emergency-contacts/${first.id}`));
    await waitFor(() => expect(state.items).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText('Cô Hoa')).not.toBeInTheDocument());
    expect(screen.getByText('Chú Bảo')).toBeInTheDocument();
  });

  it('đã đủ 5 liên hệ: ẩn nút thêm và hiện thông báo giới hạn', async () => {
    const five = [
      contact({ name: 'Người 1' }),
      contact({ id: crypto.randomUUID(), name: 'Người 2', isPrimary: false }),
      contact({ id: crypto.randomUUID(), name: 'Người 3', isPrimary: false }),
      contact({ id: crypto.randomUUID(), name: 'Người 4', isPrimary: false }),
      contact({ id: crypto.randomUUID(), name: 'Người 5', isPrimary: false }),
    ];
    renderPage(<EmergencyContactsSection subjectId={SUBJECT.id} />, statefulHandler(five).handler);

    await screen.findByText('Người 1');
    expect(screen.queryByRole('button', { name: 'Thêm liên hệ' })).not.toBeInTheDocument();
    expect(screen.getByText('Đã đủ 5 liên hệ')).toBeInTheDocument();
  });

  it('còn chỗ: hiện nút thêm liên hệ', async () => {
    renderPage(
      <EmergencyContactsSection subjectId={SUBJECT.id} />,
      statefulHandler([contact()]).handler,
    );
    await screen.findByText('Cô Hoa');
    expect(screen.getByRole('button', { name: 'Thêm liên hệ' })).toBeInTheDocument();
  });

  it('người thân chỉ đọc: có danh sách và tel: nhưng không có nút quản lý', async () => {
    renderPage(
      <EmergencyContactsSection subjectId={SUBJECT.id} canManage={false} />,
      statefulHandler([contact()]).handler,
    );

    expect(await screen.findByText('Cô Hoa')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gọi Cô Hoa' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thêm liên hệ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Sửa liên hệ/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Xóa liên hệ/ })).not.toBeInTheDocument();
  });

  it('form báo lỗi tại trường và không gọi API khi dữ liệu sai', async () => {
    const fetchMock = stubFetch(statefulHandler([contact()]).handler);
    renderPage(<EmergencyContactsSection subjectId={SUBJECT.id} />);
    const user = userEvent.setup();

    await screen.findByText('Cô Hoa');
    await user.click(screen.getByRole('button', { name: 'Thêm liên hệ' }));
    await user.click(screen.getByRole('button', { name: 'Thêm liên hệ' }));

    expect(await screen.findByText('Vui lòng nhập tên người liên hệ.')).toBeInTheDocument();
    expect(
      screen.getByText('Vui lòng nhập quan hệ với người được theo dõi.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Vui lòng nhập số điện thoại.')).toBeInTheDocument();

    const postCalls = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
    expect(postCalls).toHaveLength(0);

    // Số điện thoại sai ký tự: dùng thông điệp từ hợp đồng chung.
    await user.type(screen.getByLabelText(/^Tên người liên hệ/), 'Chú Bảo');
    await user.type(screen.getByLabelText(/^Quan hệ với người được theo dõi/), 'Hàng xóm');
    await user.type(screen.getByLabelText(/^Số điện thoại/), 'gọi số 0909');
    await user.click(screen.getByRole('button', { name: 'Thêm liên hệ' }));

    expect(
      await screen.findByText('Số điện thoại chỉ gồm số và ký tự + ( ) . -'),
    ).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('lỗi tải danh sách: có thông báo và nút thử lại', async () => {
    renderPage(
      <EmergencyContactsSection subjectId={SUBJECT.id} />,
      () => mockResponse(errorEnvelope('Máy chủ đang bảo trì.', 'INTERNAL'), 500),
    );
    expect(await screen.findByText('Không tải được liên hệ khẩn cấp')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
  });
});
