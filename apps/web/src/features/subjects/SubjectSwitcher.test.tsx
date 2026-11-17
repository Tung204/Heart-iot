import { afterEach, describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  errorEnvelope,
  mockResponse,
  renderApp,
  SUBJECT,
  SUBJECT_STATUS,
  USER,
} from '../../test/utils';
import { setActiveSubjectId } from './selection';

function meOk() {
  return mockResponse({ user: USER });
}

const SECOND_SUBJECT = {
  ...SUBJECT,
  id: '2f3d4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b',
  displayName: 'Ông Bình',
};

const CAREGIVER_SUBJECT = {
  ...SUBJECT,
  role: 'caregiver',
};

/**
 * API tối thiểu để Hôm nay có trạng thái bình thường; danh sách hồ sơ đổi theo test.
 */
function todayHandler(options: { subjects?: () => Response } = {}) {
  return (url: string) => {
    const u = String(url);
    if (u.endsWith('/me')) return meOk();
    if (u.endsWith('/subjects')) {
      return (options.subjects ?? (() => mockResponse({ items: [SUBJECT] })))();
    }
    if (u.endsWith('/status')) return mockResponse(SUBJECT_STATUS);
    if (u.includes('/alerts')) return mockResponse({ items: [], nextCursor: null });
    return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
  };
}

// v7 — dòng ngữ cảnh "Người được theo dõi" do shell render trên H1, thay card
// "Hồ sơ đang xem" full-width. Accessible name cố định, select ≥44px.
describe('Dòng ngữ cảnh hồ sơ (shell)', () => {
  afterEach(() => {
    setActiveSubjectId(null);
  });

  it('một hồ sơ: dòng "Theo dõi: Bà Năm" trên H1, không card/nhãn "Hồ sơ đang xem"/link quản lý', async () => {
    renderApp('/app', todayHandler());

    expect(await screen.findByRole('heading', { level: 1, name: 'Hôm nay' })).toBeInTheDocument();
    const context = await screen.findByRole('group', { name: 'Người được theo dõi' });
    expect(context).toHaveTextContent('Theo dõi:');
    expect(context).toHaveTextContent('Bà Năm');
    expect(screen.queryByText(/Hồ sơ đang xem/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Quản lý và chia sẻ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Danh sách hồ sơ' })).not.toBeInTheDocument();
    // Một hồ sơ thì không có select, và không còn card switcher cũ.
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(document.querySelector('.subject-switcher')).toBeNull();
  });

  it('hồ sơ được chia sẻ: tên kèm vai trò nhỏ "Người thân"', async () => {
    renderApp(
      '/app',
      todayHandler({ subjects: () => mockResponse({ items: [CAREGIVER_SUBJECT] }) }),
    );

    const contextLine = (await screen.findByRole('group', { name: 'Người được theo dõi' })).closest(
      '.subject-context',
    );
    expect(contextLine).not.toBeNull();
    expect(contextLine).toHaveTextContent('Bà Năm');
    expect(contextLine).toHaveTextContent('Người thân');
  });

  it('nhiều hồ sơ: một select nhỏ, chọn xong đổi hồ sơ đang xem dùng chung', async () => {
    renderApp(
      '/app',
      todayHandler({ subjects: () => mockResponse({ items: [SUBJECT, SECOND_SUBJECT] }) }),
    );
    const user = userEvent.setup();

    const select = await screen.findByRole('combobox', { name: 'Người được theo dõi' });
    expect(select).toHaveValue(SUBJECT.id);
    // Tên hồ sơ đang xem không lặp lại thành chữ riêng ngoài select.
    expect(document.querySelector('.subject-context__name')).toBeNull();

    await user.selectOptions(select, SECOND_SUBJECT.id);

    await waitFor(() =>
      expect(window.localStorage.getItem('an:active-subject-id')).toBe(SECOND_SUBJECT.id),
    );
    expect(select).toHaveValue(SECOND_SUBJECT.id);
  });

  it('chưa có hồ sơ → câu ngắn + CTA tạo hồ sơ, không hiện số 0 giả', async () => {
    renderApp('/app', todayHandler({ subjects: () => mockResponse({ items: [] }) }));

    expect(await screen.findByText(/Chưa có hồ sơ nào/)).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: 'Tạo hồ sơ' });
    expect(cta).toHaveAttribute('href', '/app/subjects');
    expect(screen.queryByText(/\b0\b/)).not.toBeInTheDocument();
  });

  it('API /subjects chưa có (404) → câu "chưa kết nối" gọn, không lỗi thô, không thử lại vô ích', async () => {
    renderApp('/app', (url) => {
      const u = String(url);
      if (u.endsWith('/me')) return meOk();
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByText('Chưa kết nối được dữ liệu hồ sơ.')).toBeInTheDocument();
    // Lỗi HTTP thô không xuất hiện.
    expect(screen.queryByText(/404/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('lỗi tải danh sách hồ sơ → câu lỗi ngắn + Thử lại tải lại danh sách', async () => {
    let failFirst = true;
    renderApp(
      '/app',
      todayHandler({
        subjects: () => {
          if (failFirst) {
            failFirst = false;
            return mockResponse(errorEnvelope('Máy chủ đang bận.', 'INTERNAL'), 500);
          }
          return mockResponse({ items: [SUBJECT] });
        },
      }),
    );
    const user = userEvent.setup();

    const contextLine = (await screen.findByText(/Không tải được danh sách hồ sơ/)).closest(
      '.subject-context',
    ) as HTMLElement;
    expect(contextLine).not.toBeNull();
    await user.click(within(contextLine).getByRole('button', { name: 'Thử lại' }));

    expect(await screen.findByText('Bà Năm')).toBeInTheDocument();
  });
});
