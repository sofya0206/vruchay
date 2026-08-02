/// <reference types="vite/client" />

/**
 * Данные предпринимателя для юридических страниц. Задаются при сборке
 * приложения: в репозитории им не место — адрес регистрации ИП это
 * домашний адрес человека.
 */
interface ImportMetaEnv {
  readonly VITE_OPERATOR_NAME?: string;
  readonly VITE_OPERATOR_INN?: string;
  readonly VITE_OPERATOR_OGRNIP?: string;
  readonly VITE_OPERATOR_ADDRESS?: string;
  readonly VITE_OPERATOR_EMAIL?: string;
  readonly VITE_OPERATOR_PHONE?: string;
  /** Дата редакции политики — меняется вместе с текстом. */
  readonly VITE_POLICY_DATE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
