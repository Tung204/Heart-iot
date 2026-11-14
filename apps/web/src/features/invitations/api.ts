/**
 * Hợp đồng lời mời công khai — dùng schema chính thức từ @annhien/contracts/care.
 * Hàm HTTP dùng chung nằm ở features/share/api.ts (cùng miền care).
 */
export { fetchPublicInvitation, acceptInvitation } from '../share/api';
export type { PublicInvitation, CareLinkSummary } from '@annhien/contracts/care';
