import { afterEach, describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ASSISTANT_DISCLAIMER } from '@annhien/contracts/assistant';
import { AssistantPage } from './AssistantPage';
import { errorEnvelope, INCIDENT, mockResponse, renderPage, SUBJECT_STATUS } from '../../test/utils';
import { setActiveSubjectId } from '../subjects/selection';

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

const DEGRADED_SUMMARY = {
  subjectId: OWNER_SUBJECT.id,
  periodStart: '2026-11-07T00:00:00.000Z',
  periodEnd: '2026-11-14T00:00:00.000Z',
  generatedAt: '2026-11-14T10:00:00.000Z',
  status: 'degraded',
  provider: 'template',
  model: null,
  headline: 'Dữ liệu theo dõi 2026-11-07–2026-11-14: 120 mẫu đo, nhịp tim trung bình 75 bpm.',
  sections: [
    {
      kind: 'measurements',
      title: 'Số đo',
      body: 'Có 120 mẫu đo. Nhịp tim hợp lệ: 118 mẫu, trung bình 75 bpm.',
      facts: [
        { label: 'Trung bình', value: 75, unit: 'bpm' },
        { label: 'Thấp nhất', value: 62, unit: 'bpm' },
      ],
    },
  ],
  disclaimer: ASSISTANT_DISCLAIMER,
  sources: [{ type: 'measurements', label: 'Telemetry 7 ngày', at: '2026-11-14T09:00:00.000Z' }],
  dataQuality: {
    coveragePercent: 16.7,
    observedCount: 120,
    expectedCount: 720,
    gaps: { count: 3, reasons: ['no_data'] },
    lastSeenAt: '2026-11-14T09:00:00.000Z',
    synthetic: false,
    limitations: ['Độ phủ dữ liệu thấp (16.7%): số liệu chỉ từ 120/720 mẫu kỳ vọng.'],
  },
  degradedReason: 'Chưa cấu hình AI (AI_BASE_URL trống) nên dùng mẫu tóm tắt xác định từ số liệu đo.',
};

const READY_ANSWER = {
  answer: 'Trong 24 giờ qua, nhịp tim của Bà Năm dao động từ 62 đến 88 bpm, trung bình 75 bpm.\nKhông có cảnh báo mới.',
  status: 'ready',
  provider: 'openai-compatible',
  model: 'demo-model',
  disclaimer: ASSISTANT_DISCLAIMER,
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

const SECOND_SUBJECT = {
  ...OWNER_SUBJECT,
  id: '3f4d5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b',
  displayName: 'Ông Bình',
};

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

// Wave 4 — trợ lý: badge mẫu, disclaimer, form hỏi đáp, 429, chặn khi không có quyền.
describe('AssistantPage', () => {
  afterEach(() => {
    setActiveSubjectId(null);
  });


  it('summary degraded/template → badge "Tóm tắt theo mẫu" + degradedReason + disclaimer', async () => {
    renderPage(<AssistantPage />, (url) => {
      const u = url;
      if (u.endsWith('/subjects')) return mockResponse({ items: [OWNER_SUBJECT] });
      if (u.includes('/assistant/summary')) return mockResponse(DEGRADED_SUMMARY);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByText('Tóm tắt theo mẫu')).toBeInTheDocument();
    expect(
      screen.getByText(/Chưa cấu hình AI \(AI_BASE_URL trống\) nên dùng mẫu tóm tắt xác định/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(ASSISTANT_DISCLAIMER).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/120 mẫu đo/).length).toBeGreaterThan(0);
    expect(screen.getByText('Trung bình')).toBeInTheDocument();
    expect(screen.getAllByText('75 bpm').length).toBeGreaterThan(0);
    expect(screen.getByText('Nguồn số liệu')).toBeInTheDocument();
    // Không có nút "chẩn đoán" nào.
    expect(screen.queryByRole('button', { name: /chẩn đoán/i })).not.toBeInTheDocument();
  });

  it('hiển thị khối "Chất lượng dữ liệu": độ phủ, mẫu, khoảng thiếu, nguồn mô phỏng, disclaimer', async () => {
    const lowQualitySummary = {
      ...DEGRADED_SUMMARY,
      dataQuality: {
        coveragePercent: 0.8,
        observedCount: 2,
        expectedCount: 240,
        gaps: { count: 3, reasons: ['no_data', 'clock_unsynced'] },
        lastSeenAt: '2026-11-14T09:00:00.000Z',
        synthetic: true,
        limitations: [
          'Độ phủ dữ liệu thấp (0.8%): số liệu chỉ từ 2/240 mẫu kỳ vọng.',
          'Nguồn dữ liệu là mô phỏng, không phải số đo thật của người dùng.',
        ],
      },
    };
    renderPage(<AssistantPage />, (url) => {
      const u = url;
      if (u.endsWith('/subjects')) return mockResponse({ items: [OWNER_SUBJECT] });
      if (u.includes('/assistant/summary')) return mockResponse(lowQualitySummary);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByText('Chất lượng dữ liệu')).toBeInTheDocument();
    expect(screen.getByText(/0\.8% · 2\/240 mẫu kỳ vọng/)).toBeInTheDocument();
    expect(screen.getByText(/3 khoảng \(không có dữ liệu, đồng hồ chưa đồng bộ\)/)).toBeInTheDocument();
    expect(screen.getByText('Lần nhận cuối')).toBeInTheDocument();
    expect(screen.getByText('Nguồn dữ liệu')).toBeInTheDocument();
    expect(screen.getAllByText('Dữ liệu mô phỏng').length).toBeGreaterThan(0);
    expect(
      screen.getByText(/Chỉ từ 2 mẫu, độ phủ 0\.8%, 3 khoảng thiếu/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Nguồn dữ liệu là mô phỏng, không phải số đo thật/),
    ).toBeInTheDocument();
    expect(screen.getAllByText(ASSISTANT_DISCLAIMER).length).toBeGreaterThan(0);
  });

  it('form hỏi gửi đúng body; câu trả lời ready hiện badge "AI" + nguồn + disclaimer', async () => {
    const askBodies: unknown[] = [];
    renderPage(<AssistantPage />, (url, init) => {
      const u = url;
      if (u.endsWith('/subjects')) return mockResponse({ items: [OWNER_SUBJECT] });
      if (u.includes('/assistant/summary')) return mockResponse(DEGRADED_SUMMARY);
      if (u.includes('/assistant/ask')) {
        askBodies.push(init?.body ? JSON.parse(String(init.body)) : null);
        return mockResponse(READY_ANSWER);
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await screen.findByText('Tóm tắt theo mẫu');
    await user.type(
      screen.getByLabelText(/^Câu hỏi/),
      'Tuần này nhịp tim của bà thế nào?',
    );
    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));

    await waitFor(() => expect(askBodies).toHaveLength(1));
    expect(askBodies[0]).toEqual({ question: 'Tuần này nhịp tim của bà thế nào?' });
    expect(await screen.findByText('AI')).toBeInTheDocument();
    expect(screen.getByText(/dao động từ 62 đến 88 bpm/)).toBeInTheDocument();
    expect(screen.getAllByText(ASSISTANT_DISCLAIMER).length).toBeGreaterThan(0);
  });

  it('câu hỏi quá ngắn → lỗi field, không gọi API', async () => {
    const askBodies: unknown[] = [];
    renderPage(<AssistantPage />, (url, init) => {
      const u = url;
      if (u.endsWith('/subjects')) return mockResponse({ items: [OWNER_SUBJECT] });
      if (u.includes('/assistant/summary')) return mockResponse(DEGRADED_SUMMARY);
      if (u.includes('/assistant/ask')) {
        askBodies.push(init?.body ? JSON.parse(String(init.body)) : null);
        return mockResponse(READY_ANSWER);
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await screen.findByText('Tóm tắt theo mẫu');
    await user.type(screen.getByLabelText(/^Câu hỏi/), 'ab');
    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));

    expect(await screen.findByText('Câu hỏi quá ngắn (tối thiểu 3 ký tự).')).toBeInTheDocument();
    expect(askBodies).toHaveLength(0);
  });

  it('hai câu hỏi → hai câu trả lời nối tiếp trong cùng hội thoại, không thay thế câu trước', async () => {
    let answerCount = 0;
    renderPage(<AssistantPage />, (url) => {
      const u = url;
      if (u.endsWith('/subjects')) return mockResponse({ items: [OWNER_SUBJECT] });
      if (u.includes('/assistant/summary')) return mockResponse(DEGRADED_SUMMARY);
      if (u.includes('/assistant/ask')) {
        answerCount += 1;
        return mockResponse({ ...READY_ANSWER, answer: `Câu trả lời số ${answerCount}.` });
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await screen.findByText('Tóm tắt theo mẫu');
    await user.type(screen.getByLabelText(/^Câu hỏi/), 'Nhịp tim hôm nay thế nào?');
    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));
    expect(await screen.findByText('Câu trả lời số 1.')).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Câu hỏi/), 'Pin thiết bị còn bao nhiêu?');
    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));
    expect(await screen.findByText('Câu trả lời số 2.')).toBeInTheDocument();

    // Cả hai lượt vẫn còn trong hội thoại — trợ lý không thay thế câu trả lời cũ.
    expect(screen.getByText('Câu trả lời số 1.')).toBeInTheDocument();
    expect(screen.getByText('Nhịp tim hôm nay thế nào?')).toBeInTheDocument();
    expect(screen.getByText('Pin thiết bị còn bao nhiêu?')).toBeInTheDocument();
    expect(screen.getAllByText('Bạn').length).toBe(2);
  });

  it('cột bối cảnh: cảnh báo đang mở, lần nhận cuối và liên kết tới các màn hình', async () => {
    renderPage(<AssistantPage />, (url) => {
      const u = url;
      if (u.endsWith('/subjects')) return mockResponse({ items: [OWNER_SUBJECT] });
      if (u.includes('/assistant/summary')) return mockResponse(DEGRADED_SUMMARY);
      if (u.includes('/alerts')) return mockResponse({ items: [INCIDENT], nextCursor: null });
      if (u.endsWith('/status')) return mockResponse(SUBJECT_STATUS);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByRole('heading', { name: 'Bối cảnh' })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Cảnh báo đang mở' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('1 cảnh báo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem tất cả cảnh báo' })).toHaveAttribute(
      'href',
      '/app/alerts',
    );
    expect(screen.getByRole('heading', { name: 'Lần nhận dữ liệu cuối' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Lịch sử đo' })).toHaveAttribute(
      'href',
      '/app/history',
    );
    expect(screen.getByRole('link', { name: 'Thiết bị' })).toHaveAttribute(
      'href',
      '/app/devices',
    );
    expect(
      screen.getByText(/Trợ lý không tự xác nhận hay đóng cảnh báo/),
    ).toBeInTheDocument();
  });

  it('thiếu quyền xem số đo → bối cảnh không hiện thời điểm nhận dữ liệu', async () => {
    const noMeasurements = {
      ...OWNER_SUBJECT,
      permissions: { ...OWNER_SUBJECT.permissions, canViewMeasurements: false },
    };
    renderPage(<AssistantPage />, (url) => {
      const u = url;
      if (u.endsWith('/subjects')) return mockResponse({ items: [noMeasurements] });
      if (u.includes('/assistant/summary')) return mockResponse(DEGRADED_SUMMARY);
      if (u.includes('/alerts')) return mockResponse({ items: [], nextCursor: null });
      if (u.endsWith('/status')) return mockResponse(SUBJECT_STATUS);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(
      await screen.findByText(/Chủ hồ sơ không chia sẻ số đo và thời điểm nhận dữ liệu/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Đang kiểm tra kết nối/)).not.toBeInTheDocument();
  });

  it('đổi hồ sơ → hội thoại cũ biến mất, không hiện câu trả lời của hồ sơ trước', async () => {
    renderPage(<SwitchHarness />, (url) => {
      const u = url;
      if (u.endsWith('/subjects')) return mockResponse({ items: [OWNER_SUBJECT, SECOND_SUBJECT] });
      if (u.includes('/assistant/summary')) {
        if (u.includes(SECOND_SUBJECT.id)) {
          return mockResponse({
            ...DEGRADED_SUMMARY,
            subjectId: SECOND_SUBJECT.id,
            headline:
              'Dữ liệu theo dõi 2026-11-07–2026-11-14: Bản tin của Ông Bình, 80 mẫu đo.',
          });
        }
        return mockResponse(DEGRADED_SUMMARY);
      }
      if (u.includes('/assistant/ask')) {
        return mockResponse({ ...READY_ANSWER, answer: 'Câu trả lời của hồ sơ đầu tiên.' });
      }
      if (u.includes('/alerts')) return mockResponse({ items: [], nextCursor: null });
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await screen.findByText('Tóm tắt theo mẫu');
    await user.type(screen.getByLabelText(/^Câu hỏi/), 'Nhịp tim hôm nay thế nào?');
    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));
    expect(await screen.findByText('Câu trả lời của hồ sơ đầu tiên.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Đổi hồ sơ' }));

    expect(await screen.findByText(/Bản tin của Ông Bình/)).toBeInTheDocument();
    expect(screen.queryByText('Câu trả lời của hồ sơ đầu tiên.')).not.toBeInTheDocument();
    expect(screen.queryByText('Nhịp tim hôm nay thế nào?')).not.toBeInTheDocument();
    expect((screen.getByLabelText(/^Câu hỏi/) as HTMLTextAreaElement).value).toBe('');
    expect(screen.getAllByText('Ông Bình').length).toBeGreaterThan(0);
  });

  it('phản hồi về muộn của hồ sơ cũ không append vào hồ sơ mới', async () => {
    let resolveAsk: ((response: Response) => void) | null = null;
    renderPage(<SwitchHarness />, (url) => {
      const u = url;
      if (u.endsWith('/subjects')) return mockResponse({ items: [OWNER_SUBJECT, SECOND_SUBJECT] });
      if (u.includes('/assistant/summary')) {
        if (u.includes(SECOND_SUBJECT.id)) {
          return mockResponse({
            ...DEGRADED_SUMMARY,
            subjectId: SECOND_SUBJECT.id,
            headline:
              'Dữ liệu theo dõi 2026-11-07–2026-11-14: Bản tin của Ông Bình, 80 mẫu đo.',
          });
        }
        return mockResponse(DEGRADED_SUMMARY);
      }
      if (u.includes('/assistant/ask')) {
        return new Promise<Response>((resolve) => {
          resolveAsk = resolve;
        });
      }
      if (u.includes('/alerts')) return mockResponse({ items: [], nextCursor: null });
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await screen.findByText('Tóm tắt theo mẫu');
    await user.type(screen.getByLabelText(/^Câu hỏi/), 'Pin thiết bị còn bao nhiêu?');
    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));
    await waitFor(() => expect(document.querySelector('.assistant-msg--pending')).not.toBeNull());

    await user.click(screen.getByRole('button', { name: 'Đổi hồ sơ' }));
    expect(await screen.findByText(/Bản tin của Ông Bình/)).toBeInTheDocument();
    // Không còn loading/câu hỏi của hồ sơ cũ trong lúc chờ phản hồi.
    expect(document.querySelector('.assistant-msg--pending')).toBeNull();
    expect(screen.queryByText('Pin thiết bị còn bao nhiêu?')).not.toBeInTheDocument();

    await act(async () => {
      resolveAsk?.(
        mockResponse({ ...READY_ANSWER, answer: 'Câu trả lời cũ không được hiện.' }),
      );
      await Promise.resolve();
    });

    expect(screen.queryByText('Câu trả lời cũ không được hiện.')).not.toBeInTheDocument();
  });

  it('429 RATE_LIMITED → thông báo giới hạn tần suất', async () => {
    renderPage(<AssistantPage />, (url, init) => {
      const u = url;
      if (u.endsWith('/subjects')) return mockResponse({ items: [OWNER_SUBJECT] });
      if (u.includes('/assistant/summary')) return mockResponse(DEGRADED_SUMMARY);
      if (u.includes('/assistant/ask')) {
        return mockResponse(
          errorEnvelope('Bạn đã gửi quá nhiều câu hỏi, vui lòng thử lại sau.', 'RATE_LIMITED'),
          429,
        );
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await screen.findByText('Tóm tắt theo mẫu');
    await user.type(screen.getByLabelText(/^Câu hỏi/), 'Nhịp tim hôm nay thế nào?');
    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));

    expect(await screen.findByText('Đã đạt giới hạn câu hỏi')).toBeInTheDocument();
    expect(
      screen.getByText(/Bạn đã gửi quá nhiều câu hỏi, vui lòng thử lại sau. Vui lòng thử lại sau vài phút./),
    ).toBeInTheDocument();
  });

  it('hồ sơ đang chọn không có canViewAi → thông báo quyền, không gọi API assistant', async () => {
    const assistantCalls: string[] = [];
    renderPage(<AssistantPage />, (url) => {
      const u = url;
      if (u.endsWith('/subjects')) return mockResponse({ items: [CAREGIVER_NO_AI] });
      if (u.includes('/assistant')) {
        assistantCalls.push(u);
        return mockResponse(DEGRADED_SUMMARY);
      }
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByText('Hồ sơ đang chọn chưa bật trợ lý AI')).toBeInTheDocument();
    expect(assistantCalls).toHaveLength(0);
  });

  it('summary 403 (thiếu quyền số đo) → thông báo quyền, không mời thử lại vô ích', async () => {
    renderPage(<AssistantPage />, (url) => {
      const u = url;
      if (u.endsWith('/subjects')) return mockResponse({ items: [OWNER_SUBJECT] });
      if (u.includes('/assistant/summary')) {
        return mockResponse(
          errorEnvelope('Chủ hồ sơ không chia sẻ số đo và lịch sử với bạn.', 'FORBIDDEN'),
          403,
        );
      }
      if (u.includes('/alerts')) return mockResponse({ items: [], nextCursor: null });
      if (u.endsWith('/status')) return mockResponse(SUBJECT_STATUS);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(await screen.findByText('Chủ hồ sơ không chia sẻ số đo')).toBeInTheDocument();
    expect(
      screen.getByText(/không chia sẻ số đo và lịch sử với bạn, nên trợ lý không có dữ liệu/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Làm mới' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi câu hỏi' })).toBeDisabled();
    expect(
      screen.getByText(/Trợ lý cần quyền xem số đo để trả lời/),
    ).toBeInTheDocument();
  });

  it('ask 403 → thông báo quyền, không hướng dẫn "Hãy thử lại"', async () => {
    renderPage(<AssistantPage />, (url) => {
      const u = url;
      if (u.endsWith('/subjects')) return mockResponse({ items: [OWNER_SUBJECT] });
      if (u.includes('/assistant/summary')) return mockResponse(DEGRADED_SUMMARY);
      if (u.includes('/assistant/ask')) {
        return mockResponse(
          errorEnvelope('Chủ hồ sơ không chia sẻ số đo và lịch sử với bạn.', 'FORBIDDEN'),
          403,
        );
      }
      if (u.includes('/alerts')) return mockResponse({ items: [], nextCursor: null });
      if (u.endsWith('/status')) return mockResponse(SUBJECT_STATUS);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });
    const user = userEvent.setup();

    await screen.findByText('Tóm tắt theo mẫu');
    await user.type(screen.getByLabelText(/^Câu hỏi/), 'Nhịp tim hôm nay thế nào?');
    await user.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));

    expect(await screen.findByText('Chủ hồ sơ không chia sẻ số đo')).toBeInTheDocument();
    expect(screen.queryByText(/Hãy thử lại/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gửi câu hỏi' })).toBeDisabled();
  });

  it('cảnh báo 403 → "Bạn không có quyền xem cảnh báo", không có nút tải lại', async () => {
    renderPage(<AssistantPage />, (url) => {
      const u = url;
      if (u.endsWith('/subjects')) return mockResponse({ items: [OWNER_SUBJECT] });
      if (u.includes('/assistant/summary')) return mockResponse(DEGRADED_SUMMARY);
      if (u.includes('/alerts')) {
        return mockResponse(
          errorEnvelope('Bạn không có quyền xem cảnh báo.', 'FORBIDDEN'),
          403,
        );
      }
      if (u.endsWith('/status')) return mockResponse(SUBJECT_STATUS);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(
      await screen.findByText(/Bạn không có quyền xem cảnh báo của hồ sơ này/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Chưa tải được số cảnh báo đang mở.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Thử lại' })).not.toBeInTheDocument();
  });

  it('caregiver thiếu canReceiveAlerts → không gọi API cảnh báo, hiện thông báo quyền', async () => {
    const noAlerts = {
      ...OWNER_SUBJECT,
      role: 'caregiver',
      permissions: { ...OWNER_SUBJECT.permissions, canReceiveAlerts: false },
    };
    let alertCalls = 0;
    renderPage(<AssistantPage />, (url) => {
      const u = url;
      if (u.endsWith('/subjects')) return mockResponse({ items: [noAlerts] });
      if (u.includes('/assistant/summary')) return mockResponse(DEGRADED_SUMMARY);
      if (u.includes('/alerts')) {
        alertCalls += 1;
        return mockResponse({ items: [], nextCursor: null });
      }
      if (u.endsWith('/status')) return mockResponse(SUBJECT_STATUS);
      return mockResponse(errorEnvelope('Không tìm thấy.', 'NOT_FOUND'), 404);
    });

    expect(
      await screen.findByText(/Bạn không có quyền xem cảnh báo của hồ sơ này/),
    ).toBeInTheDocument();
    expect(alertCalls).toBe(0);
  });
});
