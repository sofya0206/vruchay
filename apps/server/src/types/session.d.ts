/**
 * Состав сессии. Хранится в зашифрованной cookie, поэтому кладём только
 * идентификаторы: остальное подтягиваем из базы на каждом запросе, чтобы
 * исключение пользователя из организации действовало немедленно.
 */
declare module '@fastify/secure-session' {
  interface SessionData {
    userId: string;
    orgId: string;
  }
}

export {};
