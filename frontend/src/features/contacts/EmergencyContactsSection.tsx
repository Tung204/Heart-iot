import { useEffect, useRef, useState } from 'react';
import type { FormEvent, KeyboardEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ZodIssue } from 'zod';
import type { EmergencyContact, EmergencyContactInput } from '@heart-iot/contracts/contacts';
import { Alert } from '../../components/Alert';
import { Button } from '../../components/Button';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { TextField } from '../../components/Field';
import { PageLoader } from '../../components/PageLoader';
import { StatusPill } from '../../components/StatusPill';
import { getApiErrorMessage } from '../../lib/api';
import { zodFieldErrorMap, type FieldErrorMap } from '../../lib/validation';
import {
  createEmergencyContact,
  deleteEmergencyContact,
  emergencyContactInputSchema,
  emergencyContactsQueryKey,
  updateEmergencyContact,
} from './api';
import { useEmergencyContacts } from './useEmergencyContacts';
import { MAX_EMERGENCY_CONTACTS, toTelHref } from './phone';
import '../../styles/people.css';
import './contacts.css';

interface EmergencyContactsSectionProps {
  subjectId: string;
  /** `false` = chỉ đọc (phòng thủ; trang chia sẻ hiện chỉ mở cho chủ hồ sơ). */
  canManage?: boolean;
}

const EMPTY_ERRORS: FieldErrorMap = { fields: {}, general: [] };

function emptyForm() {
  return { name: '', relationship: '', phone: '', isPrimary: false };
}

/**
 * Section "Liên hệ khẩn cấp" trên trang chia sẻ của chủ hồ sơ:
 * - Danh sách tên/quan hệ/số điện thoại dạng `tel:` + nhãn "Chính".
 * - Thêm/Sửa qua form (validate bằng hợp đồng chung), Xóa có xác nhận hai bước;
 *   Escape huỷ xác nhận và trả focus về nút xóa của đúng liên hệ.
 * - Tối đa 5 liên hệ; API vẫn là lớp chặn cuối (409).
 */
export function EmergencyContactsSection({
  subjectId,
  canManage = true,
}: EmergencyContactsSectionProps) {
  const queryClient = useQueryClient();
  const contacts = useEmergencyContacts(subjectId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EmergencyContact | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrorMap>(EMPTY_ERRORS);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  /** Focus trả về đúng nút “Xóa” của liên hệ vừa huỷ xác nhận. */
  const deleteTriggerRefs = useRef(new Map<string, HTMLButtonElement | null>());
  /** Liên hệ cần focus lại khi nút “Xóa” được mount lại sau khi huỷ xác nhận. */
  const pendingFocusRef = useRef<string | null>(null);
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  const items = contacts.data?.items ?? [];
  const total = items.length;
  const atLimit = total >= MAX_EMERGENCY_CONTACTS;
  const onlyOne = total <= 1;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: emergencyContactsQueryKey(subjectId) });

  const closeForm = () => {
    setFormOpen(false);
    setEditing(null);
    setForm(emptyForm());
    setFieldErrors(EMPTY_ERRORS);
  };

  // Xác nhận xoá mở ra thì focus vào “Hủy” để Escape dùng được ngay.
  useEffect(() => {
    if (confirmingId) cancelButtonRef.current?.focus();
  }, [confirmingId]);

  const save = useMutation({
    mutationFn: (input: EmergencyContactInput) =>
      editing
        ? updateEmergencyContact(subjectId, editing.id, input)
        : createEmergencyContact(subjectId, input),
    onSuccess: () => {
      closeForm();
      void invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: (contactId: string) => deleteEmergencyContact(subjectId, contactId),
    onSuccess: () => {
      setConfirmingId(null);
      setDeleteError(null);
      void invalidate();
    },
    onError: (error) => setDeleteError(getApiErrorMessage(error)),
  });

  const openCreate = () => {
    save.reset();
    remove.reset();
    setDeleteError(null);
    setEditing(null);
    setForm(emptyForm());
    setFieldErrors(EMPTY_ERRORS);
    setFormOpen(true);
  };

  const openEdit = (contact: EmergencyContact) => {
    save.reset();
    remove.reset();
    setDeleteError(null);
    setConfirmingId(null);
    setEditing(contact);
    setForm({
      name: contact.name,
      relationship: contact.relationship,
      phone: contact.phone,
      isPrimary: contact.isPrimary,
    });
    setFieldErrors(EMPTY_ERRORS);
    setFormOpen(true);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = emergencyContactInputSchema.safeParse(form);
    if (!parsed.success) {
      const nextErrors = zodFieldErrorMap(parsed.error, form, {
        name: (issue: ZodIssue, value: unknown) => {
          if (String(value ?? '').trim() === '') return 'Vui lòng nhập tên người liên hệ.';
          if (issue.code === 'too_small') return `Tên cần ít nhất ${issue.minimum} ký tự.`;
          if (issue.code === 'too_big') return `Tên quá dài (tối đa ${issue.maximum} ký tự).`;
          return issue.message;
        },
        relationship: (issue: ZodIssue, value: unknown) => {
          if (String(value ?? '').trim() === '') {
            return 'Vui lòng nhập quan hệ với người được theo dõi.';
          }
          if (issue.code === 'too_small') return `Quan hệ cần ít nhất ${issue.minimum} ký tự.`;
          if (issue.code === 'too_big') return `Quan hệ quá dài (tối đa ${issue.maximum} ký tự).`;
          return issue.message;
        },
        phone: (issue: ZodIssue, value: unknown) => {
          if (String(value ?? '').trim() === '') return 'Vui lòng nhập số điện thoại.';
          if (issue.code === 'too_small') return `Số điện thoại cần ít nhất ${issue.minimum} ký tự.`;
          if (issue.code === 'too_big') return `Số điện thoại quá dài (tối đa ${issue.maximum} ký tự).`;
          // Hợp đồng đã có câu tiếng Việt cho ký tự không hợp lệ.
          return issue.message;
        },
      });
      setFieldErrors(nextErrors);
      const firstError = nextErrors.fields.name
        ? 'ec-name'
        : nextErrors.fields.relationship
          ? 'ec-relationship'
          : nextErrors.fields.phone
            ? 'ec-phone'
            : 'ec-name';
      document.getElementById(firstError)?.focus();
      return;
    }
    setFieldErrors(EMPTY_ERRORS);
    save.mutate(parsed.data);
  };

  const cancelDelete = (contactId: string) => {
    pendingFocusRef.current = contactId;
    setConfirmingId(null);
    setDeleteError(null);
  };

  const handleDeleteKeyDown = (event: KeyboardEvent<HTMLDivElement>, contactId: string) => {
    if (event.key !== 'Escape' || remove.isPending) return;
    event.preventDefault();
    event.stopPropagation();
    cancelDelete(contactId);
  };

  const showAddTrigger = canManage && !formOpen && !atLimit && items.length > 0;

  return (
    <section aria-labelledby="emergency-contacts-heading" className="contacts-section">
      <div className="contacts-section__head">
        <h2 id="emergency-contacts-heading" className="page-section__title" tabIndex={-1}>
          Liên hệ khẩn cấp
        </h2>
        {showAddTrigger ? <Button onClick={openCreate}>Thêm liên hệ</Button> : null}
      </div>
      <p className="people-meta">
        Người thân có quyền nhận cảnh báo sẽ thấy thông tin này. Hồ sơ luôn cần một liên hệ chính
        để gọi ngay khi khẩn cấp; tối đa {MAX_EMERGENCY_CONTACTS} liên hệ.
      </p>

      {contacts.isPending ? (
        <PageLoader label="Đang tải liên hệ khẩn cấp…" />
      ) : contacts.isError ? (
        <ErrorState
          headingLevel={3}
          title="Không tải được liên hệ khẩn cấp"
          message={getApiErrorMessage(contacts.error)}
          onRetry={() => void contacts.refetch()}
        />
      ) : items.length === 0 && !formOpen ? (
        <EmptyState
          headingLevel={3}
          title="Chưa có liên hệ khẩn cấp"
          description="Thêm người thân hoặc hàng xóm có thể gọi ngay khi có cảnh báo. Tối đa 5 liên hệ."
          action={canManage ? <Button onClick={openCreate}>Thêm liên hệ</Button> : undefined}
        />
      ) : (
        <>
          {items.length > 0 ? (
            <ul className="people-list" aria-label="Danh sách liên hệ khẩn cấp">
              {items.map((contact) => (
                <li key={contact.id} className="people-row">
                  <div className="people-row__identity">
                    <p className="people-row__name">
                      <span>{contact.name}</span>
                      {contact.isPrimary ? <StatusPill tone="success">Chính</StatusPill> : null}
                    </p>
                    <p className="people-row__meta">
                      <span>{contact.relationship}</span>
                      <span aria-hidden="true">·</span>
                      <a
                        className="contact-phone"
                        href={toTelHref(contact.phone)}
                        aria-label={`Gọi ${contact.name}`}
                      >
                        {contact.phone}
                      </a>
                    </p>
                  </div>
                  {canManage ? (
                    <div className="people-row__actions">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => openEdit(contact)}
                        disabled={save.isPending}
                        aria-label={`Sửa liên hệ ${contact.name}`}
                      >
                        Sửa
                      </Button>
                      {confirmingId === contact.id ? (
                        <div
                          className="people-confirm"
                          role="group"
                          aria-label={`Xác nhận xóa liên hệ ${contact.name}`}
                          onKeyDown={(event) => handleDeleteKeyDown(event, contact.id)}
                        >
                          <p className="people-confirm__text">
                            Xóa liên hệ <strong>{contact.name}</strong>? Số điện thoại này sẽ không
                            còn hiển thị khi có cảnh báo.
                          </p>
                          <div className="people-confirm__actions">
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={remove.isPending}
                              onClick={() => remove.mutate(contact.id)}
                            >
                              {remove.isPending ? 'Đang xóa…' : 'Xác nhận xóa'}
                            </Button>
                            <Button
                              ref={cancelButtonRef}
                              variant="subtle"
                              size="sm"
                              disabled={remove.isPending}
                              onClick={() => cancelDelete(contact.id)}
                            >
                              Hủy
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <Button
                          ref={(element) => {
                            if (!element) return;
                            deleteTriggerRefs.current.set(contact.id, element);
                            if (pendingFocusRef.current === contact.id) {
                              pendingFocusRef.current = null;
                              element.focus();
                            }
                          }}
                          variant="danger-quiet"
                          size="sm"
                          disabled={remove.isPending}
                          onClick={() => {
                            remove.reset();
                            setDeleteError(null);
                            setConfirmingId(contact.id);
                          }}
                          aria-label={`Xóa liên hệ ${contact.name}`}
                        >
                          Xóa
                        </Button>
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {deleteError ? <Alert tone="error">{deleteError}</Alert> : null}

          {canManage && atLimit ? (
            <Alert
              tone="info"
              className="contacts-limit"
              title={`Đã đủ ${MAX_EMERGENCY_CONTACTS} liên hệ`}
            >
              Hồ sơ chỉ lưu tối đa {MAX_EMERGENCY_CONTACTS} liên hệ khẩn cấp. Xóa bớt một liên hệ
              trước khi thêm người mới.
            </Alert>
          ) : null}
        </>
      )}

      {formOpen ? (
        <div className="people-surface contacts-form">
          <h3 className="people-surface__title">
            {editing ? 'Sửa liên hệ khẩn cấp' : 'Thêm liên hệ khẩn cấp'}
          </h3>
          <form className="people-form" onSubmit={handleSubmit} noValidate>
            <TextField
              id="ec-name"
              label="Tên người liên hệ"
              required
              value={form.name}
              error={fieldErrors.fields.name}
              hint="Ví dụ: Cô Hoa."
              autoComplete="off"
              maxLength={80}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
            />
            <TextField
              id="ec-relationship"
              label="Quan hệ với người được theo dõi"
              required
              value={form.relationship}
              error={fieldErrors.fields.relationship}
              hint="Ví dụ: Con gái, hàng xóm, bác sĩ gia đình."
              autoComplete="off"
              maxLength={40}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, relationship: event.target.value }))
              }
            />
            <TextField
              id="ec-phone"
              label="Số điện thoại"
              type="tel"
              inputMode="tel"
              required
              value={form.phone}
              error={fieldErrors.fields.phone}
              hint="Có thể nhập số có dấu cách hoặc +84."
              autoComplete="off"
              maxLength={24}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
            />

            {onlyOne ? (
              total === 0 ? (
                <p className="field__hint">Liên hệ đầu tiên sẽ tự động là liên hệ chính.</p>
              ) : (
                <>
                  <label className="contacts-check">
                    <input type="checkbox" checked disabled readOnly />
                    Liên hệ chính
                  </label>
                  <p className="field__hint">
                    Hồ sơ luôn cần một liên hệ chính. Thêm liên hệ khác rồi chọn người khác làm
                    chính nếu cần.
                  </p>
                </>
              )
            ) : (
              <label className="contacts-check">
                <input
                  type="checkbox"
                  checked={form.isPrimary}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, isPrimary: event.target.checked }))
                  }
                />
                Đặt làm liên hệ chính
              </label>
            )}

            {fieldErrors.general.length > 0 ? (
              <Alert tone="error">
                <ul>
                  {fieldErrors.general.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </Alert>
            ) : null}
            {save.isError ? <Alert tone="error">{getApiErrorMessage(save.error)}</Alert> : null}

            <div className="people-form__actions">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Đang lưu…' : editing ? 'Lưu thay đổi' : 'Thêm liên hệ'}
              </Button>
              <Button variant="subtle" onClick={closeForm} disabled={save.isPending}>
                Hủy
              </Button>
            </div>
          </form>
        </div>
      ) : null}
    </section>
  );
}
