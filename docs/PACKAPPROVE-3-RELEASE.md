# PackApprove 3 — проверка и публикация

Ветка `feat/packapprove-3-can-studio` основана на `feat/packapprove-2-studio`, commit `19d96a9`. Production, main, существующие клиентские проекты и первые две SQL-миграции не изменялись.

## Реализовано

- Настоящий лениво загружаемый Three.js / React Three Fiber WebGL2: Standard 450, Sleek 330, Slim 250; металлические крышка/обод/основание, ограниченная печатная зона, OrbitControls, ракурсы, zoom, клавиатура, fullscreen и автовращение.
- Реальные PNG/JPG и выбранная PDF-страница: проверка MIME/размера/SHA-256, ограниченная растеризация, равномерный масштаб, позиция и шов. Внутренний экспериментальный режим не пересчитывает номинальный объём и не объявляется производственным шаблоном.
- В существующем макете: 2D / 3D / сравнение, версии и SHA-256, прежние комментарии/решения справа. Параметры фиксируются только с новой immutable версией; клиент не может загрузить или подменить официальный файл.
- Private Storage direct PUT через отдельный quarantine ticket. Финальная фиксация повторно проверяет роль, RLS, актуальность, MIME и хеш, копирует в новый недоступный для прямой записи final UUID. Повтор staging URL не подменяет версию. Большие файлы не идут Base64 через serverless JSON.
- Мягкий интерфейс с локальным Manrope, RU/KZ, mobile layout, loading/error/2D fallback. Тяжёлая сцена не запрашивается на дашборде.
- Отдельная публичная `/can-lab` с оригинальными вымышленными ZHYRA/SAIA/TUN. Никаких клиентских файлов в public. Отдельный защищённый local seed не перезаписывает прежние организации и проекты.

## Фактически выполненные проверки

Изолированный локальный PostgreSQL / Supabase, 25 октября 2026. Тестовые скрипты отказываются работать с production endpoints.

| Проверка | Результат |
|---|---|
| Чистый `npm ci`, postinstall PDF.js assets | Успешно |
| `npm run typecheck` | Успешно |
| `npm run build` | Успешно, production routes собраны |
| `npm test` | 54 теста, 9 файлов — passed |
| `npm run test:e2e` | 16 passed, 2 skipped: повторные mobile API mutations, покрытые на desktop |
| Все три миграции в отдельной пустой test DB с auth/storage схемами | Успешно; RLS новых таблиц включён; test DB удалена |
| `npm audit --omit=dev --audit-level=high` | 0 уязвимостей на момент проверки |
| Browser network на дашборде | Three WebGLRenderer не загружается; при открытии 3D загружается |
| Production `/can-lab` без backend credentials | Настоящий WebGL2, проверенная текстура; 0 API requests, 0 page errors |
| Upload/download >5 MiB | Прямой private PUT, маленький command JSON, streamed download с точной SHA-256 |

E2E включает PNG/PDF/JPG, вторую страницу PDF, все форматы, отличающиеся реальные кадры при вращении/zoom, mobile, отказ WebGL, создание V1/V2 дизайнером и просмотр клиентом, запрет загрузки клиенту. Сохранены проверки полного цикла приглашения → техническая проверка → изменения → V2 → утверждение → точный production файл, устаревших/неутверждённых версий, отзыва, внутренних комментариев и idempotency.

Скриншоты и WebM получены Playwright Chromium, программный GPU SwiftShader. Это WebGL-renderer, но не проверка производительности физического телефона или Safari. [Галерея и manifest](review/packapprove-3/README.md). Повторная съёмка локального стенда: `node scripts/capture-can-review.mjs` (нужны demo seed, сервер и Chromium/ffmpeg).

## Безопасный порядок публикации

1. Проверить diff и backup Supabase. Развернуть отдельный staging; production-переменные не менять автоматически.
2. На staging выполнить `npm ci`, `npm run db:plan`, проверить и применить **новую** `supabase/migrations/202610250002_can_studio.sql` через существующий migration runner. Она добавляет upload tickets, immutable visualizations, RLS/индексы и default для новых макетов. Существующие строки не переписываются.
3. Запустить UI и проверить private upload, серверную фиксацию хеша, клиентскую изоляцию, PDF worker/WASM и streamed download на настоящем Vercel Preview. Проверить разрешённый Storage origin и CSP для вашего Supabase URL.
4. Только после review и отдельного разрешения применить additive migration к production **до** выпуска кода, читающего новую таблицу. Seed и изменяющие тесты на production запрещены.
5. Не сливать PR автоматически. В случае отката приложения оставить новые таблицы и immutable файлы; удаление таблиц/данных для отката не требуется.

Новых обязательных секретов нет. `SUPABASE_SERVICE_ROLE_KEY` и `DATABASE_URL` остаются server-only. Подробная архитектура, обслуживание quarantine и Windows preview: [CAN-STUDIO.md](CAN-STUDIO.md).

## Честные ограничения

- Заводские GLB/чертежи не получены: геометрия и размеры приблизительные, без вымышленных допусков. Готовый проверенный GLB можно подключить через изолированный `model.tsx`, но GLB importer и технические шаблоны в этой версии не реализованы.
- 3D RGB/PBR не является цветопробой. Объект согласования — сохранённый файл UUID/SHA-256. Координатные метки ставятся в 2D; 3D не сохраняет пространственные аннотации.
- Максимум 25 MiB на файл, direct upload, без TUS resume. При обрыве PUT файл отправляется заново. Проверка финализации буферизует один файл; для большого масштаба нужны worker/queue и нагрузочные измерения.
- Supabase Storage и SQL не образуют распределённую транзакцию: после неудачи возможны недоступные orphan final objects. Quarantine GC доступен отдельно в dry-run; автоматического удаления final объектов нет.
- Внешние Vercel Preview, реальные GPU/телефоны, production SMTP/Storage CORS и фактические ограничения Vercel тарифа в этой среде не проверены. Production база и настройки не менялись.
- GitHub API в окружении возвращает 403 от сетевого proxy. Если PR не удаётся создать, опубликованная ветка и compare URL позволяют создать его безопасно в интерфейсе GitHub; merge не выполняется.
