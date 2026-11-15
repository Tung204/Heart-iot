import { Card } from '../../components/Card';
import { ButtonLink } from '../../components/Button';
import { toTelHref } from './phone';
import { useEmergencyContacts } from './useEmergencyContacts';
import './contacts.css';

interface EmergencyContactCardProps {
  subjectId: string;
  /** Chủ hồ sơ thấy gợi ý thêm liên hệ khi danh sách trống. */
  isOwner: boolean;
  /** Gọi API hay không — trang cảnh báo tắt khi người xem thiếu quyền nhận cảnh báo. */
  enabled?: boolean;
}

/**
 * Card "Liên hệ khẩn cấp" trên chi tiết cảnh báo:
 * - Chỉ hiển thị khi tải được danh sách; lỗi tải không chặn nội dung cảnh báo.
 * - Liên hệ chính + nút gọi `tel:`; các liên hệ khác thu gọn trong `<details>`.
 * - Không có nút sửa/xóa: người thân chỉ đọc.
 */
export function EmergencyContactCard({
  subjectId,
  isOwner,
  enabled = true,
}: EmergencyContactCardProps) {
  const contacts = useEmergencyContacts(subjectId, { enabled });

  // Lỗi/đang tải: im lặng để không làm nhiễu phần cảnh báo đang hiển thị.
  if (!enabled || contacts.isPending || contacts.isError) return null;

  const items = contacts.data.items;
  if (items.length === 0) {
    return (
      <Card title="Liên hệ khẩn cấp" className="ec-card">
        {isOwner ? (
          <>
            <p className="field__hint">
              Chưa có liên hệ khẩn cấp. Thêm ngay để người thân có thể gọi khi nhận cảnh báo.
            </p>
            <ButtonLink
              to={`/app/subjects/${subjectId}/share`}
              variant="secondary"
              size="sm"
            >
              Thêm liên hệ khẩn cấp
            </ButtonLink>
          </>
        ) : (
          <p className="field__hint">Chủ hồ sơ chưa thêm liên hệ khẩn cấp.</p>
        )}
      </Card>
    );
  }

  const primary = items.find((item) => item.isPrimary) ?? items[0];
  if (!primary) return null;
  const others = items.filter((item) => item.id !== primary.id);

  return (
    <Card title="Liên hệ khẩn cấp" className="ec-card">
      <div className="ec-card__primary">
        <div className="ec-card__primary-main">
          <p className="ec-card__label">Liên hệ chính</p>
          <p className="ec-card__name">{primary.name}</p>
          <p className="ec-list__meta">
            {primary.relationship} · {primary.phone}
          </p>
        </div>
        <a
          className="button button--primary button--md ec-call"
          href={toTelHref(primary.phone)}
          aria-label={`Gọi ${primary.name}`}
        >
          Gọi
        </a>
      </div>

      {others.length > 0 ? (
        <details className="ec-more">
          <summary>Liên hệ khác ({others.length})</summary>
          <ul className="ec-list">
            {others.map((contact) => (
              <li key={contact.id} className="ec-list__item">
                <div className="ec-list__main">
                  <p className="ec-list__name">{contact.name}</p>
                  <p className="ec-list__meta">{contact.relationship}</p>
                </div>
                <a
                  className="ec-phone"
                  href={toTelHref(contact.phone)}
                  aria-label={`Gọi ${contact.name}`}
                >
                  {contact.phone}
                </a>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <p className="field__hint">
        Bấm Gọi để mở ứng dụng điện thoại. Ứng dụng không tự gọi cấp cứu.
      </p>
    </Card>
  );
}
