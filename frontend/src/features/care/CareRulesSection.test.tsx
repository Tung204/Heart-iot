import { describe, expect, it } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CareRulesSection } from './CareRulesSection';
import {
  CARE_RULE_DIGEST,
  CARE_RULE_INACTIVITY,
  SUBJECT,
  careRulePreview,
  errorEnvelope,
  mockResponse,
  renderPage,
} from '../../test/utils';

function handler(onPut?: (body: unknown) => void) {
  return (url: string, init?: RequestInit) => {
    const u = String(url);
    if (u.includes('/care-rules/')) {
      const kind = u.includes('/inactivity') ? ('inactivity' as const) : ('care_digest' as const);
      const base = kind === 'inactivity' ? CARE_RULE_INACTIVITY : CARE_RULE_DIGEST;
      if (u.endsWith('/previews')) {
        return mockResponse(careRulePreview(kind, kind === 'inactivity' ? '18:00' : '20:00'));
      }
      if (init?.method === 'PUT') {
        const body = JSON.parse(String(init.body)) as { enabled?: boolean };
        onPut?.(body);
        return mockResponse({
          ...base,
          version: 1,
          source: 'database',
          updatedAt: '2026-11-20T11:10:00.000Z',
          config: body,
        });
      }
      return mockResponse(base);
    }
    return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
  };
}

function card(target: string | HTMLElement) {
  const element =
    typeof target === 'string'
      ? (screen.getByRole('heading', { level: 3, name: target }).closest('article') as HTMLElement)
      : target;
  return within(element);
}

describe('CareRulesSection — cấu hình nhắc chủ động', () => {
  it('hiện hai quy tắc mặc định tắt, lưu bật nhắc vận động', async () => {
    const user = userEvent.setup();
    let sent: unknown = null;
    renderPage(<CareRulesSection subjectId={SUBJECT.id} />, handler((body) => { sent = body; }));

    expect(await screen.findByRole('heading', { level: 2, name: 'Nhắc chủ động' })).toBeInTheDocument();
    await screen.findByRole('heading', { level: 3, name: 'Nhắc vận động nhẹ' });
    const inactivity = card('Nhắc vận động nhẹ');
    const digest = card('Bản tin cuối ngày');
    expect(inactivity.getAllByText('Đang tắt')).toHaveLength(1);
    expect(digest.getAllByText('Đang tắt')).toHaveLength(1);
    expect(
      screen.getByText('Chỉ là nhắc nhẹ theo cài đặt của bạn, không phải cảnh báo khẩn. Mặc định tắt; bạn có thể bật và đổi giờ bất cứ lúc nào.'),
    ).toBeInTheDocument();

    await user.click(inactivity.getByRole('checkbox', { name: 'Bật nhắc vận động' }));
    await user.click(inactivity.getByRole('button', { name: 'Lưu cấu hình' }));
    expect(await inactivity.findByText('Đã lưu cấu hình.')).toBeInTheDocument();
    expect(sent).toMatchObject({ enabled: true, windowStart: '09:00', windowEnd: '18:00' });
  });

  it('chặn lưu khi bỏ hết ngày và không gửi PUT', async () => {
    const user = userEvent.setup();
    let calls = 0;
    renderPage(<CareRulesSection subjectId={SUBJECT.id} />, handler(() => { calls += 1; }));
    const inactivity = card(await screen.findByRole('heading', { level: 3, name: 'Nhắc vận động nhẹ' }).then((h) => h.closest('article') as HTMLElement));

    await user.click(inactivity.getByRole('checkbox', { name: 'Bật nhắc vận động' }));
    for (const day of ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']) {
      await user.click(inactivity.getByRole('checkbox', { name: day }));
    }
    expect(inactivity.getByText('Chọn ít nhất một ngày trong tuần.')).toBeInTheDocument();
    expect(inactivity.getByRole('button', { name: 'Lưu cấu hình' })).toBeDisabled();
    expect(calls).toBe(0);
  });

  it('xem trước 7 ngày, không lưu và hiện disclaimer', async () => {
    const user = userEvent.setup();
    let puts = 0;
    renderPage(<CareRulesSection subjectId={SUBJECT.id} />, handler(() => { puts += 1; }));
    const digest = card(await screen.findByRole('heading', { level: 3, name: 'Bản tin cuối ngày' }).then((h) => h.closest('article') as HTMLElement));

    await user.click(digest.getByRole('button', { name: 'Xem trước 7 ngày' }));
    const region = await digest.findByRole('region', { name: 'Lịch kiểm tra 7 ngày tới' });
    expect(within(region).getAllByRole('listitem')).toHaveLength(7);
    expect(within(region).getByText(/không phải dự đoán sức khỏe/)).toBeInTheDocument();
    expect(puts).toBe(0);
  });

  it('lỗi tải quy tắc có nút thử lại', async () => {
    renderPage(<CareRulesSection subjectId={SUBJECT.id} />, () =>
      mockResponse(errorEnvelope('Máy chủ đang bận.', 'INTERNAL'), 500),
    );
    expect(await screen.findByText('Không tải được quy tắc')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Thử lại' })).toHaveLength(2);
  });
});
