В форме новой версии и 3D Studio нет надёжного явного действия выбора: старый UI зависел от активации label, а прежние E2E устанавливали файлы напрямую. Добавлен общий DesignFilePicker: видимая кнопка вызывает inputRef.current.click() синхронно из пользовательского нажатия. Выбранный файл можно заменить или убрать; имя, размер и статус показываются явно.

Предпросмотр/производственный файл остаются обязательными, исходник — необязательным. Вместо скрытого native required используются адресные ошибки и перевод фокуса на кнопку. Проверяются размер/MIME/SHA-256; до сохранения запросов загрузки нет. Существующий private signed upload → quarantine → серверная фиксация новой версии сохранён. SQL, RLS, согласования и production gates не менялись; миграция не нужна.

Проверки:

- TypeScript, production build: passed.
- Vitest: 71 passed / 11 файлов.
- Полный Playwright desktop/mobile: 24 passed, 2 intentional skips повторных mobile API мутаций, покрытых на desktop.
- Новый E2E на обоих устройствах: по 6 настоящих filechooser events через click/tap/Enter/Space; Tab/Shift+Tab; PNG → PDF; PDF/JPG в V1; PNG из 3D в V2. Перезагрузка сохраняет результат; защищённые скачивания всех 5 файлов каждого сценария совпадают с исходными SHA-256, V1 неизменна.

[Реальные скриншоты и evidence](https://github.com/Nuli20/packapprove/tree/fix/native-file-picker/docs/review/native-file-picker) · [Описание исправления](https://github.com/Nuli20/packapprove/blob/fix/native-file-picker/docs/FILE-PICKER-FIX.md)

Проверки выполнялись только на изолированном локальном Supabase. Production и main не изменены. Mobile — Chromium с эмуляцией iPhone; физический Safari не проверялся. Не выполнять merge автоматически.
