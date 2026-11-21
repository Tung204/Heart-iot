import request from 'supertest';
import { and, eq, like } from 'drizzle-orm';
import { DEFAULT_CARE_PERMISSIONS, type CarePermissions } from '@heart-iot/contracts';
import {
  emergencyContactListSchema,
  emergencyContactSchema,
} from '@heart-iot/contracts/contacts';
import {
  createAdmin,
  createModuleTestApp,
  registerUser,
  TEST_ORIGIN,
  type TestContext,
  type TestUser,
} from './test-app';
import { EmergencyContactsModule } from '../src/emergency-contacts/emergency-contacts.module';
import { auditLogs, careLinks, realtimeEvents, subjects } from '../src/database/schema';

/**
 * Liên hệ khẩn cấp (FR-09, NFR-01, NFR-05):
 * - Chủ hồ sơ CRUD; caregiver có `canReceiveAlerts` chỉ đọc; thiếu quyền 403;
 *   người ngoài/admin không có care link 404 (không lộ tồn tại).
 * - Tối đa 5, đúng một primary, xóa primary tự chọn người cũ nhất còn lại.
 * - Audit ghi thao tác nhưng KHÔNG chứa số điện thoại; không phát realtime/SSE.
 */

const PHONE = '0909 123 456';
const PHONE_DIGITS = '0909123456';

function contactBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Cô Hoa',
    relationship: 'Con gái',
    phone: PHONE,
    isPrimary: false,
    ...overrides,
  };
}

describe('Emergency contacts — liên hệ khẩn cấp của hồ sơ (FR-09, NFR-01, NFR-05)', () => {
  let ctx: TestContext;
  let owner: TestUser;
  let caregiver: TestUser;
  let limitedCaregiver: TestUser;
  let outsider: TestUser;
  let admin: TestUser;

  beforeAll(async () => {
    ctx = await createModuleTestApp([EmergencyContactsModule]);
    owner = await registerUser(ctx.app, { displayName: 'Chủ hồ sơ' });
    caregiver = await registerUser(ctx.app, { displayName: 'Người thân nhận cảnh báo' });
    limitedCaregiver = await registerUser(ctx.app, { displayName: 'Người thân không nhận cảnh báo' });
    outsider = await registerUser(ctx.app, { displayName: 'Người ngoài' });
    admin = await createAdmin(ctx.app, { email: 'admin-contacts@example.test' });
  });

  afterAll(async () => {
    await ctx.close();
  });

  async function newSubject(displayName = 'Bà An'): Promise<string> {
    const rows = await ctx.db
      .insert(subjects)
      .values({
        ownerUserId: owner.session.user.id,
        displayName,
        timezone: 'Asia/Ho_Chi_Minh',
      })
      .returning();
    const row = rows[0];
    if (!row) throw new Error('Không tạo được hồ sơ kiểm thử.');
    return row.id;
  }

  async function linkCaregiver(
    subjectId: string,
    userId: string,
    permissions: CarePermissions = DEFAULT_CARE_PERMISSIONS,
  ): Promise<void> {
    await ctx.db.insert(careLinks).values({
      subjectId,
      caregiverUserId: userId,
      invitedByUserId: owner.session.user.id,
      permissions,
      status: 'active',
      sharedFrom: new Date(),
    });
  }

  function getContacts(user: TestUser, subjectId: string) {
    return user.agent
      .get(`/api/v1/subjects/${subjectId}/emergency-contacts`)
      .set('Origin', TEST_ORIGIN);
  }

  function postContact(user: TestUser, subjectId: string, body: Record<string, unknown>) {
    return user.agent
      .post(`/api/v1/subjects/${subjectId}/emergency-contacts`)
      .set('Origin', TEST_ORIGIN)
      .send(body);
  }

  function patchContact(
    user: TestUser,
    subjectId: string,
    contactId: string,
    body: Record<string, unknown>,
  ) {
    return user.agent
      .patch(`/api/v1/subjects/${subjectId}/emergency-contacts/${contactId}`)
      .set('Origin', TEST_ORIGIN)
      .send(body);
  }

  function deleteContact(user: TestUser, subjectId: string, contactId: string) {
    return user.agent
      .delete(`/api/v1/subjects/${subjectId}/emergency-contacts/${contactId}`)
      .set('Origin', TEST_ORIGIN);
  }

  it('chủ hồ sơ tạo liên hệ đầu tiên → tự thành chính; sửa; xóa 204 (FR-09)', async () => {
    const subjectId = await newSubject();

    const created = await postContact(owner, subjectId, contactBody({ name: 'Cô Hoa' }));
    expect(created.status).toBe(201);
    const first = emergencyContactSchema.parse(created.body);
    expect(first).toMatchObject({
      subjectId,
      name: 'Cô Hoa',
      relationship: 'Con gái',
      phone: PHONE,
      isPrimary: true,
    });

    const second = await postContact(
      owner,
      subjectId,
      contactBody({ name: 'Chú Bảo', relationship: 'Hàng xóm', phone: '+84 912 345 678' }),
    );
    expect(second.status).toBe(201);
    expect(emergencyContactSchema.parse(second.body).isPrimary).toBe(false);

    const updated = await patchContact(owner, subjectId, first.id, {
      name: 'Cô Hoa Nguyễn',
      relationship: 'Con gái',
      phone: PHONE,
      isPrimary: true,
    });
    expect(updated.status).toBe(200);
    expect(emergencyContactSchema.parse(updated.body)).toMatchObject({
      id: first.id,
      name: 'Cô Hoa Nguyễn',
      isPrimary: true,
    });

    const removed = await deleteContact(owner, subjectId, second.body.id as string);
    expect(removed.status).toBe(204);
    expect(removed.text).toBe('');

    const list = await getContacts(owner, subjectId);
    expect(list.status).toBe(200);
    const parsed = emergencyContactListSchema.parse(list.body);
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.id).toBe(first.id);
    expect(parsed.items[0]?.isPrimary).toBe(true);
  });

  it('caregiver có canReceiveAlerts đọc được; thiếu quyền 403; người ngoài và admin không link 404 (NFR-01)', async () => {
    const subjectId = await newSubject();
    const created = await postContact(owner, subjectId, contactBody());
    expect(created.status).toBe(201);
    await linkCaregiver(subjectId, caregiver.session.user.id, {
      ...DEFAULT_CARE_PERMISSIONS,
      canReceiveAlerts: true,
    });
    await linkCaregiver(subjectId, limitedCaregiver.session.user.id, {
      ...DEFAULT_CARE_PERMISSIONS,
      canReceiveAlerts: false,
    });
    const caregiverRead = await getContacts(caregiver, subjectId);
    expect(caregiverRead.status).toBe(200);
    expect(emergencyContactListSchema.parse(caregiverRead.body).items[0]?.phone).toBe(PHONE);

    const denied = await getContacts(limitedCaregiver, subjectId);
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('FORBIDDEN');
    // Không trả số điện thoại trong envelope lỗi.
    expect(JSON.stringify(denied.body)).not.toContain(PHONE_DIGITS);

    const stranger = await getContacts(outsider, subjectId);
    expect(stranger.status).toBe(404);
    expect(stranger.body.code).toBe('NOT_FOUND');

    const adminWithoutLink = await getContacts(admin, subjectId);
    expect(adminWithoutLink.status).toBe(404);
    expect(JSON.stringify(adminWithoutLink.body)).not.toContain(PHONE_DIGITS);
  });

  it('chỉ chủ hồ sơ ghi được: caregiver POST/PATCH/DELETE đều 403', async () => {
    const subjectId = await newSubject();
    await linkCaregiver(subjectId, caregiver.session.user.id);
    const created = await postContact(owner, subjectId, contactBody());
    expect(created.status).toBe(201);
    const contactId = created.body.id as string;

    const caregiverCreate = await postContact(caregiver, subjectId, contactBody({ name: 'Người lạ' }));
    expect(caregiverCreate.status).toBe(403);

    const caregiverUpdate = await patchContact(caregiver, subjectId, contactId, {
      name: 'Đổi tên',
      relationship: 'Con gái',
      phone: PHONE,
      isPrimary: true,
    });
    expect(caregiverUpdate.status).toBe(403);

    const caregiverDelete = await deleteContact(caregiver, subjectId, contactId);
    expect(caregiverDelete.status).toBe(403);

    const list = await getContacts(owner, subjectId);
    expect(emergencyContactListSchema.parse(list.body).items).toHaveLength(1);
  });

  it('giới hạn tối đa 5 liên hệ: liên hệ thứ 6 trả 409 và không được ghi', async () => {
    const subjectId = await newSubject();
    for (let index = 1; index <= 5; index += 1) {
      const res = await postContact(owner, subjectId, contactBody({ name: `Liên hệ ${index}` }));
      expect(res.status).toBe(201);
    }
    const sixth = await postContact(owner, subjectId, contactBody({ name: 'Liên hệ 6' }));
    expect(sixth.status).toBe(409);
    expect(sixth.body.code).toBe('CONFLICT');
    expect(sixth.body.details).toMatchObject({ limit: 5 });

    const list = await getContacts(owner, subjectId);
    expect(emergencyContactListSchema.parse(list.body).items).toHaveLength(5);
  });

  it('bật primary hạ primary cũ trong transaction; danh sách sắp primary trước rồi createdAt', async () => {
    const subjectId = await newSubject();
    const first = await postContact(owner, subjectId, contactBody({ name: 'Liên hệ A' }));
    const second = await postContact(owner, subjectId, contactBody({ name: 'Liên hệ B' }));
    const third = await postContact(owner, subjectId, contactBody({ name: 'Liên hệ C' }));
    const firstId = first.body.id as string;
    const secondId = second.body.id as string;
    const thirdId = third.body.id as string;
    expect(emergencyContactSchema.parse(first.body).isPrimary).toBe(true);

    const promote = await patchContact(owner, subjectId, thirdId, {
      name: 'Liên hệ C',
      relationship: 'Con gái',
      phone: PHONE,
      isPrimary: true,
    });
    expect(promote.status).toBe(200);
    expect(emergencyContactSchema.parse(promote.body).isPrimary).toBe(true);

    const list = await getContacts(owner, subjectId);
    const items = emergencyContactListSchema.parse(list.body).items;
    expect(items.map((item) => item.id)).toEqual([thirdId, firstId, secondId]);
    expect(items.filter((item) => item.isPrimary)).toHaveLength(1);
    expect(items[0]?.isPrimary).toBe(true);

    // Audit primary change ghi id cũ/mới, không ghi tên hay số điện thoại.
    const primaryAudit = await ctx.db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, 'emergency_contact.primary_change'),
          eq(auditLogs.targetId, thirdId),
        ),
      );
    expect(primaryAudit).toHaveLength(1);
    expect(primaryAudit[0]?.metadata).toMatchObject({
      newPrimaryId: thirdId,
      previousPrimaryId: firstId,
    });
  });

  it('không cho bỏ primary của liên hệ chính khi còn liên hệ khác (400); chỉ còn một thì giữ primary', async () => {
    const subjectId = await newSubject();
    const first = await postContact(owner, subjectId, contactBody({ name: 'Liên hệ chính' }));
    await postContact(owner, subjectId, contactBody({ name: 'Liên hệ phụ' }));
    const primaryId = first.body.id as string;

    const unset = await patchContact(owner, subjectId, primaryId, {
      name: 'Liên hệ chính',
      relationship: 'Con gái',
      phone: PHONE,
      isPrimary: false,
    });
    expect(unset.status).toBe(400);
    expect(unset.body.code).toBe('VALIDATION_FAILED');

    const afterRejected = await getContacts(owner, subjectId);
    const itemsAfterRejected = emergencyContactListSchema.parse(afterRejected.body).items;
    expect(itemsAfterRejected.find((item) => item.id === primaryId)?.isPrimary).toBe(true);
    expect(itemsAfterRejected.filter((item) => item.isPrimary)).toHaveLength(1);

    // Xóa liên hệ phụ rồi bỏ cờ chính: chỉ còn một nên vẫn giữ primary.
    const secondaryId = itemsAfterRejected.find((item) => item.id !== primaryId)?.id as string;
    expect((await deleteContact(owner, subjectId, secondaryId)).status).toBe(204);

    const unsetLast = await patchContact(owner, subjectId, primaryId, {
      name: 'Liên hệ chính',
      relationship: 'Con gái',
      phone: PHONE,
      isPrimary: false,
    });
    expect(unsetLast.status).toBe(200);
    expect(emergencyContactSchema.parse(unsetLast.body).isPrimary).toBe(true);
  });

  it('xóa liên hệ chính tự chọn liên hệ cũ nhất còn lại làm chính và audit primary_change', async () => {
    const subjectId = await newSubject();
    const first = await postContact(owner, subjectId, contactBody({ name: 'Liên hệ chính' }));
    const older = await postContact(owner, subjectId, contactBody({ name: 'Liên hệ cũ hơn' }));
    const newer = await postContact(owner, subjectId, contactBody({ name: 'Liên hệ mới hơn' }));

    const removed = await deleteContact(owner, subjectId, first.body.id as string);
    expect(removed.status).toBe(204);

    const list = await getContacts(owner, subjectId);
    const items = emergencyContactListSchema.parse(list.body).items;
    expect(items.map((item) => item.id)).toEqual([older.body.id, newer.body.id]);
    expect(items[0]?.isPrimary).toBe(true);
    expect(items[1]?.isPrimary).toBe(false);

    const primaryAudit = await ctx.db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.action, 'emergency_contact.primary_change'),
          eq(auditLogs.targetId, older.body.id as string),
        ),
      );
    expect(primaryAudit).toHaveLength(1);
    expect(primaryAudit[0]?.metadata).toMatchObject({ newPrimaryId: older.body.id });
  });

  it('contact của hồ sơ khác trả 404 cho PATCH/DELETE và không thay đổi dữ liệu (NFR-01)', async () => {
    const ownSubject = await newSubject('Hồ sơ A');
    const otherSubject = await newSubject('Hồ sơ B');
    const own = await postContact(owner, ownSubject, contactBody({ name: 'Liên hệ hồ sơ A' }));
    const other = await postContact(owner, otherSubject, contactBody({ name: 'Liên hệ hồ sơ B' }));

    const crossPatch = await patchContact(owner, ownSubject, other.body.id as string, {
      name: 'Bị sửa nhầm',
      relationship: 'Con gái',
      phone: PHONE,
      isPrimary: true,
    });
    expect(crossPatch.status).toBe(404);

    const crossDelete = await deleteContact(owner, ownSubject, other.body.id as string);
    expect(crossDelete.status).toBe(404);

    const otherList = await getContacts(owner, otherSubject);
    const otherItems = emergencyContactListSchema.parse(otherList.body).items;
    expect(otherItems).toHaveLength(1);
    expect(otherItems[0]).toMatchObject({ id: other.body.id, name: 'Liên hệ hồ sơ B' });

    const ownList = await getContacts(owner, ownSubject);
    expect(emergencyContactListSchema.parse(ownList.body).items[0]?.id).toBe(own.body.id);
  });

  it('validation tên và số điện thoại trả 422, không ghi bản ghi', async () => {
    const subjectId = await newSubject();

    const shortName = await postContact(owner, subjectId, contactBody({ name: 'A' }));
    expect(shortName.status).toBe(422);
    expect(shortName.body.code).toBe('VALIDATION_FAILED');

    const badPhone = await postContact(owner, subjectId, contactBody({ phone: 'gọi số 0909' }));
    expect(badPhone.status).toBe(422);
    expect(badPhone.body.code).toBe('VALIDATION_FAILED');

    const emptyRelationship = await postContact(owner, subjectId, contactBody({ relationship: '' }));
    expect(emptyRelationship.status).toBe(422);

    const list = await getContacts(owner, subjectId);
    expect(emergencyContactListSchema.parse(list.body).items).toHaveLength(0);
  });

  it('audit create/update/delete không chứa số điện thoại hay tên liên hệ (NFR-05)', async () => {
    const subjectId = await newSubject();
    const created = await postContact(
      owner,
      subjectId,
      contactBody({ name: 'Cô Hoa Bí Mật', phone: PHONE }),
    );
    const contactId = created.body.id as string;

    await patchContact(owner, subjectId, contactId, {
      name: 'Cô Hoa Bí Mật',
      relationship: 'Con gái',
      phone: PHONE,
      isPrimary: true,
    });
    expect((await deleteContact(owner, subjectId, contactId)).status).toBe(204);

    const logs = await ctx.db
      .select()
      .from(auditLogs)
      .where(like(auditLogs.action, 'emergency_contact.%'));
    expect(logs.map((log) => log.action)).toEqual(
      expect.arrayContaining([
        'emergency_contact.create',
        'emergency_contact.update',
        'emergency_contact.delete',
      ]),
    );
    for (const log of logs) {
      const serialized = JSON.stringify(log.metadata);
      expect(serialized).not.toContain(PHONE);
      expect(serialized).not.toContain(PHONE_DIGITS);
      expect(serialized).not.toContain('Cô Hoa Bí Mật');
    }
  });

  it('thao tác liên hệ không ghi realtime event/SSE (NFR-05)', async () => {
    const before = await ctx.db.select({ id: realtimeEvents.id }).from(realtimeEvents);
    const subjectId = await newSubject();
    const created = await postContact(owner, subjectId, contactBody());
    expect(created.status).toBe(201);
    await patchContact(owner, subjectId, created.body.id as string, {
      name: 'Cô Hoa',
      relationship: 'Con gái',
      phone: PHONE,
      isPrimary: true,
    });
    await deleteContact(owner, subjectId, created.body.id as string);

    const after = await ctx.db.select({ id: realtimeEvents.id }).from(realtimeEvents);
    expect(after).toHaveLength(before.length);
  });

  it('hồ sơ đã lưu trữ coi như không tồn tại → 404', async () => {
    const subjectId = await newSubject('Hồ sơ đã lưu trữ');
    await ctx.db
      .update(subjects)
      .set({ archivedAt: new Date() })
      .where(eq(subjects.id, subjectId));

    const res = await getContacts(owner, subjectId);
    expect(res.status).toBe(404);
  });
});
