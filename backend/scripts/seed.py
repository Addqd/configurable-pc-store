"""Seed the PC Builder & Store demo catalog from the approved frontend fixtures.

Run from backend/ AFTER applying the initial Alembic migration:

    uv run alembic upgrade head
    uv run python scripts/seed.py

Does not create users, passwords, orders, reviews, favorites or cart data.
Uses psycopg 3 directly, without any SQLAlchemy ORM mappings.

Products are created without characteristic values; the normalized
`characteristics` / `product_characteristics` data is inserted by the dedicated
Alembic data revision, never by this script.

Idempotent and non-destructive: existing products with the same slug are left
unchanged, so rerunning will not overwrite manually edited catalog content.
"""

from __future__ import annotations

import hashlib
import re
from datetime import date
from pathlib import Path

import psycopg
from pydantic_settings import BaseSettings, SettingsConfigDict

ROOT_DIR = Path(__file__).resolve().parents[2]


class DatabaseSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    postgres_db: str
    postgres_user: str
    postgres_password: str
    postgres_host: str = "127.0.0.1"
    postgres_port: int = 55432


# Includes every *real* category key from frontend/src/data/catalogModel.ts.
# 'components' and 'sale' are UI filters, not catalog categories.
CATEGORIES: tuple[tuple[str, str], ...] = (
    ("prebuilt", "Готовые сборки"),
    ("peripheral", "Периферия"),
    ("accessories", "Аксессуары"),
    ("cooling", "Охлаждение"),
    ("network", "Сетевое оборудование"),
    ("software", "Софт и сервисы"),
    ("gpu", "Видеокарты"),
    ("cpu", "Процессоры"),
    ("mobo", "Материнские платы"),
    ("ram", "Оперативная память"),
    ("storage", "Накопители"),
    ("hdd", "Жёсткие диски"),
    ("case", "Корпуса"),
    ("psu", "Блоки питания"),
    ("monitor", "Мониторы"),
)


# id | slug | name | category name | type name | manufacturer | price in RUB
# | listed date | color | GPU chip brand
# Verified against frontend/src/data/mockProducts.ts, default branch, 2026-11-06.
# The demo prices are illustrative; this is not a real-world pricing source.
CATALOG_ROWS = """
1 | gaming-pc-powerplay | Игровой ПК PowerPlay | Готовые сборки | Игровые ПК | PC Builder | 89990 | 2026-08-21 | Чёрный |
2 | gaming-pc-ultra | Игровой ПК Ultra | Готовые сборки | Игровые ПК | PC Builder | 124990 | 2026-08-22 | Чёрный |
3 | gaming-pc-promax | Игровой ПК ProMax | Готовые сборки | Игровые ПК | PC Builder | 189990 | 2026-08-23 | Чёрный |
4 | streaming-pc-streamx | Стриминговый ПК StreamX | Готовые сборки | Игровые ПК | PC Builder | 159990 | 2026-08-24 | Чёрный |
5 | workstation-workpro | Рабочая станция WorkPro | Готовые сборки | Рабочие станции | PC Builder | 459990 | 2026-08-25 | Чёрный |
6 | compact-pc-minicube | Компактный ПК MiniCube | Готовые сборки | Мини-ПК | PC Builder | 64990 | 2026-08-26 | Чёрный |
7 | gpu-rtx-4070-super | MSI GeForce RTX 4070 SUPER Gaming X Slim 12G | Видеокарты | Игровая | MSI | 64990 | 2026-08-27 | Чёрный | NVIDIA
8 | gpu-rtx-4070-ti-super | ASUS GeForce RTX 4070 Ti SUPER TUF Gaming 16G | Видеокарты | Игровая | ASUS | 89990 | 2026-08-28 | Чёрный | NVIDIA
9 | gpu-rtx-4080-super | Gigabyte GeForce RTX 4080 SUPER Gaming OC 16G | Видеокарты | Игровая | Gigabyte | 109990 | 2026-08-29 | Чёрный | NVIDIA
10 | gpu-rx-7800-xt | Sapphire Radeon RX 7800 XT Nitro+ 16G | Видеокарты | Игровая | Sapphire | 54990 | 2026-08-30 | Чёрный | AMD
11 | gpu-rx-7900-gre | XFX Radeon RX 7900 GRE Merc 319 16G | Видеокарты | Игровая | XFX | 64990 | 2026-08-31 | Чёрный | AMD
12 | gpu-rtx-4090 | ASUS GeForce RTX 4090 ROG Strix 24G | Видеокарты | Игровая | ASUS | 189990 | 2026-09-01 | Чёрный | NVIDIA
13 | cpu-ryzen-5-7600 | AMD Ryzen 5 7600 | Процессоры | Desktop | AMD | 18990 | 2026-09-02 | Чёрный |
14 | cpu-ryzen-7-7800x3d | AMD Ryzen 7 7800X3D | Процессоры | Desktop | AMD | 34990 | 2026-09-03 | Чёрный |
15 | cpu-core-i5-14600kf | Intel Core i5-14600KF | Процессоры | Desktop | Intel | 24990 | 2026-09-04 | Чёрный |
16 | cpu-core-i7-14700kf | Intel Core i7-14700KF | Процессоры | Desktop | Intel | 38990 | 2026-09-05 | Чёрный |
17 | cpu-ryzen-9-7950x | AMD Ryzen 9 7950X | Процессоры | Desktop | AMD | 54990 | 2026-09-06 | Чёрный |
18 | cpu-core-i9-14900kf | Intel Core i9-14900KF | Процессоры | Desktop | Intel | 69990 | 2026-09-07 | Чёрный |
19 | mobo-msi-b650-tomahawk | MSI MAG B650 Tomahawk WiFi | Материнские платы | Стандартная | MSI | 22990 | 2026-09-08 | Чёрный |
20 | mobus-rog-strix-b650e-f | ASUS ROG Strix B650E-F Gaming WiFi | Материнские платы | Стандартная | ASUS | 34990 | 2026-09-09 | Чёрный |
21 | mobo-gigabyte-z790-aorus | Gigabyte Z790 AORUS Elite AX | Материнские платы | Стандартная | Gigabyte | 29990 | 2026-09-10 | Чёрный |
22 | mobo-msi-b760-tomahawk | MSI MAG B760 Tomahawk WiFi | Материнские платы | Стандартная | MSI | 18990 | 2026-09-11 | Чёрный |
23 | mobo-asus-tuf-z790 | ASUS TUF Gaming Z790-Plus WiFi | Материнские платы | Стандартная | ASUS | 32990 | 2026-09-12 | Чёрный |
24 | mobo-asrock-b650m-pro | ASRock B650M Pro RS | Материнские платы | Стандартная | ASRock | 16990 | 2026-09-13 | Чёрный |
25 | periph-logitech-g-pro-tkl | Logitech G Pro X TKL | Периферия | Клавиатуры | Logitech | 12990 | 2026-09-14 | Чёрный |
26 | periph-razer-deathadder-v3 | Razer DeathAdder V3 | Периферия | Мыши | Razer | 7990 | 2026-09-15 | Чёрный |
27 | periph-hyperx-cloud-iii | HyperX Cloud III | Периферия | Наушники | HyperX | 8990 | 2026-09-16 | Чёрный |
28 | acc-dxracer-f08 | DXRacer Formula F08 | Аксессуары | Кресла | DXRacer | 24990 | 2026-09-17 | Чёрный |
29 | cooling-deepcool-ak620 | DeepCool AK620 | Охлаждение | Кулеры | DeepCool | 6990 | 2026-09-18 | Серебристый |
30 | cooling-arctic-freezer-iii | ARCTIC Liquid Freezer III 360 | Охлаждение | СВО | ARCTIC | 12990 | 2026-09-19 | Чёрный |
31 | storage-samsung-990pro | Samsung 990 PRO 1 ТБ | Накопители | NVMe SSD | Samsung | 11990 | 2026-09-20 | Чёрный |
32 | storage-wd-black-sn850x | WD Black SN850X 2 ТБ | Накопители | NVMe SSD | Western Digital | 16990 | 2026-09-21 | Чёрный |
33 | ram-kingston-fury-32gb | Kingston FURY Beast 32 ГБ (2×16) DDR5-6000 | Оперативная память | DDR5 | Kingston | 12990 | 2026-09-22 | Чёрный |
34 | ram-gskill-trident-z5 | G.Skill Trident Z5 32 ГБ (2×16) DDR5-6400 | Оперативная память | DDR5 | G.Skill | 14990 | 2026-09-23 | Серебристый |
35 | case-lian-li-lancool-216 | Lian Li Lancool 216 | Корпуса | ATX | Lian Li | 10990 | 2026-09-24 | Чёрный |
36 | case-nzxt-h5-flow | NZXT H5 Flow | Корпуса | ATX | NZXT | 8990 | 2026-09-25 | Белый |
37 | psu-corsair-rm750e | Corsair RM750e 750 Вт | Блоки питания | Модульные | Corsair | 12990 | 2026-09-26 | Чёрный |
38 | psu-bequiet-pure-power-12 | be quiet! Pure Power 12 M 850W | Блоки питания | Модульные | be quiet! | 14990 | 2026-09-27 | Чёрный |
39 | hdd-seagate-barracuda-2tb | Seagate BarraCuda 2 ТБ | Жёсткие диски | 3.5" | Seagate | 6990 | 2026-09-28 | Чёрный |
40 | monitor-aoc-q27g2u | AOC 27" Q27G2U | Мониторы | IPS | AOC | 24990 | 2026-09-29 | Чёрный |
41 | gpu-zotac-rtx-4070-super | ZOTAC RTX 4070 SUPER Twin Edge | Видеокарты | Игровая | ZOTAC | 64990 | 2026-09-30 | Чёрный | NVIDIA
42 | gpu-inno3d-rtx-4070-super | INNO3D RTX 4070 SUPER Twin Edge | Видеокарты | Игровая | INNO3D | 62990 | 2026-10-01 | Чёрный | NVIDIA
43 | gpu-gainward-rtx-4070-ghost | Gainward RTX 4070 Ghost 12 ГБ | Видеокарты | Игровая | Gainward | 59990 | 2026-10-02 | Чёрный | NVIDIA
44 | cpu-ryzen-5-7600x | AMD Ryzen 5 7600X | Процессоры | Desktop | AMD | 21990 | 2026-10-03 | Чёрный |
45 | prebuilt-rtx-4070-super | Игровой ПК RTX 4070 SUPER | Готовые сборки | Игровые ПК | PC Builder | 169990 | 2026-10-04 | Чёрный |
46 | prebuilt-rtx-4070-white | Игровой ПК RTX 4070 White Edition | Готовые сборки | Игровые ПК | PC Builder | 159990 | 2026-10-05 | Белый |
47 | cooling-thermalright-pa120 | Thermalright Peerless Assassin 120 | Охлаждение | Кулеры | Thermalright | 4990 | 2026-10-06 | Серебристый |
48 | case-fractal-north | Fractal Design North | Корпуса | ATX | Fractal Design | 17990 | 2026-10-07 | Чёрный |
49 | monitor-lg-27gp850 | LG 27GP850-B | Мониторы | Nano IPS | LG | 29990 | 2026-10-08 | Чёрный |
50 | ram-corsair-vengeance-32gb | Corsair Vengeance 32 ГБ (2×16) DDR5-6000 | Оперативная память | DDR5 | Corsair | 11990 | 2026-10-09 | Чёрный |
51 | acc-lian-li-strimer-v2 | Lian Li Strimer Plus V2 24-pin | Аксессуары | Кабели | Lian Li | 5990 | 2026-10-10 | Серебристый |
"""


def parse_catalog() -> list[dict[str, object]]:
    products = []
    seen_ids: set[int] = set()
    seen_slugs: set[str] = set()
    for raw in CATALOG_ROWS.strip().splitlines():
        columns = [column.strip() for column in raw.split("|")]
        if len(columns) != 10:
            raise ValueError(f"Expected 10 catalog columns, got {len(columns)}: {raw}")
        (
            product_id,
            slug,
            name,
            category,
            subtype,
            manufacturer,
            price,
            listed_at,
            color,
            gpu,
        ) = columns
        identifier = int(product_id)
        if identifier in seen_ids or slug in seen_slugs:
            raise ValueError(f"Duplicate product ID/slug: {identifier}, {slug}")
        if category not in {name for _, name in CATEGORIES}:
            raise ValueError(f"Unknown product category: {category}")
        seen_ids.add(identifier)
        seen_slugs.add(slug)
        products.append(
            {
                "id": identifier,
                "slug": slug,
                "name": name,
                "category": category,
                "type": subtype,
                "manufacturer": manufacturer,
                "price": int(price),
                "listed_at": date.fromisoformat(listed_at),
                "color": color or None,
                "gpu": gpu or None,
            }
        )
    return products


def slug_for_label(label: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", label.casefold()).strip("-")
    if cleaned:
        return cleaned
    return "label-" + hashlib.sha256(label.encode("utf-8")).hexdigest()[:16]


def subtype_slug(label: str) -> str:
    # Category-scoped, language-independent stable key for non-Latin labels.
    return "type-" + hashlib.sha256(label.encode("utf-8")).hexdigest()[:16]


def seed() -> None:
    items = parse_catalog()
    settings = DatabaseSettings()
    with psycopg.connect(  # noqa: SIM117
        dbname=settings.postgres_db,
        user=settings.postgres_user,
        password=settings.postgres_password,
        host=settings.postgres_host,
        port=settings.postgres_port,
    ) as connection:
        with connection.cursor() as cursor:
            if (
                cursor.execute("SELECT to_regclass('public.products')").fetchone()[0]
                is None
            ):
                raise RuntimeError(
                    "The products table is absent; run 'uv run alembic upgrade head' first"
                )

            category_ids: dict[str, int] = {}
            for order, (slug, name) in enumerate(CATEGORIES):
                cursor.execute(
                    "INSERT INTO categories (slug, name, sort_order) VALUES (%s, %s, %s) "
                    "ON CONFLICT (slug) DO NOTHING",
                    (slug, name, order),
                )
                row = cursor.execute(
                    "SELECT id FROM categories WHERE slug = %s", (slug,)
                ).fetchone()
                if row is None:
                    raise RuntimeError(f"Unable to load category {slug}")
                category_ids[name] = row[0]

            manufacturer_ids: dict[str, int] = {}
            for name in sorted({str(item["manufacturer"]) for item in items}):
                slug = slug_for_label(name)
                cursor.execute(
                    "INSERT INTO manufacturers (slug, name) VALUES (%s, %s) "
                    "ON CONFLICT (slug) DO NOTHING",
                    (slug, name),
                )
                row = cursor.execute(
                    "SELECT id FROM manufacturers WHERE slug = %s", (slug,)
                ).fetchone()
                if row is None:
                    raise RuntimeError(f"Unable to load manufacturer {name}")
                manufacturer_ids[name] = row[0]

            type_ids: dict[tuple[str, str], int] = {}
            for name, subtype in sorted(
                {(str(item["category"]), str(item["type"])) for item in items}
            ):
                category_id = category_ids[name]
                slug = subtype_slug(subtype)
                cursor.execute(
                    "INSERT INTO product_types (category_id, slug, name) VALUES (%s, %s, %s) "
                    "ON CONFLICT (category_id, slug) DO NOTHING",
                    (category_id, slug, subtype),
                )
                row = cursor.execute(
                    "SELECT id FROM product_types WHERE category_id = %s AND slug = %s",
                    (category_id, slug),
                ).fetchone()
                if row is None:
                    raise RuntimeError(f"Unable to load product type {name}/{subtype}")
                type_ids[(name, subtype)] = row[0]

            inserted = 0
            for product in items:
                # All identity values are the original fixture IDs (1..51).
                # This allows a later API migration to preserve frontend product IDs.
                # Characteristics are NOT fabricated here: the normalized
                # definitions and values come from the Alembic data migration.
                cursor.execute(
                    """
                    INSERT INTO products (
                        id, product_type_id, manufacturer_id, slug, sku, name,
                        price, stock_quantity, color,
                        graphics_chip_brand, on_sale, listed_at
                    )
                    VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, FALSE, %s
                    )
                    ON CONFLICT (slug) DO NOTHING
                    """,
                    (
                        product["id"],
                        type_ids[(str(product["category"]), str(product["type"]))],
                        manufacturer_ids[str(product["manufacturer"])],
                        product["slug"],
                        f"DEMO-{product['id']:04d}",
                        product["name"],
                        product["price"],
                        10,  # illustrative demo inventory, not real stock data
                        product["color"],
                        product["gpu"],
                        product["listed_at"],
                    ),
                )
                inserted += cursor.rowcount

            # IDs are explicitly preserved to match the existing mock fixtures.
            # Move the identity sequence forward, even after repeated seed runs.
            cursor.execute(
                """
                SELECT setval(
                    pg_get_serial_sequence('products', 'id'),
                    GREATEST(COALESCE((SELECT MAX(id) FROM products), 1), 1),
                    EXISTS (SELECT 1 FROM products)
                )
                """
            )
            total = cursor.execute("SELECT count(*) FROM products").fetchone()[0]

    print(f"Seed complete: {inserted} new products, {total} total products.")
    print(
        "Created/verified 15 catalog categories and their existing product types/manufacturers."
    )
    print("No users, purchases, reviews or product images were fabricated.")
    print(
        "Product characteristics are not seeded here: they are inserted by the "
        "Alembic data revision with verified structured values."
    )


if __name__ == "__main__":
    seed()
