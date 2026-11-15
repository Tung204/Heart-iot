import { afterEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssistantPage } from './AssistantPage';
import { setActiveSubjectId } from '../subjects/selection';
import { formatDateTime, formatTime } from '../../lib/format';
import { ASSISTANT_DISCLAIMER } from '@annhien/contracts/assistant';
import {
  errorEnvelope,
  INCIDENT,
  mockResponse,
  renderPage,
  SUBJECT_STATUS,
  type FetchHandler,
} from '../../test/utils';

const OWNER_SUBJECT = {
  id: '1f2d3a4b-5c6d-4e7f-8a9b-0c1d2e3f4a5b',
  ownerUserId: '0f1d2a3b-4c5d-4e6f-8a9b-0c1d2e3f4a5b',
  displayName: 'Bà Năm',
  timezone: 'Asia/Ho_Chi_Minh',
  role: 'owner',
  permissions: {
    historyDays: 30,
    canReceiveAlerts: true,
    canAcknowledge: true,
    canResolve: true,
    canViewAi: true,
  },
  sharedFrom: null,
  createdAt: '2026-11-01T00:00:00.000Z',
};

const CAREGIVER_NO_AI = {
  ...OWNER_SUBJECT,
  id: '2f3d4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b',
  role: 'caregiver',
  permissions: { ...OWNER_SUBJECT.permissions, canViewAi: false },
};

const SECOND_SUBJECT = {
  ...OWNER_SUBJECT,
  id: '3f4d5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b',
  displayName: 'Ông Bình',
};

const READY_ANSWER = {
  answer: 'Trong 24 giờ qua, nhịp tim của Bà Năm dao động từ 62 đến 88 bpm, trung bình 75 bpm.',
  status: 'ready',
  provider: 'openai-compatible',
  model: 'demo-model',
  disclaimer: 'Thông tin tổng hợp từ dữ liệu thiết bị, không phải chẩn đoán y khoa.',
  sources: [{ type: 'measurements', label: 'Telemetry 24h', at: '2026-11-14T09:00:00.000Z' }],
  dataQuality: {
    coveragePercent: 16.7,
    observedCount: 120,
    expectedCount: 720,
    gaps: { count: 3, reasons: ['no_data'] },
    lastSeenAt: '2026-11-14T09:00:00.000Z',
    synthetic: false,
    limitations: [],
  },
};

const LAST_SEEN_TEXT = formatDateTime(SUBJECT_STATUS.devices[0]!.lastSeenAt);

const NO_ALERTS = { items: [], nextCursor: null };

const CONTACT = {
  id: '4f5d6a7b-8c9d-4e0f-8a1b-2c3d4e5f6a7b',
  subjectId: OWNER_SUBJECT.id,
  name: 'Trần Thị An',
  relationship: 'Con gái',
  phone: '0900000000',
  isPrimary: true,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

type Calls = { assistant: string[]; alerts: string[]; status: string[] };

/** Harness nhỏ mô phỏng SubjectSwitcher: đổi hồ sơ không đổi pathname. */
function SwitchHarness() {
  return (
    <>
      <button type="button" onClick={() => setActiveSubjectId(SECOND_SUBJECT.id)}>
        Đổi hồ sơ
      </button>
      <AssistantPage />
    </>
  );
}

/**
 * API tối thiểu cho màn Hôm nay. Mặc định: có dữ liệu thiết bị, không cảnh báo mở.
 * `calls` chỉ ghi nhận, không thay đổi phản hồi.
 */
function todayHandler(options: {
  subjects?: unknown[];
  status?: () => Response | Promise<Response>;
  alerts?: () => Response | Promise<Response>;
  contacts?: () => Response | Promise<Response>;
  ask?: (init?: RequestInit) => Response | Promise<Response>;
  calls?: Calls;
} = {}): FetchHandler {
  const calls = options.calls;
  return (url, init) => {
    const u = String(url);
    if (u.endsWith('/subjects')) {
      return mockResponse({ items: options.subjects ?? [OWNER_SUBJECT] });
    }
    if (u.endsWith('/status')) {
      calls?.status.push(u);
      return (options.status ?? (() => mockResponse(SUBJECT_STATUS)))();
    }
    if (u.includes('/alerts')) {
      calls?.alerts.push(u);
      return (options.alerts ?? (() => mockResponse(NO_ALERTS)))();
    }
    if (u.includes('/emergency-contacts')) {
      return (options.contacts ?? (() => mockResponse({ items: [] })))();
    }
    if (u.includes('/assistant/ask')) {
      calls?.assistant.push(u);
      return (options.ask ?? (() => mockResponse(READY_ANSWER)))(init);
    }
    if (u.includes('/assistant/')) {
      calls?.assistant.push(u);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    }
    return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
  };
}

function emptyCalls(): Calls {
  return { assistant: [], alerts: [], status: [] };
}

function statusWithoutData() {
  return {
    ...SUBJECT_STATUS,
    devices: SUBJECT_STATUS.devices.map((device) => ({
      ...device,
      lastSeenAt: null,
      freshness: 'never' as const,
    })),
  };
}

describe('Hôm nay (/app)', () => {
  afterEach(() => {
    setActiveSubjectId(null);
  });

  it('mở app: chỉ Hôm nay + trạng thái + ô hỏi, không gọi tóm tắt, không báo cáo dài', async () => {
    const calls = emptyCalls();
    renderPage(<AssistantPage />, todayHandler({ calls }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Hôm nay' })).toBeInTheDocument();
    expect(screen.getByText('Bà Năm')).toBeInTheDocument();
    expect(await screen.findByText(`Không có cảnh báo mở. Dữ liệu cập nhật ${LAST_SEEN_TEXT}.`)).toBeInTheDocument();

    // Không tự gọi API tóm tắt; tài liệu dài của v3 không còn trên màn đầu.
    expect(calls.assistant).toHaveLength(0);
    expect(screen.queryByText(/Bối cảnh/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Độ phủ/)).not.toBeInTheDocument();
    expect(screen.queryByText(/bản tin/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Chất lượng dữ liệu' })).not.toBeInTheDocument();

    // Ô hỏi + ba gợi ý ngắn; hội thoại chưa xuất hiện trước câu hỏi đầu tiên.
    expect(screen.getByLabelText(/^Câu hỏi/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi câu hỏi' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Nhịp tim?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cảnh báo?' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pin?' })).toBeInTheDocument();
    expect(screen.queryByRole('log')).not.toBeInTheDocument();

    // Nguồn dữ liệu mô phỏng + giới hạn cấp cứu xuất hiện đúng một lần.
    const notes = screen.getAllByText('Dữ liệu mô phỏng · không thay thế cấp cứu.');
    expect(notes).toHaveLength(1);
  });

  it('có cảnh báo mở → nêu loại + giờ phát hiện và giữ link Xem cảnh báo', async () => {
    renderPage(
      <AssistantPage />,
      todayHandler({ alerts: () => mockResponse({ items: [INCIDENT], nextCursor: null }) }),
    );

    expect(
      await screen.findByText(
        `Nghi ngã lúc ${formatTime(INCIDENT.detectedAt)} · 1 cảnh báo đang mở.`,
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem cảnh báo' })).toHaveAttribute(
      'href',
      '/app/alerts',
    );
    expect(screen.queryByText(/Dữ liệu cập nhật/)).not.toBeInTheDocument();
    // Không có liên hệ khẩn cấp thì không bịa nút Gọi.
    expect(screen.queryByRole('link', { name: /^Gọi/ })).not.toBeInTheDocument();
  });

  it('có cảnh báo mở + liên hệ khẩn cấp → nút Gọi dùng đúng số đã lưu', async () => {
    renderPage(
      <AssistantPage />,
      todayHandler({
        alerts: () => mockResponse({ items: [INCIDENT], nextCursor: null }),
        contacts: () => mockResponse({ items: [CONTACT] }),
      }),
    );

    const call = await screen.findByRole('link', { name: 'Gọi Trần Thị An' });
    expect(call).toHaveAttribute('href', 'tel:0900000000');
    expect(screen.getByRole('link', { name: 'Xem cảnh báo' })).toBeInTheDocument();
  });

  it('thiết bị ngoại tuyến → cảnh báo độ tươi, không nói "Không có cảnh báo mở"', async () => {
    const asOf = '2026-11-15T12:15:00.000Z';
    const lastSeenAt = '2026-11-15T08:12:00.000Z';
    renderPage(
      <AssistantPage />,
      todayHandler({
        status: () =>
          mockResponse({
            ...SUBJECT_STATUS,
            asOf,
            devices: [
              {
                ...SUBJECT_STATUS.devices[0],
                online: false,
                freshness: 'offline',
                lastSeenAt,
              },
            ],
          }),
      }),
    );

    expect(
      await screen.findByText(`Thiết bị ngoại tuyến · dữ liệu cuối ${formatTime(lastSeenAt)}`),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Không có cảnh báo mở/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kiểm tra thiết bị' })).toHaveAttribute(
      'href',
      '/app/devices',
    );
  });

  it('freshness=stale (thiết bị vẫn online) → "Chưa có số đo mới" với lastMeasuredAt, không gọi ngoại tuyến', async () => {
    const asOf = '2026-11-15T12:15:00.000Z';
    const lastSeenAt = '2026-11-15T12:14:30.000Z';
    const lastMeasuredAt = '2026-11-15T11:20:00.000Z';
    renderPage(
      <AssistantPage />,
      todayHandler({
        status: () =>
          mockResponse({
            ...SUBJECT_STATUS,
            asOf,
            devices: [
              {
                ...SUBJECT_STATUS.devices[0],
                online: true,
                freshness: 'stale',
                lastSeenAt,
                lastMeasuredAt,
              },
            ],
          }),
      }),
    );

    expect(
      await screen.findByText(
        `Chưa có số đo mới · lần đo cuối ${formatTime(lastMeasuredAt)}`,
      ),
    ).toBeInTheDocument();
    // Heartbeat 12:14 không được dùng làm mốc "dữ liệu cuối" và không được
    // gọi thiết bị đang online là ngoại tuyến.
    expect(screen.queryByText(/Thiết bị ngoại tuyến/)).not.toBeInTheDocument();
    expect(screen.queryByText(formatTime(lastSeenAt))).not.toBeInTheDocument();
  });

  it('nhiều thiết bị: cảnh báo ngoại tuyến dùng mốc của chính thiết bị offline, không lấy mốc thiết bị online', async () => {
    const asOf = '2026-11-15T12:15:00.000Z';
    const offlineSeen = '2026-11-15T10:00:00.000Z';
    const onlineSeen = '2026-11-15T12:14:30.000Z';
    renderPage(
      <AssistantPage />,
      todayHandler({
        status: () =>
          mockResponse({
            ...SUBJECT_STATUS,
            asOf,
            devices: [
              {
                ...SUBJECT_STATUS.devices[0],
                deviceId: '3f4d5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7c',
                online: false,
                freshness: 'offline',
                lastSeenAt: offlineSeen,
                lastMeasuredAt: '2026-11-15T09:59:00.000Z',
              },
              {
                ...SUBJECT_STATUS.devices[0],
                online: true,
                freshness: 'live',
                lastSeenAt: onlineSeen,
                lastMeasuredAt: '2026-11-15T12:13:00.000Z',
              },
            ],
          }),
      }),
    );

    expect(
      await screen.findByText(`Thiết bị ngoại tuyến · dữ liệu cuối ${formatTime(offlineSeen)}`),
    ).toBeInTheDocument();
    expect(screen.queryByText(formatTime(onlineSeen))).not.toBeInTheDocument();
  });

  it('không cảnh báo mở → một câu có thời gian cập nhật, không nút cảnh báo', async () => {
    renderPage(<AssistantPage />, todayHandler());

    expect(
      await screen.findByText(`Không có cảnh báo mở. Dữ liệu cập nhật ${LAST_SEEN_TEXT}.`),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Xem cảnh báo' })).not.toBeInTheDocument();
  });

  it('chỉ một liên kết phụ Sức khỏe 7 ngày; lịch sử nằm trong Sức khỏe', async () => {
    renderPage(<AssistantPage />, todayHandler());

    const link = await screen.findByRole('link', { name: 'Sức khỏe 7 ngày →' });
    expect(link).toHaveAttribute('href', '/app/overview');
    expect(screen.queryByRole('link', { name: /Lịch sử đo/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Sức khỏe/ })).toHaveLength(1);
  });

  it('chưa nhận dữ liệu → nói rõ và mở đường kiểm tra thiết bị', async () => {
    renderPage(
      <AssistantPage />,
      todayHandler({ status: () => mockResponse(statusWithoutData()) }),
    );

    expect(await screen.findByText('Chưa nhận dữ liệu từ thiết bị.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Kiểm tra thiết bị' })).toHaveAttribute(
      'href',
      '/app/devices',
    );
  });

  it('403 số đo → trạng thái quyền, không phải lỗi tải, không gọi status, không có Thử lại', async () => {
    const calls = emptyCalls();
    const noMeasurements = {
      ...OWNER_SUBJECT,
      permissions: { ...OWNER_SUBJECT.permissions, canViewMeasurements: false },
    };
    renderPage(<AssistantPage />, todayHandler({ subjects: [noMeasurements], calls }));

    expect(
      await screen.findByText('Bạn chưa được xem số đo của hồ sơ này.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
    expect(calls.status).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Gửi câu hỏi' })).toBeDisabled();
    expect(screen.getByText('Trợ lý cần quyền xem số đo để trả lời.')).toBeInTheDocument();
  });

  it('API trạng thái lỗi → trạng thái lỗi ngắn, không bịa số/thời gian', async () => {
    renderPage(
      <AssistantPage />,
      todayHandler({
        status: () => mockResponse(errorEnvelope('Máy chủ đang bận.', 'INTERNAL'), 500),
      }),
    );

    expect(await screen.findByText('Chưa tải được tình trạng.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.queryByText(/Dữ liệu cập nhật/)).not.toBeInTheDocument();
  });

  it('cảnh báo 403 → câu quyền ngắn, không mời thử lại vô ích', async () => {
    renderPage(
      <AssistantPage />,
      todayHandler({
        alerts: () =>
          mockResponse(errorEnvelope('Bạn không có quyền xem cảnh báo.', 'FORBIDDEN'), 403),
      }),
    );

    expect(
      await screen.findByText('Bạn không có quyền xem cảnh báo của hồ sơ này.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('caregiver thiếu canReceiveAlerts → nói rõ thiếu quyền, không gọi API cảnh báo', async () => {
    const calls = emptyCalls();
    const noAlerts = {
      ...OWNER_SUBJECT,
      role: 'caregiver',
      permissions: { ...OWNER_SUBJECT.permissions, canReceiveAlerts: false },
    };
    renderPage(<AssistantPage />, todayHandler({ subjects: [noAlerts], calls }));

    expect(
      await screen.findByText('Bạn không có quyền xem cảnh báo của hồ sơ này.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Không có cảnh báo mở/)).not.toBeInTheDocument();
    expect(calls.alerts).toHaveLength(0);
  });

  it('gửi câu hỏi đúng body; câu trả lời hiện badge AI, nguồn; hội thoại chỉ xuất hiện sau khi hỏi', async () => {
    const askBodies: unknown[] = [];
    renderPage(
      <AssistantPage />,
      todayHandler({
        ask: (init) => {
          askBodies.push(init?.body ? JSON.parse(String(init.body)) : null);
          return mockResponse(READY_ANSWER);
        },
      }),
    );
    const user = userEvent.setup();

    await screen.findByText(`Không có cảnh báo mở. Dữ liệu cập nhật ${LAST_SEEN_TEXT}.`);
    expect(screen.queryByRole('log')).not.toBeInTheDocument();

    await user.type(
      screen.getByLabelText(/^Câu hỏi/),
      'Tuần này nhịp tim của bà thế nào?',
    );
    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));

    await waitFor(() => expect(askBodies).toHaveLength(1));
    expect(askBodies[0]).toEqual({ question: 'Tuần này nhịp tim của bà thế nào?' });
    expect(await screen.findByRole('log')).toBeInTheDocument();
    expect(await screen.findByText('AI')).toBeInTheDocument();
    expect(screen.getByText(/dao động từ 62 đến 88 bpm/)).toBeInTheDocument();
    expect(screen.getAllByText(ASSISTANT_DISCLAIMER).length).toBeGreaterThan(0);
    expect(screen.getByText('Nguồn số liệu')).toBeInTheDocument();
    expect(screen.getByText(/Telemetry 24h/)).toBeInTheDocument();
  });

  it('câu trả lời degraded + dữ liệu mô phỏng → badge nguồn, không lặp disclaimer dài', async () => {
    renderPage(
      <AssistantPage />,
      todayHandler({
        ask: () =>
          mockResponse({
            ...READY_ANSWER,
            status: 'degraded',
            provider: 'template',
            model: null,
            dataQuality: { ...READY_ANSWER.dataQuality, synthetic: true },
          }),
      }),
    );
    const user = userEvent.setup();

    await screen.findByText(`Không có cảnh báo mở. Dữ liệu cập nhật ${LAST_SEEN_TEXT}.`);
    await user.type(screen.getByLabelText(/^Câu hỏi/), 'Nhịp tim hôm nay thế nào?');
    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));

    expect(await screen.findByText('Tóm tắt theo mẫu')).toBeInTheDocument();
    expect(screen.getByText('Dữ liệu mô phỏng')).toBeInTheDocument();
    // Chỉ một dòng giới hạn ở cuối trang, không lặp trong từng câu trả lời.
    expect(screen.getAllByText('Dữ liệu mô phỏng · không thay thế cấp cứu.')).toHaveLength(1);
  });

  it('ô hỏi giới hạn đúng 500 ký tự như schema', async () => {
    renderPage(<AssistantPage />, todayHandler());

    expect(await screen.findByLabelText(/^Câu hỏi/)).toHaveAttribute('maxlength', '500');
  });

  it('câu hỏi quá ngắn → lỗi field, không gọi API', async () => {
    const calls = emptyCalls();
    renderPage(<AssistantPage />, todayHandler({ calls }));
    const user = userEvent.setup();

    await screen.findByText(`Không có cảnh báo mở. Dữ liệu cập nhật ${LAST_SEEN_TEXT}.`);
    await user.type(screen.getByLabelText(/^Câu hỏi/), 'ab');
    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));

    expect(await screen.findByText('Câu hỏi quá ngắn (tối thiểu 3 ký tự).')).toBeInTheDocument();
    expect(calls.assistant).toHaveLength(0);
  });

  it('hai câu hỏi → hai câu trả lời nối tiếp, không thay thế câu trước', async () => {
    let answerCount = 0;
    renderPage(
      <AssistantPage />,
      todayHandler({
        ask: () => {
          answerCount += 1;
          return mockResponse({ ...READY_ANSWER, answer: `Câu trả lời số ${answerCount}.` });
        },
      }),
    );
    const user = userEvent.setup();

    await screen.findByText(`Không có cảnh báo mở. Dữ liệu cập nhật ${LAST_SEEN_TEXT}.`);
    await user.type(screen.getByLabelText(/^Câu hỏi/), 'Nhịp tim hôm nay thế nào?');
    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));
    expect(await screen.findByText('Câu trả lời số 1.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Câu hỏi/), 'Pin thiết bị còn bao nhiêu?');
    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));
    expect(await screen.findByText('Câu trả lời số 2.')).toBeInTheDocument();

    expect(screen.getByText('Câu trả lời số 1.')).toBeInTheDocument();
    expect(screen.getByText('Nhịp tim hôm nay thế nào?')).toBeInTheDocument();
    expect(screen.getByText('Pin thiết bị còn bao nhiêu?')).toBeInTheDocument();
    expect(screen.getAllByText('Bạn')).toHaveLength(2);
  });

  it('đổi hồ sơ → hội thoại cũ biến mất, ô hỏi trống', async () => {
    renderPage(
      <SwitchHarness />,
      todayHandler({
        subjects: [OWNER_SUBJECT, SECOND_SUBJECT],
        ask: () => mockResponse({ ...READY_ANSWER, answer: 'Câu trả lời của hồ sơ đầu tiên.' }),
      }),
    );
    const user = userEvent.setup();

    await screen.findByText(`Không có cảnh báo mở. Dữ liệu cập nhật ${LAST_SEEN_TEXT}.`);
    await user.type(screen.getByLabelText(/^Câu hỏi/), 'Nhịp tim hôm nay thế nào?');
    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));
    expect(await screen.findByText('Câu trả lời của hồ sơ đầu tiên.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Đổi hồ sơ' }));

    await waitFor(() =>
      expect(screen.queryByText('Câu trả lời của hồ sơ đầu tiên.')).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('Nhịp tim hôm nay thế nào?')).not.toBeInTheDocument();
    expect((screen.getByLabelText(/^Câu hỏi/) as HTMLTextAreaElement).value).toBe('');
    expect(screen.getAllByText('Ông Bình').length).toBeGreaterThan(0);
  });

  it('phản hồi về muộn của hồ sơ cũ không append vào hồ sơ mới', async () => {
    let resolveAsk: ((response: Response) => void) | null = null;
    renderPage(
      <SwitchHarness />,
      todayHandler({
        subjects: [OWNER_SUBJECT, SECOND_SUBJECT],
        ask: () =>
          new Promise<Response>((resolve) => {
            resolveAsk = resolve;
          }),
      }),
    );
    const user = userEvent.setup();

    await screen.findByText(`Không có cảnh báo mở. Dữ liệu cập nhật ${LAST_SEEN_TEXT}.`);
    await user.type(screen.getByLabelText(/^Câu hỏi/), 'Pin thiết bị còn bao nhiêu?');
    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));
    await waitFor(() => expect(document.querySelector('.assistant-msg--pending')).not.toBeNull());

    await user.click(screen.getByRole('button', { name: 'Đổi hồ sơ' }));
    await waitFor(() =>
      expect(document.querySelector('.assistant-msg--pending')).toBeNull(),
    );
    expect(screen.queryByText('Pin thiết bị còn bao nhiêu?')).not.toBeInTheDocument();

    await act(async () => {
      resolveAsk?.(mockResponse({ ...READY_ANSWER, answer: 'Câu trả lời cũ không được hiện.' }));
      await Promise.resolve();
    });

    expect(screen.queryByText('Câu trả lời cũ không được hiện.')).not.toBeInTheDocument();
  });

  it('429 → thông báo giới hạn tần suất', async () => {
    renderPage(
      <AssistantPage />,
      todayHandler({
        ask: () =>
          mockResponse(
            errorEnvelope('Bạn đã gửi quá nhiều câu hỏi, vui lòng thử lại sau.', 'RATE_LIMITED'),
            429,
          ),
      }),
    );
    const user = userEvent.setup();

    await screen.findByText(`Không có cảnh báo mở. Dữ liệu cập nhật ${LAST_SEEN_TEXT}.`);
    await user.type(screen.getByLabelText(/^Câu hỏi/), 'Nhịp tim hôm nay thế nào?');
    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));

    expect(await screen.findByText('Đã đạt giới hạn câu hỏi')).toBeInTheDocument();
    expect(
      screen.getByText(/Bạn đã gửi quá nhiều câu hỏi, vui lòng thử lại sau./),
    ).toBeInTheDocument();
    expect(screen.getByText(/Vui lòng thử lại sau vài phút./)).toBeInTheDocument();
  });

  it('hồ sơ không bật AI → nói rõ, không gọi API trợ lý', async () => {
    const calls = emptyCalls();
    renderPage(<AssistantPage />, todayHandler({ subjects: [CAREGIVER_NO_AI], calls }));

    expect(
      await screen.findByText('Trợ lý chưa được bật cho hồ sơ này.'),
    ).toBeInTheDocument();
    expect(calls.assistant).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Gửi câu hỏi' })).toBeDisabled();
  });

  it('ask 403 → thông báo quyền, không hướng dẫn "Hãy thử lại", nút gửi bị khóa', async () => {
    renderPage(
      <AssistantPage />,
      todayHandler({
        ask: () =>
          mockResponse(
            errorEnvelope('Chủ hồ sơ không chia sẻ số đo và lịch sử với bạn.', 'FORBIDDEN'),
            403,
          ),
      }),
    );
    const user = userEvent.setup();

    await screen.findByText(`Không có cảnh báo mở. Dữ liệu cập nhật ${LAST_SEEN_TEXT}.`);
    await user.type(screen.getByLabelText(/^Câu hỏi/), 'Nhịp tim hôm nay thế nào?');
    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));

    expect(await screen.findByText('Chủ hồ sơ không chia sẻ số đo')).toBeInTheDocument();
    expect(screen.queryByText(/Hãy thử lại/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi câu hỏi' })).toBeDisabled();
    // Không để lại vùng live rỗng khi chưa có lượt nào.
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });

  it('ask 403 do origin/ghi bị chặn → không báo sai là chủ hồ sơ không chia sẻ số đo', async () => {
    renderPage(
      <AssistantPage />,
      todayHandler({
        ask: () =>
          mockResponse(
            errorEnvelope('Origin không được phép cho thao tác ghi.', 'FORBIDDEN'),
            403,
          ),
      }),
    );
    const user = userEvent.setup();

    await screen.findByText(`Không có cảnh báo mở. Dữ liệu cập nhật ${LAST_SEEN_TEXT}.`);
    await user.type(screen.getByLabelText(/^Câu hỏi/), 'Nhịp tim hôm nay thế nào?');
    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));

    expect(await screen.findByText('Trình duyệt chặn thao tác gửi')).toBeInTheDocument();
    expect(screen.queryByText('Chủ hồ sơ không chia sẻ số đo')).not.toBeInTheDocument();
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });
});
