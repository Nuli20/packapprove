# Production

Для ветки product quality сначала выполните [проверяемый порядок выпуска](PRODUCT-QUALITY-RELEASE.md). Production не обновляется автоматически.

1. Создайте проект Supabase, задайте регион хранения и резервное копирование. Включите подтверждение email, SMTP, ограниченные redirect URLs, MFA для сотрудников по политике организации. Не используйте локальные JWT keys и demo password.
2. Проверьте схему командами `npm run db:doctor` и `npm run db:plan` через отдельное migration owner-подключение. На чистой копии `npm run db:setup` применяет все четыре версионированные миграции; для удалённой записи требуется `--allow-remote`. При расхождении структуры и журнала остановитесь и следуйте инструкции выпуска. Не считайте схему установленной по наличию одной таблицы. Bucket artworks закрытый; authenticated не имеет прямой записи.
3. Создайте отдельный LOGIN для сервера с сильным секретом и правом SET ROLE packapprove_app. Миграции и provision пользователей выполняйте отдельным owner-подключением. Не выдавайте runtime login membership в postgres/service_role. При использовании pooler проверьте SET LOCAL в транзакциях и выставьте prepare=false (уже задано).
4. Настройте `.env.example` в secret manager платформы. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` — только на сервере. `COOKIE_SECURE=true`, `NEXT_PUBLIC_DEMO_MODE=false`, `APP_ORIGIN=https://ваш-домен` для точной проверки Origin. Переменная demo проверяется и в seed, не запускайте seed на production.
5. `npm ci && npm run build && npm start`. Поддерживается Node.js >=22 (проверено на 24). HTTPS ingress и timeouts в соответствии с платформой. Файлы до 25 МБ идут напрямую в private Storage через quarantine flow с серверной проверкой перед фиксацией; не увеличивайте Base64 body serverless endpoint ради крупных файлов.
6. Создайте Auth users в Supabase Admin и соответствующие profiles, organization_memberships, project_members. Начального администратора создаёт оператор; открытой self-signup роли admin нет. Invitations клиентов и сотрудников (только администратор) создают одноразовые ссылки и поддерживают принятие с установкой пароля; доставку email подключите отдельно. Повторное приглашение уже существующего email требует административного управления memberships.
7. Запускайте `npm run reminders` по расписанию (например, каждые 15 минут) с owner-подключением. Команда создаёт внутренние уведомления о сроках один раз на раунд и тип. Скрипт использует NOT EXISTS; запускайте один worker, без параллельных cron jobs. Для строгой exactly-once доставки необходим отдельный outbox.
8. Настройте централизованные логи, gateway rate limits входа, retention, алерты по ошибкам, мониторинг SQL connections и Storage. Логи приложения не печатают tokens/пароли/полное окружение. IP решений опционален и по умолчанию не сохраняется: включайте только после trusted proxy validation. User-Agent сохраняется.
9. Перед запуском реальных тиражей выполните восстановление backup в отдельную среду, настройте роли и повторите интеграционные тесты на тестовом проекте. Тесты создают записи TEST, запускать против production нельзя.

## Резервное копирование

База и объекты Storage резервируются раздельно. SQL dump содержит метаданные и SHA-256, но не байты файлов.

- Используйте Supabase PITR / managed backups для PostgreSQL согласно выбранному тарифу.
- Для self-hosted: `pg_dump --format=custom --no-owner --file=packapprove.dump "$BACKUP_DATABASE_URL"` под отдельной backup ролью. Переменная содержит секрет и не должна попадать в shell tracing/логи.
- Копируйте содержимое private bucket artworks через административный Storage/S3 export в зашифрованное версионируемое хранилище, включая пути UUID. Сохраняйте snapshot/manifest SHA-256 из version_files на тот же момент времени.
- Шифруйте backup, ограничьте доступ, фиксируйте retention и регулярность (например, ежедневный полный + PITR). Не храните ключ расшифровки рядом с архивом.
- При восстановлении: остановите writes, восстановите Auth identities и public/schema/storage metadata согласованным snapshot, затем объекты по исходным путям; примените grants/RLS; проверьте count файлов и SHA-256 каждого объекта. Не восстанавливайте только public без auth.users.
- Проведите тест скачивания утверждённого и отозванного комплекта и изоляции двух организаций; только затем открывайте трафик. RPO/RTO необходимо определить с QAZALPACK.
