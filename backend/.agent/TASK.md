# BE-001: SQLAlchemy ORM & FastAPI Database Integration

## Goal
Create typed SQLAlchemy 2.x ORM models for all 15 existing DB tables, connect them to FastAPI via session management, implement `/health/db` endpoint, and verify everything via HTTP + tests.

## Acceptance Criteria

- [x] AC-1: 15 ORM models matching the exact PostgreSQL schema (columns, types, PK/FK, constraints, JSONB, UUID, Numeric, composite keys, server defaults, triggers)
  - 14 model classes covering 15 tables (Favorites has composite PK)
  - All column types, constraints, and relationships verified against migration `a1b2c3d4e5f6`
- [x] AC-2: `app/core/config.py` with pydantic-settings for DB config (POSTGRES_ vars from .env)
- [x] AC-3: `app/db/base.py` with DeclarativeBase, `app/db/session.py` with Engine + sessionmaker + FastAPI Depends
- [x] AC-4: `alembic/env.py` target_metadata includes all ORM models (no autogenerate drift)
- [x] AC-5: `GET /` returns HTTP 200 `{"message":"Backend is running!"}` unchanged
- [x] AC-6: `GET /health/db` returns HTTP 200 `{"status":"ok","database":"connected"}` when DB is up
- [x] AC-7: `GET /health/db` returns HTTP 503 (no secrets leaked) when DB is down
- [x] AC-8: ORM reads 51 products successfully with relationships
  - `test_product_count` → count == 51
  - `test_get_product_by_slug` → slug "gpu-rtx-4070-super" resolves correctly
  - `test_product_relationships` → category/type/manufacturer resolve
- [x] AC-9: pytest + ruff + mypy pass
  - `poe lint` → All checks passed!
  - `poe format-check` → 21 files already formatted
  - `poe typecheck` → Success: no issues found
  - `poe test` → 15 passed
  - `poe check` → All passed
- [x] AC-10: `alembic current` → `a1b2c3d4e5f6 (head)`

## Skills Loaded
- software-architect: loaded ✓ (read `SKILL.md` before implementation)
- sqlalchemy: loaded ✓ (read `SKILL.md` before implementation)
- fastapi: loaded ✓ (read `SKILL.md` before implementation)
- pytest: loaded ✓ (read `SKILL.md` before implementation)
- verification-before-completion: loaded ✓ (read `SKILL.md` before verification)

## Context
- Migration `a1b2c3d4e5f6_initial_schema.py` already applied
- 15 tables created, 51 seed products loaded
- psycopg 3, SQLAlchemy 2.x, FastAPI, pydantic-settings
- DB: 127.0.0.1:55432, DB name: pc_builder

## Files Created
1. `app/core/config.py` — pydantic-settings AppSettings with database_url property
2. `app/db/base.py` — DeclarativeBase
3. `app/db/session.py` — Engine + sessionmaker + get_db_session FastAPI dependency
4. `app/api/health.py` — health DB endpoint
5. `app/models/user.py` — User, AuthSession
6. `app/models/catalog.py` — Category, ProductType, Manufacturer, Product, ProductImage
7. `app/models/social.py` — Favorite, Review
8. `app/models/build.py` — SavedBuild, SavedBuildItem
9. `app/models/cart_order.py` — Cart, CartItem, Order, OrderItem
10. `app/models/__init__.py` — re-exports all models + Base
11. `app/__init__.py` — empty package marker
12. `app/api/__init__.py` — empty package marker
13. `tests/conftest.py` — shared DB session fixture
14. `tests/test_orm.py` — ORM mapping + product count + relationship tests
15. `tests/test_health.py` — HTTP health endpoint tests
16. `tests/__init__.py` — empty package marker

## Files Modified
1. `app/main.py` — added health router import and include_router
2. `alembic/env.py` — added target_metadata from ORM models

## Architecture

### ORM Layer
- `DeclarativeBase` subclass in `app/db/base.py`
- 14 model classes in `app/models/` organized by domain:
  - `user.py` — User, AuthSession
  - `catalog.py` — Category, ProductType, Manufacturer, Product, ProductImage
  - `social.py` — Favorite, Review
  - `build.py` — SavedBuild, SavedBuildItem
  - `cart_order.py` — Cart, CartItem, Order, OrderItem
- Circular imports resolved via `TYPE_CHECKING` + `from __future__ import annotations`
- Relationships use string quotes for forward references (SQLAlchemy convention)
- JSONB columns use `Mapped[list]` / `Mapped[dict]` with appropriate server defaults
- Computed column `line_total` in OrderItem uses `sa.Computed`
- UUID PK in AuthSession uses `func.gen_random_uuid()` server default
- All server defaults match the original migration exactly

### DB Session
- Single `Engine` per process with `pool_pre_ping=True`
- `sessionmaker` with `expire_on_commit=False`
- `get_db_session()` FastAPI dependency using `yield` pattern
- Engine URL built from `AppSettings` (pydantic-settings reading `POSTGRES_*` from `.env`)

### Health Endpoint
- `GET /health/db` executes `SELECT 1` through ORM Session
- Returns 200 with `{"status":"ok","database":"connected"}` on success
- Returns 503 with `{"detail":"database unavailable"}` on failure (no secrets)

## HTTP Verification Results
```
GET / → HTTP 200
{"message":"Backend is running!"}

GET /health/db → HTTP 200
{"status":"ok","database":"connected"}

GET /openapi.json → HTTP 200
Registered paths: /health/db, /
```

## ORM Verification
- `db_session.query(Product).count()` → 51 ✓
- `db_session.query(Product).filter(Product.slug == "gpu-rtx-4070-super").one_or_none()` → name="MSI GeForce RTX 4070 SUPER Gaming X Slim 12G", price=64990, color="Чёрный", graphics_chip_brand="NVIDIA" ✓
- Product relationships: product_type.category.slug="gpu", manufacturer.name="MSI" ✓
- JSONB fields: spec_lines=list, short_specs=list, technical_specs=dict ✓

## Test Results
```
tests/test_health.py .....  (5/5)
tests/test_orm.py .......... (10/10)
Total: 15 passed, 0 failed
```

## Alembic Result
```
$ alembic current
a1b2c3d4e5f6 (head)
```

## Remaining Issues
1. `seed.py` TRY004/SIM117 — pre-existing style warnings in original seed script (not our code)
2. `starlette.testclient` deprecation warning — downstream library, not our code
3. `pytest-asyncio` configuration warning — downstream library, not our code
