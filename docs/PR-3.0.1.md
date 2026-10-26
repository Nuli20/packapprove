При открытии созданного приглашения ограниченный PostgreSQL login получал 42501, а пользователь — общую ошибку 500: публичные обработчики обращались к RLS-таблицам напрямую. Исправление вводит узкие серверные функции проверки токена и транзакционной фиксации регистрации. Новые ссылки используют fragment и POST; старые query-ссылки поддерживаются. Роли существующих аккаунтов не переписываются, browser EXECUTE/общие table grants не добавлены.

В этой же ветке: три коротких шага создания проекта с сохранением значений, компактные формы клиента/приглашения, шесть настоящих демо-сессий в отдельном локальном Supabase, подготовленные заказы банок и задачи всех ролей. Onest, мягкие поверхности, меньше повторяющихся технических подписей. 3D остаётся внутри версии с явным выбором Standard 450 / Sleek 330 / Slim 250; SHA-256, immutable файлы/решения и production gates сохранены.

Проверки:

- Чистый npm ci, TypeScript, production build — успешно; npm audit — 0 vulnerabilities на момент проверки.
- Vitest: 71 passed, 11 файлов; включая ограниченный login, RLS/ACL, существующий email, expired/replayed/invalid token, гонку принятия и сбои Auth/SQL.
- Полный desktop/mobile Playwright: 22 passed, 2 намеренных пропуска повторных mobile API мутаций, покрытых на desktop.
- Production runtime с временным NOINHERIT login: 2 passed — реальные одноразовые ссылки дизайнера/допечатника, повторный вход, назначение на сохранённый проект и пустые справочники.
- Шесть демо-кабинетов после дополнительной задачи дизайнера: 2 passed, desktop/mobile.
- Все четыре миграции проверены в новой scratch DB; SECURITY DEFINER/search_path/ACL и RLS подтверждены.
- 19 настоящих Chromium PNG, WebM из реальных WebGL-кадров, 0 page/console errors.

[Скриншоты](https://github.com/Nuli20/packapprove/tree/fix/packapprove-invitations-and-demo-ux/docs/review/invitations-demo-ux) · [Проверки и публикация](https://github.com/Nuli20/packapprove/blob/fix/packapprove-invitations-and-demo-ux/docs/RELEASE-3.0.1.md)

Перед выкладкой API применить только новую additive migration `202610250003_invitation_capabilities.sql` сначала на staging через migration owner; runtime login остаётся ограниченным. Проверка и неразрушающий rollback описаны в `docs/INVITATIONS.md` и `supabase/rollback`. Production БД, секреты и main не менялись. Не выполнять merge автоматически.

Ограничения: публичный cloud demo не развёрнут — демо-допуск намеренно ограничен локальной изолированной базой. Production Vercel/Supabase/SMTP не проверялись. Auth и SQL не являются распределённой транзакцией; неопределённый исход сохраняет identity для проверки администратором. Банки приблизительные, RGB не цветопроба; прежний лимит 25 MiB без TUS сохранён. Mobile — эмуляция Chromium, не физический Safari.
