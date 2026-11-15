import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import {
  SESSION,
  errorEnvelope,
  me401Response,
  mockResponse,
  renderApp,
} from '../test/utils';

const HERO_NOTE = 'Dữ liệu mô phỏng · cảnh báo chỉ hiện khi web mở · không tự gọi cấp cứu.';

// FR-01 (phần công khai) — trang giới thiệu tối giản: một màn giới thiệu,
// một section 3 thẻ, một dòng dữ liệu mô phỏng ngay dưới CTA trong màn đầu.
describe('LandingPage', () => {
  it('một màn giới thiệu: h1, đúng một CTA mỗi đích và dòng dữ liệu mô phỏng dưới CTA', async () => {
    renderApp('/', () => me401Response());

    expect(
      screen.getByRole('heading', { level: 1, name: 'Người thân ở nhà, mình vẫn an tâm' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('An Nhiên').length).toBeGreaterThan(0);

    // Mỗi đích đúng một link: header chỉ logo, hero là nơi duy nhất có CTA.
    const registerLinks = await screen.findAllByRole('link', { name: 'Tạo tài khoản' });
    expect(registerLinks).toHaveLength(1);
    const registerLink = registerLinks[0]!;
    expect(registerLink).toHaveAttribute('href', '/register');
    const loginLinks = screen.getAllByRole('link', { name: 'Đăng nhập' });
    expect(loginLinks).toHaveLength(1);
    expect(loginLinks[0]).toHaveAttribute('href', '/login');
    const header = document.querySelector('header.site-header') as HTMLElement | null;
    expect(header).not.toBeNull();
    if (header) {
      expect(within(header).getAllByRole('link')).toHaveLength(1);
      expect(within(header).queryByRole('link', { name: 'Đăng nhập' })).toBeNull();
    }

    // Dòng cảnh báo nằm trong hero, sau CTA chính — không tách khối, không lặp ở footer.
    const note = screen.getByText(HERO_NOTE);
    expect(note.closest('.hero')).not.toBeNull();
    expect(registerLink.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText('Dữ liệu mô phỏng · không thay thế cấp cứu.')).toBeNull();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByText(/bản demo|đồ án|giảng viên|nghiệm thu|chưa được duyệt/i)).toBeNull();
  });

  it('hero giới thiệu trợ lý AI và đúng 3 thẻ một câu', () => {
    renderApp('/', () => me401Response());

    const hero = document.querySelector('.hero') as HTMLElement | null;
    expect(hero).not.toBeNull();
    if (hero) {
      expect(
        within(hero).getByText(/Trợ lý AI trả lời câu hỏi về số liệu của người thân\./),
      ).toBeInTheDocument();
    }

    expect(screen.getByRole('heading', { level: 2, name: 'An Nhiên làm gì' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 3 })).toHaveLength(3);
    expect(screen.getByRole('heading', { level: 3, name: 'Theo dõi' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Báo khi cần' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Hỏi trợ lý' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 3, name: 'Hỏi đáp' })).toBeNull();
    expect(
      screen.getByText('Nhịp tim, vận động và kết nối thiết bị của người thân.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Cảnh báo do hệ thống tạo, không phụ thuộc trợ lý.')).toBeInTheDocument();
    expect(screen.getByText('Hỏi trợ lý AI về số liệu của người thân.')).toBeInTheDocument();

    // Các khối copy dài của bản cũ đã bỏ hẳn.
    expect(screen.queryByRole('heading', { name: 'Vì sao An Nhiên?' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Cách hoạt động' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Trợ lý ở trung tâm' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Ranh giới an toàn' })).toBeNull();
  });

  it('đã đăng nhập thì chỉ có đúng một CTA mở ứng dụng', async () => {
    renderApp('/', () => mockResponse({ user: SESSION.user }));

    const openAppLinks = await screen.findAllByRole('link', { name: 'Mở ứng dụng' });
    expect(openAppLinks).toHaveLength(1);
    expect(openAppLinks[0]).toHaveAttribute('href', '/app');
    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Tạo tài khoản' })).toBeNull();
      expect(screen.queryByRole('link', { name: 'Đăng nhập' })).toBeNull();
    });
  });

  it('đang kiểm tra phiên thì không hiện CTA khách', async () => {
    let resolveMe!: (response: Response) => void;
    const mePending = new Promise<Response>((resolve) => {
      resolveMe = resolve;
    });
    renderApp('/', (url) => (String(url).endsWith('/me') ? mePending : mockResponse({})));

    expect(screen.queryByRole('link', { name: 'Tạo tài khoản' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Đăng nhập' })).toBeNull();

    resolveMe(me401Response());
    expect(await screen.findByRole('link', { name: 'Tạo tài khoản' })).toBeInTheDocument();
  });

  it('lỗi máy chủ khi kiểm phiên: báo ngắn và không giả làm khách', async () => {
    renderApp('/', () =>
      mockResponse(errorEnvelope('Máy chủ đang gặp lỗi.', 'INTERNAL'), 500),
    );

    expect(
      await screen.findByText(/Không kiểm tra được phiên đăng nhập/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login');
    expect(screen.queryByRole('link', { name: 'Tạo tài khoản' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Mở ứng dụng' })).toBeNull();
  });
});
