import type { Locale } from "./i18n";
export const filePickerCopy = {
  ru: {
    preview: "Предпросмотр",
    production: "Производственный файл",
    source: "Исходный файл",
    choose: "Выбрать файл",
    replace: "Заменить файл",
    remove: "Убрать файл",
    required: "Обязательно",
    optional: "Необязательно",
    empty: "Файл не выбран",
    checking: "Проверяем файл…",
    selected: "Готов к загрузке · ещё не сохранён",
    uploading: "Загружаем в закрытое хранилище…",
    staged: "Загружен · фиксируем версию…",
    types: "PDF, PNG или JPG · до 25 МБ",
    invalid: "Файл не подходит",
    missing: "Выберите обязательный файл",
    size: "Размер файла: от 1 байта до 25 МБ.",
    format: "Разрешены PDF, PNG и JPG. Формат проверяется по содержимому.",
    changes: "Опишите изменения новой версии.",
    addRequired: "Добавьте файл для предпросмотра и производственный файл.",
    design: "Дизайн для 3D",
    file: "Файл",
    kb: "КБ",
    mb: "МБ",
    bytes: "байт",
  },
  kz: {
    preview: "Алдын ала қарау",
    production: "Өндірістік файл",
    source: "Бастапқы файл",
    choose: "Файл таңдау",
    replace: "Файлды ауыстыру",
    remove: "Файлды алып тастау",
    required: "Міндетті",
    optional: "Міндетті емес",
    empty: "Файл таңдалмады",
    checking: "Файл тексерілуде…",
    selected: "Жүктеуге дайын · әлі сақталмады",
    uploading: "Жабық қоймаға жүктелуде…",
    staged: "Жүктелді · нұсқа тіркелуде…",
    types: "PDF, PNG немесе JPG · 25 МБ дейін",
    invalid: "Файл жарамсыз",
    missing: "Міндетті файлды таңдаңыз",
    size: "Файл өлшемі: 1 байттан 25 МБ дейін.",
    format:
      "PDF, PNG және JPG рұқсат етілген. Пішім мазмұны бойынша тексеріледі.",
    changes: "Жаңа нұсқадағы өзгерістерді сипаттаңыз.",
    addRequired: "Алдын ала қарау және өндірістік файлды қосыңыз.",
    design: "3D үшін дизайн",
    file: "Файл",
    kb: "КБ",
    mb: "МБ",
    bytes: "байт",
  },
} as const;
export function fileSize(bytes: number, locale: Locale) {
  const c = filePickerCopy[locale];
  if (bytes < 1024) return bytes + " " + c.bytes;
  const mb = bytes >= 1024 * 1024;
  return (
    new Intl.NumberFormat(locale === "ru" ? "ru-RU" : "kk-KZ", {
      maximumFractionDigits: 1,
    }).format(bytes / (mb ? 1024 * 1024 : 1024)) +
    " " +
    (mb ? c.mb : c.kb)
  );
}
