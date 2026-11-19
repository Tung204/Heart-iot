import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SESSION,
  SUBJECT,
  VISIT_REPORT,
  errorEnvelope,
  mockResponse,
  renderApp,
  type FetchHandler,
} from '../../test/utils';

function reportHandler(reportResponse?: () => Response): FetchHandler {
  return (url) => {
    const u = String(url);
    if (u.endsWith('/me')) return mockResponse(SESSION);
    if (u.endsWith('/subjects')) return mockResponse({ items: [SUBJECT] });
    if (u.includes('/visit-report')) {
      return reportResponse
        ? reportResponse()
        : mockResponse(VISIT_REPORT);
    }
    if (u.endsWith('/alerts')) return mockResponse({ items: [], nextCursor: null });
    if (u.endsWith('/notifications')) return mockResponse({ items: [], unreadCount: 0 });
    return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
  };
}

const REPORT_PATH = '/app/history/report?from=2026-10-21&to=2026-11-19';

describe('VisitReportPage — phiếu đi khám', () => {
  it('render đủ mục, điểm chú ý, nhãn mô phỏng và disclaimer', async () => {
    renderApp(REPORT_PATH, reportHandler());

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Phiếu theo dõi sức khỏe' }),
    ).toBeInTheDocument();
    const sheet = within(await screen.findByRole('article'));

    expect(sheet.getByRole('heading', { level: 2, name: 'Bà Năm' })).toBeInTheDocument();
    expect(sheet.getByText(/21\/10\/2026 – 19\/11\/2026 · 30 ngày/)).toBeInTheDocument();
    expect(sheet.getByText('Dữ liệu mô phỏng')).toBeInTheDocument();

    expect(sheet.getByText('1.681')).toBeInTheDocument();
    expect(sheet.getByText('23,3%')).toBeInTheDocument();
    expect(sheet.getByText('68 bpm')).toBeInTheDocument();
    expect(sheet.getByText('Thấp nhất 59 · cao nhất 77 bpm')).toBeInTheDocument();
    expect(sheet.getByText('5.056')).toBeInTheDocument();
    expect(sheet.getByText('Trung bình 168,5 bước/ngày')).toBeInTheDocument();

    expect(sheet.getByRole('heading', { name: 'Khoảng thiếu dữ liệu' })).toBeInTheDocument();
    expect(sheet.getAllByText(/564 giờ/).length).toBeGreaterThan(0);
    expect(sheet.getByRole('heading', { name: 'Cảnh báo ngã / SOS' })).toBeInTheDocument();
    expect(sheet.getByText(/Mốc gần nhất:/)).toBeInTheDocument();

    expect(sheet.getByRole('heading', { name: 'Điểm chú ý' })).toBeInTheDocument();
    expect(sheet.getByText('Chỉ nêu số liệu, không phải kết luận y khoa.')).toBeInTheDocument();
    expect(sheet.getByText('Sự kiện ngã')).toBeInTheDocument();
    expect(sheet.getByText('Khoảng thiếu dữ liệu dài nhất')).toBeInTheDocument();
    expect(sheet.getByText('Nhịp tim thấp nhất theo ngày')).toBeInTheDocument();
    expect(
      sheet.getByText(/từ 21\/10\/2026 00:00 đến 13\/11\/2026 12:01/),
    ).toBeInTheDocument();
    expect(sheet.queryByText(/2026-\d{2}-\d{2}/)).not.toBeInTheDocument();
    expect(sheet.getByText(VISIT_REPORT.disclaimer)).toBeInTheDocument();
  });

  it('nút In / Lưu PDF gọi window.print', async () => {
    const print = vi.fn();
    vi.stubGlobal('print', print);
    const user = userEvent.setup();
    renderApp(REPORT_PATH, reportHandler());

    await screen.findByRole('heading', { level: 1, name: 'Phiếu theo dõi sức khỏe' });
    await user.click(await screen.findByRole('button', { name: 'In / Lưu PDF' }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('403 hiện thông báo quyền và đường quay lại lịch sử', async () => {
    renderApp(
      REPORT_PATH,
      reportHandler(() =>
        mockResponse(
          errorEnvelope(
            'Chủ hồ sơ không chia sẻ số đo cho tài khoản này.',
            'FORBIDDEN',
          ),
          403,
        ),
      ),
    );

    expect(await screen.findByText('Bạn không có quyền xem phiếu này')).toBeInTheDocument();
    expect(
      screen.getByText('Chủ hồ sơ không chia sẻ số đo cho tài khoản này.'),
    ).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: '← Lịch sử đo' })) {
      expect(link).toHaveAttribute('href', '/app/history');
    }
  });

  it('422 hiện thông báo nghiệp vụ của khoảng ngày và không vẽ phiếu', async () => {
    renderApp(
      REPORT_PATH,
      reportHandler(() =>
        mockResponse(
          errorEnvelope('Khoảng ngày nằm trước mốc chia sẻ quyền.', 'VALIDATION_FAILED'),
          422,
        ),
      ),
    );

    expect(
      await screen.findByText('Không tạo được phiếu cho khoảng ngày này'),
    ).toBeInTheDocument();
    expect(screen.getByText('Khoảng ngày nằm trước mốc chia sẻ quyền.')).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
});
