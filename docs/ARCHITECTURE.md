# Architecture — agreed technology boundaries (planned)

**Ни один сервис пока не создан.** Документ закрепляет уже утверждённые технологии, а не указывает Pi создать всю инфраструктуру одним шагом.

## Frontend

- React + TypeScript + Vite + Tailwind CSS — интерфейс и темы.
- React Router — навигация.
- Zustand — client UI/state (например, текущая корзина, 2D конфигурация, модалки, тема).
- TanStack Query — server state: загрузки, кеш, invalidation, mutations, ошибки.
- Zod — runtime валидация; React Hook Form — допустим для форм.
- На первом этапе использовать Mock API **с тем же концептуальным контрактом**, что будет позже у backend, но не выдавать mock за реальный сервер.
- Orval подключать по реальному OpenAPI FastAPI на этапе интеграции; генерируемые TypeScript-типы, Zod-схемы и API client/hooks — **не написанные вручную дубли** (где поддерживается выбранной конфигурацией Orval).

## Backend

- Python FastAPI + Pydantic — request/response validation, автогенерация OpenAPI.
- SQLAlchemy 2.x — ORM/транзакции; Alembic — schema migrations; psycopg — PostgreSQL driver.
- PostgreSQL — центральный источник данных. Полнотекстовый поиск + `pg_trgm` для серверного поискового пути; поиск по товарам/готовым сборкам с релевантностью, пагинацией и терпимостью к опечаткам.
- JWT на PyJWT; пароли через pwdlib + Argon2. Для auth в планах: короткоживущий access token в памяти клиента, refresh token в HttpOnly cookie с CSRF-защитой, обновление access после 401, отзыв refresh при logout. Точные HTTP-контракты определить перед API-реализацией и проверить runtime.
- Приватные builds/orders/личный кабинет: серверная аутентификация и авторизация на уровне данных, не только frontend. Конфигуратор совместимости — бизнес-логика, не исключительно картинки.
- При покупке — только демо-заказ без платёжной интеграции. Snapshot приобретённых позиций, состава сборок и цен. Транзакции и защита от гонок — часть нужной реальной бизнес-логики.

## Данные и взаимодействия (концептуальная схема)

```text
React UI
 ├── Zustand: локальное состояние интерфейса
 └── TanStack Query: серверные данные
          ↓ API-клиент (пока Mock API; позднее Orval/OpenAPI)
FastAPI + Pydantic
          ↓ SQLAlchemy + psycopg
PostgreSQL (+ Full-Text Search, pg_trgm)
```

**Это не окончательная схема таблиц, эндпоинтов и DTO.** Не придумывать точные имена сущностей, маршруты API или схему БД до соответствующей задачи.

## Container и release

Docker и Docker Compose — для локального воспроизводимого запуска frontend/backend/PostgreSQL **после реализации**. Не заявлять, что Docker Compose уже настроен. Код и документация — в GitHub, запуск локальный. Внешний VPS/CD не нужен по умолчанию.

## Testing

- Frontend: Vitest, React Testing Library; при необходимости Playwright для E2E.
- Backend: pytest + HTTPX; тестировать runtime validation, auth/permissions, бизнес-правила, транзакционные краевые случаи.
- Инструменты визуальной проверки Pi: `pi-frontend-check` при доступности и реальный screenshot. Semgrep/Gitleaks могут участвовать через локальный pre-commit hook **только если фактически настроены в среде**.

## Not in scope without agreement

Redis (опционально позже), RabbitMQ/Celery/Elasticsearch/Kubernetes, платные облачные сервисы, 3D/WebGL, система сравнения, полноценный checkout, платёжный провайдер и доставка.
