import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MeasurementChart } from './MeasurementChart';

const RANGE = { from: '2026-11-14T00:00:00.000Z', to: '2026-11-14T06:00:00.000Z' };

// F-P2-6 / vùng cuộn biểu đồ phải nhận focus bằng bàn phím và có nhãn hướng dẫn.
describe('MeasurementChart — vùng cuộn focusable', () => {
  it('vùng cuộn có tabindex, role group và nhãn hướng dẫn; SVG vẫn là hình có tên', () => {
    render(
      <MeasurementChart
        points={[
          { measuredAt: '2026-11-14T01:00:00.000Z', heartRateBpm: 72 },
          { measuredAt: '2026-11-14T02:00:00.000Z', heartRateBpm: 78 },
        ]}
        gaps={[]}
        range={RANGE}
      />,
    );

    const region = screen.getByRole('group', {
      name: /Biểu đồ nhịp tim có thể cuộn ngang/,
    });
    expect(region).toHaveClass('measure-chart__scroll');
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toHaveAccessibleName(/Dùng phím mũi tên trái\/phải/);

    expect(screen.getByRole('img', { name: /Biểu đồ nhịp tim/ })).toBeInTheDocument();
    expect(screen.getByText(/Bảng\/danh sách dữ liệu bên dưới liệt kê từng lần đo/)).toBeInTheDocument();
  });
});

// v7 lane H — không có mẫu hợp lệ thì nói rõ bằng chữ, không vẽ điểm giả.
describe('MeasurementChart — không có điểm hợp lệ', () => {
  it('empty state hiển thị câu giải thích và không có polyline/circle', () => {
    const { container } = render(<MeasurementChart points={[]} gaps={[]} range={RANGE} />);

    expect(
      screen.getByText(/Chưa có mẫu nhịp tim hợp lệ trong khoảng này/),
    ).toBeInTheDocument();
    expect(screen.getByText('Chưa có mẫu hợp lệ để vẽ biểu đồ')).toBeInTheDocument();
    expect(container.querySelectorAll('polyline')).toHaveLength(0);
    expect(container.querySelectorAll('polygon')).toHaveLength(0);
    expect(container.querySelectorAll('circle')).toHaveLength(0);
    expect(screen.getByRole('img', { name: /chưa có mẫu hợp lệ để vẽ/ })).toBeInTheDocument();
  });
});
