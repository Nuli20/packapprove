# PackApprove: студия, scoped RLS и проверенный цикл согласования

PackApprove получает новую светлую студию по ролям и загружает данные по текущему экрану, проекту и версии внутри RLS-транзакции. Каталог, загрузка, макет 2D/3D и клиентское решение переработаны; preview и production выбираются отдельно, сохранённые версии и решения остаются неизменяемыми.

Исправлены реальные причины ошибок: обычный комментарий больше не создаёт требование исправлений; свежий комментарий виден на первой странице; retries сохраняют idempotency key и повторно проверяют текущую роль; сравнение сохраняет пару версий в URL; PDF zoom не скачивает документ заново.

CLI сравнивает полные контракты схемы до применения миграций/восстановления journal. Runtime/CLI проверяют владение и наследуемый BYPASS; Preview без явно указанного отдельного Supabase не получает доступ к унаследованному backend.

Проверено локально: TypeScript, production build, 95 Vitest проверок; полный Playwright прогон 48 passed / 2 прежних skip; 2 новых comparison сценария и regression subset 9 passed / 1 прежний skip. Полный UI цикл desktop/mobile создаёт клиента и приглашения, загружает V1/V2 через настоящий chooser, согласует, получает точные bytes и отзывает комплект. Шесть schema/role/upgrade/drift проверок пройдены на scratch DB.

- [Скриншоты до/после, видео, измерения и результаты](https://github.com/Nuli20/packapprove/blob/feat/product-quality-pass/docs/review/product-quality/README.md)
- [Безопасный порядок выпуска и отката](https://github.com/Nuli20/packapprove/blob/feat/product-quality-pass/docs/PRODUCT-QUALITY-RELEASE.md)

Новых SQL-миграций и dependency upgrades нет. Миграции, lockfile, PDF assets и прежние README images сохранены. Удалён только неиспользуемый второй CSS-каскад.

Main, production, пользовательские данные, облачные секреты и домен не изменялись. Не объединять и не выкладывать автоматически: внешние staging/SMTP/production и GitHub Actions здесь не подтверждены; сначала проверить отдельный staging backend и ограниченный runtime login по runbook.

---

Сравнение для создания PR: https://github.com/Nuli20/packapprove/compare/main...feat/product-quality-pass?expand=1

База: `main`. Исходная ветка: `feat/product-quality-pass`. Описание выше готово для поля PR. В текущем окружении GitHub GraphQL API отвечает `Forbidden`; успешная публикация ветки проверяется через git. Автоматический merge и production deploy не выполняются.
