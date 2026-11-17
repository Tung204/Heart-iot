import { viewConfigSchema, type StudioWidget, type ViewConfig } from '@heart-iot/contracts/studio';
import type { ZodIssue } from 'zod';

/**
 * Form soạn config draft (không kéo-thả, nút lên/xuống).
 * Tách phần thuần để UI và test dễ kiểm: parse options JSON từng widget,
 * validate toàn config bằng viewConfigSchema, trả lỗi gắn đúng widget/trường.
 */

export interface WidgetFieldErrors {
  id?: string;
  type?: string;
  title?: string;
  span?: string;
  options?: string;
}

export interface ConfigFormErrors {
  layout?: string;
  widgets: (WidgetFieldErrors | null)[];
  general: string[];
}

export function emptyConfigFormErrors(): ConfigFormErrors {
  return { widgets: [], general: [] };
}

export interface ConfigFormResult {
  config: ViewConfig | null;
  errors: ConfigFormErrors;
}

const DEFAULT_WIDGET: StudioWidget = {
  id: 'widget-1',
  type: 'metric',
  title: 'Nhịp tim',
  span: 1,
};

/** Config mặc định cho view mới — dùng cho form tạo view ở trang danh sách. */
export function defaultViewConfig(): ViewConfig {
  return { version: 1, layout: 'stack', widgets: [DEFAULT_WIDGET] };
}

/** Id gợi ý cho widget mới — không trùng id đã có. */
export function nextWidgetId(widgets: StudioWidget[]): string {
  const existing = new Set(widgets.map((widget) => widget.id));
  for (let i = widgets.length + 1; i < 1000; i += 1) {
    const candidate = `widget-${i}`;
    if (!existing.has(candidate)) return candidate;
  }
  return `widget-${Date.now()}`;
}

/** Parse options JSON của một widget; trả null khi bỏ trống, lỗi khi JSON sai. */
export function parseWidgetOptions(text: string): { options: Record<string, unknown> | undefined; error: string | null } {
  const trimmed = text.trim();
  if (trimmed === '') return { options: undefined, error: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return { options: undefined, error: 'Options chưa phải JSON hợp lệ.' };
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { options: undefined, error: 'Options phải là một đối tượng JSON, ví dụ {"limit": 5}.' };
  }
  return { options: parsed as Record<string, unknown>, error: null };
}

function issueMessage(issue: ZodIssue, value: unknown): string {
  const code = issue.code as string;
  const str = String(value ?? '');
  if (str.trim() === '' && (code === 'too_small' || code === 'invalid_type' || code === 'invalid_string')) {
    return 'Vui lòng nhập giá trị.';
  }
  if (code === 'too_small') return `Quá ngắn (tối thiểu ${(issue as { minimum?: unknown }).minimum}).`;
  if (code === 'too_big') return `Quá dài (tối đa ${(issue as { maximum?: unknown }).maximum}).`;
  if (code === 'invalid_string') return 'Chưa hợp lệ.';
  if (code === 'custom') return issue.message;
  if (code === 'invalid_value') return 'Giá trị không được hỗ trợ.';
  if (code === 'too_many_items') return 'Giá trị vượt quá số lượng cho phép.';
  return issue.message;
}

function setField(
  errors: ConfigFormErrors,
  index: number,
  field: keyof WidgetFieldErrors,
  message: string,
): void {
  while (errors.widgets.length <= index) errors.widgets.push(null);
  const entry = errors.widgets[index] ?? {};
  entry[field] ??= message;
  errors.widgets[index] = entry;
}

/**
 * Gộp config từ trạng thái form và kiểm hợp đồng.
 * optionsTexts song song với widgets — lỗi JSON gắn tại field options của widget.
 */
export function validateConfigForm(
  layout: 'stack' | 'grid',
  widgets: StudioWidget[],
  optionsTexts: string[],
): ConfigFormResult {
  const errors: ConfigFormErrors = emptyConfigFormErrors();

  const parsedWidgets: StudioWidget[] = widgets.map((widget, index) => {
    const { options, error } = parseWidgetOptions(optionsTexts[index] ?? '');
    if (error) setField(errors, index, 'options', error);
    return { ...widget, options };
  });

  const config: ViewConfig = { version: 1, layout, widgets: parsedWidgets };
  const result = viewConfigSchema.safeParse(config);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.map(String).join('.');
      const widgetMatch = /^widgets\.(\d+)(?:\.(.+))?$/.exec(path);
      if (widgetMatch) {
        const index = Number(widgetMatch[1]);
        const field = widgetMatch[2] as keyof WidgetFieldErrors | undefined;
        if (field === 'id' || field === 'type' || field === 'title' || field === 'span' || field === 'options') {
          setField(errors, index, field, issueMessage(issue, widgets[index]?.[field]));
        } else {
          setField(errors, index, 'id', issue.message);
        }
      } else if (path === 'layout') {
        errors.layout ??= issueMessage(issue, layout);
      } else if (path === 'widgets') {
        errors.general.push(issue.message);
      } else {
        errors.general.push(issue.message);
      }
    }
  }

  const hasFieldErrors =
    Boolean(errors.layout) ||
    errors.widgets.some((entry) => entry !== null && Object.keys(entry).length > 0);
  if (hasFieldErrors) return { config: null, errors };
  return { config: result.success ? result.data : null, errors };
}
