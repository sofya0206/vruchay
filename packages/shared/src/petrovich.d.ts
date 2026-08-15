/**
 * Типы для petrovich — своих у библиотеки нет, и пакета @types тоже.
 *
 * Описываем ровно то, чем пользуемся, а не весь её интерфейс: лишние
 * объявления пришлось бы поддерживать в согласии с чужим кодом,
 * ничего за это не получая.
 */
declare module 'petrovich' {
  type Gender = 'male' | 'female' | 'androgynous';

  interface Person {
    first?: string;
    middle?: string;
    last?: string;
    gender?: Gender;
  }

  type GrammaticalCase =
    | 'nominative'
    | 'genitive'
    | 'dative'
    | 'accusative'
    | 'instrumental'
    | 'prepositional';

  interface Petrovich {
    (person: Person, grammaticalCase: GrammaticalCase): Person & { gender: Gender };
    /** Определяет пол по отчеству. Имени библиотека не знает. */
    detect_gender(middleName: string): Gender;
  }

  const petrovich: Petrovich;
  export default petrovich;
}
