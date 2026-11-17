import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SESSION,
  errorEnvelope,
  me401Response,
  mockResponse,
  renderApp,
} from '../test/utils';

const HERO_NOTE =
  'Dữ liệu mô phỏng · cảnh báo chỉ hiện khi web đang kết nối · không tự gọi cấp cứu · không thay thế cấp cứu.';
const SESSION_UNKNOWN = 'Không kiểm tra được phiên đăng nhập.';

// FR-01 (phần công khai) — landing v7: một H1, một câu giá trị, CTA rõ, sơ đồ
// chữ và ba hàng thông tin ngắn; không hero nhịp tim/ba thẻ tính năng.
describe('LandingPage', () => {
  it('khách: một H1, một câu giá trị, CTA đúng đích và dòng giới hạn sau CTA', async () => {
    renderApp('/', () => me401Response());

    expect(
      screen.getByRole('heading', { level: 1, name: 'Theo dõi sức khỏe người thân' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Xem dữ liệu thiết bị, xử lý cảnh báo và hỏi trợ lý AI.'),
    ).toBeInTheDocument();

    const registerLinks = await screen.findAllByRole('link', { name: 'Tạo tài khoản' });
    expect(registerLinks).toHaveLength(1);
    const registerLink = registerLinks[0]!;
    expect(registerLink).toHaveAttribute('href', '/register');
    const loginLinks = screen.getAllByRole('link', { name: 'Đăng nhập' });
    expect(loginLinks).toHaveLength(1);
    expect(loginLinks[0]).toHaveAttribute('href', '/login');

    // Header chỉ logo, hero là nơi duy nhất có CTA.
    const header = document.querySelector('header.site-header') as HTMLElement | null;
    expect(header).not.toBeNull();
    if (header) {
      expect(within(header).getAllByRole('link')).toHaveLength(1);
      expect(within(header).getByRole('link', { name: 'Theo dõi sức khỏe' })).toHaveAttribute(
        'href',
        '/',
      );
    }

    // Dòng giới hạn nằm trong hero, sau CTA chính, đủ bốn ý và không bị rút gọn.
    const note = screen.getByText(HERO_NOTE);
    expect(note.closest('.landing-hero')).not.toBeNull();
    expect(
      registerLink.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(note).toHaveTextContent('Dữ liệu mô phỏng');
    expect(note).toHaveTextContent('cảnh báo chỉ hiện khi web đang kết nối');
    expect(note).toHaveTextContent('không tự gọi cấp cứu');
    expect(note).toHaveTextContent('không thay thế cấp cứu');

    // Sơ đồ chữ thay cho ảnh/hero nhịp tim.
    expect(document.querySelector('figure.landing-map')).not.toBeNull();
    expect(screen.getByText('Dữ liệu từ thiết bị tới người hỗ trợ và trợ lý AI.')).toBeInTheDocument();
    expect(screen.getByText('Người hỗ trợ · Trợ lý AI')).toBeInTheDocument();

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.queryByText(/An Nhiên/)).toBeNull();
    expect(screen.queryByText(/bản demo|đồ án|giảng viên|nghiệm thu|chưa được duyệt/i)).toBeNull();
    // Không hứa năng lực y tế/AI chưa có.
    expect(document.body.textContent).not.toMatch(/chẩn đoán|điều trị|tự gọi cấp cứu thay bạn/i);
  });

  it('ba hàng thông tin ngắn thay cho khối ba thẻ tính năng', () => {
    renderApp('/', () => me401Response());

    expect(
      screen.getByRole('heading', { level: 2, name: 'Theo dõi, cảnh báo và hỏi đáp' }),
    ).toBeInTheDocument();
    const rows = document.querySelectorAll('.landing-row');
    expect(rows).toHaveLength(3);
    expect(document.querySelector('.capability')).toBeNull();
    expect(document.querySelectorAll('.card')).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 3, name: 'Theo dõi' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Cảnh báo' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Trợ lý AI' })).toBeInTheDocument();
    expect(screen.getByText('Nhịp tim, vận động và kết nối thiết bị của người thân.')).toBeInTheDocument();
    expect(screen.getByText('Cảnh báo do hệ thống tạo, không phụ thuộc trợ lý.')).toBeInTheDocument();
    expect(screen.getByText('Hỏi trợ lý AI về số liệu của người thân.')).toBeInTheDocument();

    // Copy dài/khối lặp của bản cũ đã bỏ hẳn.
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

  it('đang kiểm tra phiên: chỉ báo tải có aria-busy, không nhấp nháy CTA khách', async () => {
    let resolveMe!: (response: Response) => void;
    const mePending = new Promise<Response>((resolve) => {
      resolveMe = resolve;
    });
    renderApp('/', (url) => (String(url).endsWith('/me') ? mePending : mockResponse({})));

    const loading = screen.getByRole('status');
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(loading).toHaveTextContent('Đang kiểm tra phiên đăng nhập…');
    expect(screen.queryByRole('link', { name: 'Tạo tài khoản' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Đăng nhập' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Thử lại/ })).toBeNull();
    expect(document.querySelector('.landing-hero__actions')?.querySelectorAll('a')).toHaveLength(0);

    resolveMe(me401Response());
    expect(await screen.findByRole('link', { name: 'Tạo tài khoản' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('Đang kiểm tra phiên đăng nhập…')).toBeNull();
    });
  });

  it('lỗi máy chủ khi kiểm phiên: báo rõ, giữ cả đăng nhập và đăng ký, có thử lại', async () => {
    let calls = 0;
    renderApp('/', () => {
      calls += 1;
      return calls === 1
        ? mockResponse(errorEnvelope('Máy chủ đang gặp lỗi.', 'INTERNAL'), 500)
        : me401Response();
    });

    const message = await screen.findByText(SESSION_UNKNOWN);
    const session = message.closest('.landing-session') as HTMLElement | null;
    expect(session).not.toBeNull();
    if (!session) return;

    // Không giả làm khách: CTA khách nằm trong khối lỗi, không nằm trong hàng CTA.
    expect(document.querySelector('.landing-hero__actions')?.querySelectorAll('a')).toHaveLength(0);
    expect(
      within(session)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['Đăng nhập', '/login'],
      ['Tạo tài khoản', '/register'],
    ]);
    expect(within(session).getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Mở ứng dụng' })).toBeNull();

    // Thử lại → máy chủ trả 401 → chuyển về đúng trạng thái khách.
    const user = userEvent.setup();
    await user.click(within(session).getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => {
      expect(screen.queryByText(SESSION_UNKNOWN)).toBeNull();
    });
    expect(screen.getAllByRole('link', { name: 'Tạo tài khoản' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Đăng nhập' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Thử lại/ })).toBeNull();
  });
});
