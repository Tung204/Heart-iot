import { describe, expect, it } from 'vitest';
import { resolveRouteScope } from './routeScope';

describe('routeScope — nhắc chăm sóc và phiếu đi khám', () => {
  it('/app/care sáng mục Người thân và dùng dòng ngữ cảnh hồ sơ đang chọn', () => {
    expect(resolveRouteScope('/app/care')).toEqual({
      section: 'people',
      context: 'selected',
      inbox: false,
      today: false,
    });
    expect(resolveRouteScope('/app/care/')).toEqual({
      section: 'people',
      context: 'selected',
      inbox: false,
      today: false,
    });
  });

  it('/app/history/report sáng mục Sức khỏe, không phải Người thân', () => {
    expect(resolveRouteScope('/app/history/report')).toMatchObject({
      section: 'health',
      context: 'selected',
      today: false,
    });
    // Query from/to không làm đổi section.
    expect(resolveRouteScope('/app/history/report', '?from=2026-11-01&to=2026-11-19')).toMatchObject(
      { section: 'health', context: 'selected' },
    );
  });

  it('các route cũ giữ nguyên phạm vi', () => {
    expect(resolveRouteScope('/app/history')).toMatchObject({ section: 'health' });
    expect(resolveRouteScope('/app/subjects')).toMatchObject({
      section: 'people',
      context: 'collection',
    });
    expect(resolveRouteScope('/app/tasks')).toMatchObject({ section: 'none' });
    expect(resolveRouteScope('/app/alerts', '?view=notifications')).toMatchObject({
      section: 'alerts',
      inbox: true,
      context: 'none',
    });
  });
});
