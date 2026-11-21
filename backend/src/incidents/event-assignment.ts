import type { AssignmentRow } from '../database/schema';

/**
 * Lý do cách ly một sự kiện incident (docs/03, docs/04, docs/08 T-03).
 *
 * - `missing_measured_at`: thiết bị chưa đồng bộ giờ (`clock_status=unsynced`,
 *   `measured_at=null`). Không có mốc thời gian thì không được mặc định gán cho
 *   chủ đang mở hồ sơ.
 * - `clock_skew_future`: `measured_at` vượt hiện tại quá `MAX_CLOCK_SKEW_SECONDS`.
 * - `before_first_assignment`: sự kiện xảy ra trước assignment đầu tiên.
 * - `outside_assignment`: sự kiện rơi vào khoảng thiết bị chưa được gán.
 * - `assignment_mismatch`: incident đã lưu thuộc hồ sơ khác với assignment mà
 *   thời điểm đo chỉ ra; không cho sự kiện mới ghi chéo chủ.
 */
export type EventQuarantineReason =
  | 'missing_measured_at'
  | 'clock_skew_future'
  | 'before_first_assignment'
  | 'outside_assignment'
  | 'assignment_mismatch';

export type EventAssignmentResolution =
  | { kind: 'assigned'; assignment: AssignmentRow }
  | { kind: 'quarantined'; reason: EventQuarantineReason };

/**
 * Chọn assignment cho sự kiện incident theo `measured_at` (docs/03: "dữ liệu
 * được gán bằng lịch sử assignment tại thời điểm xảy ra; không chắc thời gian
 * thì cách ly"), không dùng assignment đang mở làm mặc định.
 *
 * Khác telemetry: sự kiện không có `measured_at` bị cách ly thay vì gán vào
 * assignment đang mở, vì incident là cảnh báo sức khỏe và gán sai chủ nguy
 * hiểm hơn việc yêu cầu thiết bị gửi lại khi đã đồng bộ giờ.
 *
 * `assignments` phải sắp xếp tăng dần theo `startedAt` (caller đã order).
 * Khoảng assignment là nửa mở `[startedAt, endedAt)`; không nới dung sai ở
 * biên vì mốc đo sát biên chuyển chủ chưa đủ chắc chắn — cách ly an toàn hơn.
 * Dung sai `clockSkewMs` chỉ áp cho hướng tương lai.
 */
export function resolveAssignmentForEventTime(input: {
  assignments: AssignmentRow[];
  measuredAt: Date | null;
  receivedAt: Date;
  clockSkewMs: number;
}): EventAssignmentResolution {
  const { assignments, measuredAt, receivedAt, clockSkewMs } = input;
  if (measuredAt === null) {
    return { kind: 'quarantined', reason: 'missing_measured_at' };
  }
  if (measuredAt.getTime() > receivedAt.getTime() + clockSkewMs) {
    return { kind: 'quarantined', reason: 'clock_skew_future' };
  }

  const time = measuredAt.getTime();
  const covered = assignments.find(
    (assignment) =>
      time >= assignment.startedAt.getTime() &&
      (assignment.endedAt === null || time < assignment.endedAt.getTime()),
  );
  if (covered) return { kind: 'assigned', assignment: covered };

  const first = assignments[0];
  if (!first || time < first.startedAt.getTime()) {
    return { kind: 'quarantined', reason: 'before_first_assignment' };
  }
  return { kind: 'quarantined', reason: 'outside_assignment' };
}
