# Архитектура PackApprove

Next.js App Router / TypeScript / React → HTTP JSON API → транзакционный application service → PostgreSQL с RLS. Аутентификация и файловое хранилище изолированы в `lib/platform.ts`. Интерфейс не использует SDK Supabase и не имеет ключей или прямого доступа к базе. Замена backend требует сохранить контракт `/api/state`, `/api/command`, `/api/files/:id`, `/api/packages/:id` и cookie authentication.

## Границы доверия

- `currentUser()` проверяет access token через Supabase Auth getUser; role берётся из active profile, а не из тела запроса или редактируемого user_metadata.
- Все прикладные запросы выполняются внутри транзакции `SET LOCAL ROLE packapprove_app` + `set_config('app.user_id', verified_id, true)`. Эта роль NOLOGIN и без BYPASSRLS. В production отдельный LOGIN должен иметь право SET ROLE только в неё. Миграции — отдельным owner-подключением. Не предоставляйте runtime DB credentials клиентам.
- PostgREST authenticated имеет только SELECT. На Storage нет разрешающих клиентских policies: все объекты приватны. service role применяется только для Auth admin и Storage, никогда для прикладных запросов.
- RLS ограничивает строки; application service проверяет права конкретного действия. Внутренние ветки и ответы исключены самой базой из клиентских выборок. Клиент видит только preview-файл опубликованных версий своей организации.
- Чувствительные изменения ограничены 90 запросами в минуту на пользователя в PostgreSQL. Вход дополнительно ограничен в памяти процесса; для нескольких replicas требуется gateway/WAF limiter.

## Неизменяемая идентичность

Каждая версия имеет UUID, последовательный номер под блокировкой макета, отдельные source/preview/production файлы и вычисленные сервером SHA-256. Переименования не меняют идентичность. Обновление и удаление version_files, решений и технических результатов блокируют PostgreSQL triggers. У artwork_versions меняется только workflow status. Обычного удаления версий API не предоставляет.

Решение хранит хеш просмотренного preview. Производственный комплект хранит точный production file той же версии, хеш, конкретный завершённый раунд и technical review. Preview и production могут иметь разные хеши; успешная ручная допечатная проверка подтверждает их соответствие. Это не автоматическая экспертиза печатного файла.

## Транзакции и гонки

Каждая команда имеет Idempotency-Key, fingerprint запроса и PostgreSQL advisory lock на user + key. Одинаковый повтор возвращает исходный ответ; повтор ключа с другим запросом отклоняется. Уникальные ограничения защищают решения и комплекты дополнительно. Переходы версий, раунды, решения и выпуск сериализуются FOR UPDATE на макете. Получение, скачивание и отзыв — FOR UPDATE на комплекте.

Optimistic locking (`row_version`) используется при новой версии, изменении профиля, подтверждении и отзыве. Остальные переходы проверяют фактический статус под блокировкой. Старый раунд после новой версии помечается superseded; даже старая открытая вкладка получает 409 при попытке решения.

Скачивание производственного комплекта удерживает блокировку до чтения и проверки SHA-256. После commit отзыва новый запрос невозможен. Уже начатую передачу и файл на компьютере отозвать физически невозможно. Signed URL на 30 секунд используется только сервером и не выдаётся браузеру. На ответе `private, no-store`.

## Превью и загрузки

Разрешены PDF, PNG, JPEG до 25 MiB; MIME определяется magic bytes. PDF.js в web worker рендерит PDF в canvas, без исполнения JavaScript документа. На сервере не запускаются конвертеры пользовательских файлов. Внутренняя обработка preview через worker изолирована от основного UI, но не заменяет антивирус/санитарную обработку. Для промышленной эксплуатации добавьте quarantine, AV/CDR и отдельный container preview worker с ограничениями CPU/RAM. Производственные загрузки предпочтительно attachment; ссылки не обходят проверку доступа.

Storage не участвует в SQL transaction: при сбое после upload возможен недостижимый orphan object. Он не публикуется и не заменяет существующий файл. Нужен периодический GC объектов, отсутствующих в version_files, с retention window и dry run.

## Независимые статусы

projects: active / paused / completed / archived.
artworks: draft / in_progress / review / approved / production.
artwork_versions: fixed / internal_review / published / approved / changes_requested / superseded.
technical_reviews: ready / limited / correction. Только ready разрешает выпуск.
approval_rounds: open / approved / changes_requested / superseded / cancelled.
production_packages: prepared / transferred / received / revoked / replaced.

MVP выпускает пакет сразу в transferred. Повторный выпуск той же версии запрещён даже после отзыва: нужен новый файл / новая версия / новый раунд / новая проверка. Политика all реализована; one/quorum не включены.
