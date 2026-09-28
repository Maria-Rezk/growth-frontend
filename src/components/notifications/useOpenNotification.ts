import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCompany } from '@/context/CompanyContext';
import { useNotifications } from '@/context/NotificationsContext';
import { notificationsService } from '@/services/notifications';
import type { AppNotification } from '@/types/domain';
import { notificationLink } from './notificationMeta';

/**
 * Opens what a notification is about: marks it read, points the app at the
 * right client (detail pages are client-scoped, so a task from another client
 * would otherwise open as "not found"), then navigates.
 */
export function useOpenNotification() {
  const navigate = useNavigate();
  const { activeCompanyId, companies, setActiveCompanyId } = useCompany();
  const { refreshUnreadCount } = useNotifications();

  return useCallback(
    async (notification: AppNotification) => {
      if (!notification.readAt) {
        try {
          await notificationsService.markRead(notification.id);
        } catch {
          // Opening the target matters more than the read flag.
        }
        void refreshUnreadCount();
      }
      const target = notification.companyId;
      if (target && target !== activeCompanyId && companies.some((company) => company.id === target)) {
        setActiveCompanyId(target);
      }
      navigate(notificationLink(notification) ?? '/notifications');
    },
    [activeCompanyId, companies, navigate, refreshUnreadCount, setActiveCompanyId],
  );
}
