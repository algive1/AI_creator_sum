import { post } from './request';

export function markAnnouncementRead(id: number) {
  return post(`/announcements/${id}/read`, {}, { silent: true });
}

export function closeAnnouncement(id: number) {
  return post(`/announcements/${id}/close`, {}, { silent: true });
}
