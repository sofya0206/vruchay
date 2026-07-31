import argon2 from 'argon2';

/**
 * argon2id — рекомендация OWASP для хранения паролей.
 * Параметры соответствуют профилю «19 МиБ памяти, 2 итерации, 1 поток».
 */
const OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
};

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, OPTIONS);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // Битый или чужого формата хеш — это несовпадение, а не аварийная ситуация.
    return false;
  }
}

/** Минимальные требования к паролю; UI показывает то же сообщение. */
export function validatePasswordStrength(plain: string): string | null {
  if (plain.length < 10) return 'Пароль должен быть не короче 10 символов';
  if (!/[a-zA-Zа-яА-Я]/.test(plain)) return 'Пароль должен содержать хотя бы одну букву';
  if (!/[0-9]/.test(plain)) return 'Пароль должен содержать хотя бы одну цифру';
  return null;
}
