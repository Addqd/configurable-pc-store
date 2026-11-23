"""Seed normalized specifications for the 51 exported catalog products.

Revision ID: 7e2c9b4a51f0
Revises: 5d91c7e2a604

Source: data-1795448278110.csv (provided by project owner)
SHA256: 8e28348d5277c8f76a6f560b66604648a10021552bc567a7c4d7f70a48fd9d83

Self-contained DATA migration: does NOT read deleted legacy columns,
external CSV files, or application ORM classes. Does NOT modify categories or
existing products. Only populates characteristics / product_characteristics.

Import policy: retain sourced concrete attributes, normalize obvious synonyms,
convert measurements to numeric JSONB, preserve original typed technical_specs.
Exclude generic catalog metadata already stored on products, unverified/demo
claims and editorial instructions. The target schema has no evidence column.
No additional product facts have been fabricated. Verify against the source
export before running on a different catalog/database.
"""

from __future__ import annotations

import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "7e2c9b4a51f0"
down_revision: Union[str, Sequence[str], None] = "5d91c7e2a604"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Each category is located by stable slug, never by hard-coded category_id.
# (code, localized label, data_type, unit, display sort order, show_in_short)
CHARACTERISTICS = {
    "accessories": [
        ("color", "Цвет", "string", None, 0, False),
        ("upholstery_material", "Материал обивки", "string", None, 1, True),
        ("accessory_type", "Тип аксессуара", "string", None, 2, True),
        ("connector", "Особенность 3", "string", None, 3, True),
        ("naznachenie", "Назначение", "string", None, 4, False),
        ("lighting", "Подсветка", "string", None, 5, True),
    ],
    "case": [
        ("color", "Цвет", "string", None, 0, False),
        ("form_factor", "Форм-фактор", "string", None, 1, True),
        ("front_fan_count", "Фронтальные вентиляторы", "number", "шт.", 2, False),
        (
            "front_fan_size_mm",
            "Размер фронтального вентилятора",
            "number",
            "мм",
            3,
            False,
        ),
        ("bokovaya_panel", "Боковая панель", "string", None, 4, False),
        ("front_material", "Материал передней панели", "string", None, 5, True),
        (
            "supported_motherboard_form_factors",
            "Совместимые форм-факторы материнских плат",
            "string_list",
            None,
            6,
            False,
        ),
        (
            "supported_psu_form_factors",
            "Совместимые форм-факторы блоков питания",
            "string_list",
            None,
            7,
            False,
        ),
    ],
    "cooling": [
        ("color", "Цвет", "string", None, 0, False),
        ("cooling_type", "Тип охлаждения", "string", None, 1, True),
        ("fan_count", "Количество вентиляторов", "number", "шт.", 2, False),
        ("fan_size_mm", "Диаметр вентилятора", "number", "мм", 3, False),
        ("radiator_size_mm", "Размер радиатора", "number", "мм", 4, True),
        ("supported_sockets", "Совместимые сокеты", "string_list", None, 5, True),
    ],
    "cpu": [
        ("series", "Серия", "string", None, 0, False),
        ("architecture", "Архитектура", "string", None, 1, False),
        ("kodovoe_imya", "Кодовое имя", "string", None, 2, False),
        ("socket", "Сокет", "string", None, 3, True),
        ("cores", "Количество ядер", "number", None, 4, True),
        ("threads", "Количество потоков", "number", None, 5, True),
        ("base_clock_ghz", "Базовая частота", "number", "ГГц", 6, False),
        ("max_clock_ghz", "Максимальная частота", "number", "ГГц", 7, True),
        ("cache_l1_kb", "Кэш L1", "number", "КБ", 8, False),
        ("cache_l2_mb", "Кэш L2", "number", "МБ", 9, False),
        ("cache_l3_mb", "Кэш L3", "number", "МБ", 10, False),
        ("cpu_process", "Техпроцесс", "string", None, 11, False),
        ("thermal_design_power_w", "Теплопакет (TDP)", "number", "Вт", 12, True),
        ("max_temperature_c", "Максимальная температура", "number", "°C", 13, False),
        ("memory_type", "Тип оперативной памяти", "string_list", None, 14, False),
        ("memory_channels", "Каналы памяти", "number", "шт.", 15, False),
        (
            "supported_ram_speed_mhz",
            "Поддерживаемая частота памяти",
            "number",
            "МГц",
            16,
            False,
        ),
        ("pcie_version", "Версия PCI Express", "string", None, 17, False),
        ("has_integrated_graphics", "Встроенная графика", "boolean", None, 18, False),
        ("integrated_graphics", "Встроенная графика", "string", None, 19, False),
        ("integrated_gpu_cores", "Графических ядер", "number", "шт.", 20, False),
        ("integrated_gpu_clock_mhz", "Частота графики", "number", "МГц", 21, False),
        (
            "unlocked_multiplier",
            "Разблокированный множитель",
            "boolean",
            None,
            22,
            False,
        ),
        ("has_3d_vcache", "3D V-Cache", "boolean", None, 23, False),
        ("pokolenie", "Поколение", "string", None, 24, False),
        ("performance_cores", "P-ядра", "number", "шт.", 25, False),
        ("efficiency_cores", "E-ядра", "number", "шт.", 26, False),
        ("cache_smart_mb", "Кэш Intel Smart Cache", "number", "МБ", 27, False),
        (
            "processor_base_power_w",
            "Базовая мощность процессора",
            "number",
            "Вт",
            28,
            False,
        ),
        (
            "maximum_turbo_power_w",
            "Максимальная мощность Turbo",
            "number",
            "Вт",
            29,
            False,
        ),
        ("platform", "Платформа", "string", None, 30, False),
        ("model_id", "Идентификатор модели", "string", None, 31, False),
    ],
    "gpu": [
        ("color", "Цвет", "string", None, 0, False),
        ("graphics_chip_brand", "Бренд графического чипа", "string", None, 1, False),
        ("gpu_model", "Графический процессор", "string", None, 2, True),
        ("architecture", "Архитектура", "string", None, 3, False),
        ("cuda_cores", "Ядер CUDA", "number", None, 4, False),
        ("vram_gb", "Объём видеопамяти", "number", "ГБ", 5, True),
        ("vram_type", "Тип видеопамяти", "string", None, 6, True),
        ("memory_bus_bits", "Шина видеопамяти", "number", "бит", 7, True),
        ("memory_speed_gbps", "Скорость памяти", "number", "Гбит/с", 8, False),
        ("boost_clock_mhz", "Boost-частота", "number", "МГц", 9, True),
        ("extreme_clock_mhz", "Extreme Performance", "number", "МГц", 10, False),
        (
            "interface_detail",
            "Интерфейс подключения (подробно)",
            "string",
            None,
            11,
            False,
        ),
        ("display_outputs", "Выходы на монитор", "string", None, 12, False),
        ("max_monitors", "Количество мониторов", "number", "шт.", 13, False),
        ("max_resolution", "Макс. разрешение", "string", None, 14, False),
        ("max_power_draw_w", "Потребление", "number", "Вт", 15, False),
        (
            "required_power_connectors",
            "Требуемые разъёмы питания GPU",
            "string_list",
            None,
            16,
            False,
        ),
        ("recommended_psu_w", "Рекомендуемая мощность БП", "number", "Вт", 17, False),
        ("dimensions_mm", "Габариты", "number_list", "мм", 18, False),
        ("weight_g", "Масса", "number", "г", 19, False),
        ("cooling_system", "Система охлаждения", "string", None, 20, False),
        ("directx", "DirectX", "string", None, 21, False),
        ("opengl", "OpenGL", "string", None, 22, False),
        ("gpu_technology", "Технология / Boost", "string", None, 23, False),
        ("igrovaya_lineyka", "Игровая линейка", "string", None, 24, False),
        ("series", "Серия", "string", None, 25, False),
        ("length_mm", "Длина", "number", "мм", 26, False),
        ("thickness_slots", "thickness_slots", "number", "слот", 27, False),
        ("interface", "Интерфейс", "string", None, 28, False),
    ],
    "hdd": [
        ("interface", "Интерфейс", "string", None, 0, True),
        ("rpm", "Скорость вращения", "number", "об/мин", 1, True),
        ("cache_mb", "Буфер", "number", "МБ", 2, False),
        ("capacity_gb", "Объём", "number", "ГБ", 3, True),
    ],
    "mobo": [
        ("socket", "Сокет", "string", None, 0, True),
        ("memory_type", "Тип оперативной памяти", "string", None, 1, True),
        ("form_factor", "Форм-фактор", "string", None, 2, True),
        ("additional_interface", "Дополнительный интерфейс", "string", None, 3, False),
        ("chipset", "Чипсет", "string", None, 4, True),
        ("series", "Серия", "string", None, 5, False),
        ("wireless", "Беспроводная связь", "string", None, 6, False),
        ("expansion_interface", "Интерфейс расширения", "string", None, 7, False),
        ("ram_slots", "Слотов оперативной памяти", "number", "шт.", 8, True),
        ("max_memory_gb", "Максимум памяти", "number", "ГБ", 9, False),
        (
            "storage_interfaces",
            "Интерфейсы накопителей",
            "string_list",
            None,
            10,
            False,
        ),
        ("gpu_interfaces", "Интерфейсы видеокарт", "string_list", None, 11, False),
        (
            "supported_nvme_lengths_mm",
            "Поддерживаемые длины NVMe",
            "number_list",
            "мм",
            12,
            False,
        ),
        (
            "required_cpu_power_connectors",
            "Питание процессора",
            "string_list",
            None,
            13,
            False,
        ),
        (
            "required_board_power_connectors",
            "Питание материнской платы",
            "string_list",
            None,
            14,
            False,
        ),
    ],
    "monitor": [
        ("color", "Цвет", "string", None, 0, False),
        ("diagonal_inch", "Диагональ", "number", "дюйм", 1, True),
        ("panel_type", "Тип матрицы", "string", None, 2, True),
        ("resolution", "Разрешение", "string", None, 3, True),
        ("refresh_rate_hz", "Частота обновления", "number", "Гц", 4, True),
        ("response_time_ms", "Время отклика", "number", "мс", 5, False),
    ],
    "peripheral": [
        ("color", "Цвет", "string", None, 0, False),
        ("switch_mechanism", "Механизм переключателей", "string", None, 1, False),
        ("switch_model", "Модель переключателей", "string", None, 2, True),
        ("lighting", "Подсветка", "string", None, 3, False),
        ("keyboard_layout", "Формат клавиатуры", "string", None, 4, True),
        ("connection", "Подключение", "string", None, 5, True),
        ("sensor_dpi", "Разрешение сенсора (макс.)", "number", "DPI", 6, True),
        ("sensor", "Особенность 3", "string", None, 7, False),
        ("driver_diameter_mm", "Диаметр излучателей", "number", "мм", 8, True),
        ("surround_format", "Формат звука", "string", None, 9, False),
        ("zvuchanie", "Звучание", "string", None, 10, False),
    ],
    "prebuilt": [
        ("color", "Цвет", "string", None, 0, False),
        ("cpu_description", "Процессор", "string", None, 1, True),
        ("architecture", "Архитектура", "string", None, 2, False),
        ("cores", "Количество ядер", "number", None, 3, False),
        ("threads", "Количество потоков", "number", None, 4, False),
        ("base_clock_ghz", "Базовая частота", "number", "ГГц", 5, False),
        ("max_clock_ghz", "Максимальная частота", "number", "ГГц", 6, False),
        ("socket", "Сокет", "string", None, 7, False),
        ("gpu_description", "Видеокарта", "string", None, 8, True),
        ("ram_capacity_gb", "Объём оперативной памяти", "number", "ГБ", 9, True),
        ("memory_type", "Тип оперативной памяти", "string", None, 10, True),
        ("storage_capacity_gb", "Объём накопителя", "number", "ГБ", 11, True),
        ("storage_type", "Тип накопителя", "string", None, 12, False),
        ("osobennost_cpu", "Особенность CPU", "string", None, 13, False),
        ("ecc_memory", "ECC память", "boolean", None, 14, False),
        ("platform", "Платформа", "string", None, 15, False),
    ],
    "psu": [
        ("wattage_w", "Мощность", "number", "Вт", 0, True),
        ("efficiency_rating", "Сертификат эффективности", "string", None, 1, True),
        ("psu_standard", "Стандарт", "string", None, 2, True),
        ("cabling", "Кабельная система", "string", None, 3, False),
        ("length_mm", "Длина", "number", "мм", 4, False),
        ("form_factor", "Форм-фактор", "string", None, 5, True),
        (
            "available_cpu_power_connectors",
            "Разъёмы питания CPU",
            "string_list",
            None,
            6,
            False,
        ),
        (
            "available_gpu_power_connectors",
            "Разъёмы питания GPU",
            "string_list",
            None,
            7,
            False,
        ),
        (
            "available_board_power_connectors",
            "Разъёмы питания платы",
            "string_list",
            None,
            8,
            False,
        ),
    ],
    "ram": [
        ("color", "Цвет", "string", None, 0, False),
        ("frequency_mhz", "Частота", "number", "МГц", 1, True),
        ("cas_latency", "CAS Latency", "number", None, 2, True),
        ("lighting", "Подсветка", "string", None, 3, False),
        ("module_count", "Количество модулей", "number", "шт.", 4, True),
        ("module_size_gb", "Ёмкость модуля", "number", "ГБ", 5, False),
        ("capacity_gb", "Объём", "number", "ГБ", 6, True),
        ("memory_type", "Тип оперативной памяти", "string", None, 7, True),
        ("heatspreader_color", "Цвет радиатора", "string", None, 8, False),
    ],
    "storage": [
        (
            "interface_detail",
            "Интерфейс подключения (подробно)",
            "string",
            None,
            0,
            False,
        ),
        ("read_speed_mb_s", "Макс. скорость чтения", "number", "МБ/с", 1, True),
        ("drive_form_factor", "Форм-фактор накопителя", "string", None, 2, True),
        ("write_speed_mb_s", "Макс. скорость записи", "number", "МБ/с", 3, False),
        ("nand_type", "Тип флеш-памяти", "string", None, 4, False),
        ("dram_cache_gb", "Объём DRAM-кэша", "number", "ГБ", 5, False),
        ("dram_cache_type", "Тип DRAM-кэша", "string", None, 6, False),
        ("capacity_gb", "Объём", "number", "ГБ", 7, True),
        ("interface", "Интерфейс", "string", None, 8, True),
        ("length_mm", "Длина", "number", "мм", 9, False),
    ],
}

# Product IDs and names are compared against the database before inserting.
# Each value uses the canonical characteristic code for its product category.
# product_id: (expected product name, expected category slug, [(code, JSON value)])
PRODUCTS = {
    1: (
        "Игровой ПК PowerPlay",
        "prebuilt",
        [
            ("color", "Чёрный"),
            ("cpu_description", "AMD Ryzen 7 5700X"),
            ("architecture", "Zen 3"),
            ("cores", 8),
            ("threads", 16),
            ("base_clock_ghz", 3.4),
            ("max_clock_ghz", 4.6),
            ("socket", "am4"),
            ("gpu_description", "NVIDIA GeForce RTX 4060 Ti"),
        ],
    ),
    2: (
        "Игровой ПК Ultra",
        "prebuilt",
        [
            ("color", "Чёрный"),
            ("cpu_description", "Intel Core i5-14600KF"),
            ("gpu_description", "NVIDIA GeForce RTX 4070"),
            ("ram_capacity_gb", 32),
            ("memory_type", "ddr5"),
            ("storage_capacity_gb", 1024),
            ("storage_type", "nvme"),
            ("socket", "lga1700"),
        ],
    ),
    3: (
        "Игровой ПК ProMax",
        "prebuilt",
        [
            ("color", "Чёрный"),
            ("cpu_description", "AMD Ryzen 9 7900X"),
            ("gpu_description", "NVIDIA GeForce RTX 4080"),
            ("ram_capacity_gb", 64),
            ("memory_type", "ddr5"),
            ("storage_capacity_gb", 2048),
            ("storage_type", "nvme"),
            ("socket", "am5"),
        ],
    ),
    4: (
        "Стриминговый ПК StreamX",
        "prebuilt",
        [
            ("color", "Чёрный"),
            ("cpu_description", "AMD Ryzen 7 7800X3D"),
            ("gpu_description", "NVIDIA GeForce RTX 4070 Ti"),
            ("ram_capacity_gb", 32),
            ("memory_type", "ddr5"),
            ("storage_capacity_gb", 2048),
            ("storage_type", "nvme"),
            ("osobennost_cpu", "3D V-Cache"),
        ],
    ),
    5: (
        "Рабочая станция WorkPro",
        "prebuilt",
        [
            ("color", "Чёрный"),
            ("cpu_description", "AMD Threadripper PRO 7945WX"),
            ("gpu_description", "NVIDIA RTX 6000"),
            ("ram_capacity_gb", 128),
            ("memory_type", "ddr5"),
            ("ecc_memory", True),
            ("storage_capacity_gb", 4096),
            ("storage_type", "nvme"),
            ("platform", "AMD Threadripper PRO"),
        ],
    ),
    6: (
        "Компактный ПК MiniCube",
        "prebuilt",
        [
            ("color", "Чёрный"),
            ("cpu_description", "AMD Ryzen 5 7600"),
            ("gpu_description", "AMD Radeon RX 7600 XT"),
            ("ram_capacity_gb", 16),
            ("memory_type", "ddr5"),
            ("storage_capacity_gb", 512),
            ("storage_type", "nvme"),
            ("socket", "am5"),
        ],
    ),
    7: (
        "MSI GeForce RTX 4070 SUPER Gaming X Slim 12G",
        "gpu",
        [
            ("color", "Чёрный"),
            ("graphics_chip_brand", "NVIDIA"),
            ("gpu_model", "GeForce RTX 4070 SUPER"),
            ("architecture", "NVIDIA Ada Lovelace"),
            ("cuda_cores", 7168),
            ("vram_gb", 12),
            ("vram_type", "GDDR6X"),
            ("memory_bus_bits", 192),
            ("memory_speed_gbps", 21),
            ("boost_clock_mhz", 2640),
            ("extreme_clock_mhz", 2655),
            ("interface_detail", "PCI Express 4.0"),
            ("display_outputs", "3 × DisplayPort 1.4a, 1 × HDMI 2.1a"),
            ("max_monitors", 4),
            ("max_resolution", "7680 × 4320"),
            ("max_power_draw_w", 245),
            ("required_power_connectors", ["pcie-16pin"]),
            ("recommended_psu_w", 650),
            ("dimensions_mm", [307.0, 125.0, 46.0]),
            ("weight_g", 972),
            ("cooling_system", "MSI TRI FROZR 3"),
            ("directx", "12 Ultimate"),
            ("opengl", "4.6"),
        ],
    ),
    8: (
        "ASUS GeForce RTX 4070 Ti SUPER TUF Gaming 16G",
        "gpu",
        [
            ("color", "Чёрный"),
            ("graphics_chip_brand", "NVIDIA"),
            ("vram_gb", 16),
            ("vram_type", "GDDR6X"),
            ("memory_bus_bits", 256),
            ("gpu_technology", "DLSS 3"),
            ("gpu_model", "GeForce RTX 4070 Ti SUPER"),
            ("igrovaya_lineyka", "ASUS TUF Gaming"),
        ],
    ),
    9: (
        "Gigabyte GeForce RTX 4080 SUPER Gaming OC 16G",
        "gpu",
        [
            ("color", "Чёрный"),
            ("graphics_chip_brand", "NVIDIA"),
            ("vram_gb", 16),
            ("vram_type", "GDDR6X"),
            ("memory_bus_bits", 256),
            ("gpu_technology", "DLSS 3"),
            ("gpu_model", "GeForce RTX 4080 SUPER"),
            ("series", "Gaming OC"),
        ],
    ),
    10: (
        "Sapphire Radeon RX 7800 XT Nitro+ 16G",
        "gpu",
        [
            ("color", "Чёрный"),
            ("graphics_chip_brand", "AMD"),
            ("vram_gb", 16),
            ("vram_type", "GDDR6"),
            ("memory_bus_bits", 256),
            ("gpu_technology", "FSR"),
            ("gpu_model", "Radeon RX 7800 XT"),
            ("series", "Sapphire NITRO+"),
        ],
    ),
    11: (
        "XFX Radeon RX 7900 GRE Merc 319 16G",
        "gpu",
        [
            ("color", "Чёрный"),
            ("graphics_chip_brand", "AMD"),
            ("vram_gb", 16),
            ("vram_type", "GDDR6"),
            ("memory_bus_bits", 256),
            ("gpu_technology", "FSR"),
            ("gpu_model", "Radeon RX 7900 GRE"),
            ("series", "XFX MERC 319"),
        ],
    ),
    12: (
        "ASUS GeForce RTX 4090 ROG Strix 24G",
        "gpu",
        [
            ("color", "Чёрный"),
            ("graphics_chip_brand", "NVIDIA"),
            ("vram_gb", 24),
            ("vram_type", "GDDR6X"),
            ("memory_bus_bits", 384),
            ("gpu_technology", "DLSS 3"),
            ("gpu_model", "GeForce RTX 4090"),
            ("series", "ASUS ROG Strix"),
        ],
    ),
    13: (
        "AMD Ryzen 5 7600",
        "cpu",
        [
            ("series", "Ryzen 7000"),
            ("architecture", "Zen 4"),
            ("kodovoe_imya", "Raphael"),
            ("socket", "am5"),
            ("cores", 6),
            ("threads", 12),
            ("base_clock_ghz", 3.8),
            ("max_clock_ghz", 5.1),
            ("cache_l1_kb", 384),
            ("cache_l2_mb", 6),
            ("cache_l3_mb", 32),
            ("cpu_process", "TSMC 5 нм"),
            ("thermal_design_power_w", 65),
            ("max_temperature_c", 95),
            ("memory_type", ["ddr5"]),
            ("memory_channels", 2),
            ("supported_ram_speed_mhz", 5200),
            ("pcie_version", "5.0"),
            ("has_integrated_graphics", True),
            ("integrated_graphics", "AMD Radeon Graphics"),
            ("integrated_gpu_cores", 2),
            ("integrated_gpu_clock_mhz", 2200),
            ("unlocked_multiplier", True),
        ],
    ),
    14: (
        "AMD Ryzen 7 7800X3D",
        "cpu",
        [
            ("cores", 8),
            ("threads", 16),
            ("max_clock_ghz", 5),
            ("socket", "am5"),
            ("architecture", "AMD Zen 4"),
            ("base_clock_ghz", 4.2),
            ("cache_l3_mb", 96),
            ("thermal_design_power_w", 120),
            ("has_3d_vcache", True),
            ("max_temperature_c", 89),
            ("memory_type", ["ddr5"]),
        ],
    ),
    15: (
        "Intel Core i5-14600KF",
        "cpu",
        [
            ("cores", 14),
            ("threads", 20),
            ("max_clock_ghz", 5.3),
            ("socket", "lga1700"),
            ("pokolenie", "Intel Core 14"),
            ("performance_cores", 6),
            ("efficiency_cores", 8),
            ("cache_smart_mb", 24),
            ("processor_base_power_w", 125),
            ("maximum_turbo_power_w", 181),
            ("has_integrated_graphics", False),
            ("memory_type", ["ddr4", "ddr5"]),
        ],
    ),
    16: (
        "Intel Core i7-14700KF",
        "cpu",
        [
            ("cores", 20),
            ("threads", 28),
            ("max_clock_ghz", 5.6),
            ("socket", "lga1700"),
            ("pokolenie", "Intel Core 14"),
            ("performance_cores", 8),
            ("efficiency_cores", 12),
            ("cache_smart_mb", 33),
            ("processor_base_power_w", 125),
            ("maximum_turbo_power_w", 253),
            ("has_integrated_graphics", False),
            ("memory_type", ["ddr4", "ddr5"]),
        ],
    ),
    17: (
        "AMD Ryzen 9 7950X",
        "cpu",
        [
            ("cores", 16),
            ("threads", 32),
            ("max_clock_ghz", 5.7),
            ("socket", "am5"),
            ("architecture", "AMD Zen 4"),
            ("base_clock_ghz", 4.5),
            ("cache_l3_mb", 64),
            ("thermal_design_power_w", 170),
            ("pcie_version", "5.0"),
            ("has_integrated_graphics", True),
            ("integrated_graphics", "AMD Radeon Graphics"),
            ("memory_type", ["ddr5"]),
        ],
    ),
    18: (
        "Intel Core i9-14900KF",
        "cpu",
        [
            ("cores", 24),
            ("threads", 32),
            ("max_clock_ghz", 6),
            ("socket", "lga1700"),
            ("pokolenie", "Intel Core 14"),
            ("performance_cores", 8),
            ("efficiency_cores", 16),
            ("cache_smart_mb", 36),
            ("processor_base_power_w", 125),
            ("maximum_turbo_power_w", 253),
            ("has_integrated_graphics", False),
            ("memory_type", ["ddr4", "ddr5"]),
        ],
    ),
    19: (
        "MSI MAG B650 Tomahawk WiFi",
        "mobo",
        [
            ("socket", "am5"),
            ("memory_type", "ddr5"),
            ("form_factor", "atx"),
            ("additional_interface", "WiFi 6E"),
            ("chipset", "AMD B650"),
            ("series", "MSI MAG TOMAHAWK"),
            ("wireless", "Wi-Fi 6E"),
        ],
    ),
    20: (
        "ASUS ROG Strix B650E-F Gaming WiFi",
        "mobo",
        [
            ("socket", "am5"),
            ("memory_type", "ddr5"),
            ("form_factor", "atx"),
            ("additional_interface", "PCIe 5.0"),
            ("chipset", "AMD B650E"),
            ("series", "ROG STRIX Gaming"),
            ("expansion_interface", "PCIe 5.0"),
        ],
    ),
    21: (
        "Gigabyte Z790 AORUS Elite AX",
        "mobo",
        [
            ("socket", "lga1700"),
            ("memory_type", "ddr5"),
            ("form_factor", "atx"),
            ("additional_interface", "WiFi 6E"),
            ("chipset", "Intel Z790"),
            ("series", "AORUS Elite AX"),
            ("wireless", "Wi-Fi 6E"),
        ],
    ),
    22: (
        "MSI MAG B760 Tomahawk WiFi",
        "mobo",
        [
            ("socket", "lga1700"),
            ("memory_type", "ddr5"),
            ("form_factor", "atx"),
            ("additional_interface", "WiFi 6E"),
            ("chipset", "Intel B760"),
            ("series", "MSI MAG TOMAHAWK"),
            ("wireless", "Wi-Fi 6E"),
        ],
    ),
    23: (
        "ASUS TUF Gaming Z790-Plus WiFi",
        "mobo",
        [
            ("socket", "lga1700"),
            ("memory_type", "ddr5"),
            ("form_factor", "atx"),
            ("additional_interface", "WiFi 6"),
            ("chipset", "Intel Z790"),
            ("series", "ASUS TUF Gaming"),
            ("wireless", "Wi-Fi 6"),
        ],
    ),
    24: (
        "ASRock B650M Pro RS",
        "mobo",
        [
            ("socket", "am5"),
            ("memory_type", "ddr5"),
            ("form_factor", "matx"),
            ("chipset", "AMD B650"),
            ("ram_slots", 4),
            ("max_memory_gb", 256),
            ("storage_interfaces", ["nvme", "sata"]),
            ("gpu_interfaces", ["pcie-x16"]),
            ("supported_nvme_lengths_mm", [60, 80]),
            ("required_cpu_power_connectors", ["cpu-8pin"]),
            ("required_board_power_connectors", ["atx-24pin"]),
        ],
    ),
    25: (
        "Logitech G Pro X TKL",
        "peripheral",
        [
            ("color", "Чёрный"),
            ("switch_mechanism", "Механическая"),
            ("switch_model", "GX Switch"),
            ("lighting", "RGB"),
            ("keyboard_layout", "TKL, без цифрового блока"),
        ],
    ),
    26: (
        "Razer DeathAdder V3",
        "peripheral",
        [
            ("color", "Чёрный"),
            ("connection", "Проводное"),
            ("sensor_dpi", 30000),
            ("sensor", "Focus Pro"),
        ],
    ),
    27: (
        "HyperX Cloud III",
        "peripheral",
        [
            ("color", "Чёрный"),
            ("connection", "Проводное"),
            ("driver_diameter_mm", 53),
            ("surround_format", "7.1"),
            ("zvuchanie", "Виртуальное 7.1 (по исходной записи)"),
        ],
    ),
    28: (
        "DXRacer Formula F08",
        "accessories",
        [
            ("color", "Чёрный"),
            ("upholstery_material", "Искусственная кожа"),
            ("accessory_type", "Игровое кресло"),
        ],
    ),
    29: (
        "DeepCool AK620",
        "cooling",
        [
            ("color", "Серебристый"),
            ("cooling_type", "air"),
            ("fan_count", 2),
            ("fan_size_mm", 120),
        ],
    ),
    30: (
        "ARCTIC Liquid Freezer III 360",
        "cooling",
        [
            ("color", "Чёрный"),
            ("cooling_type", "liquid"),
            ("radiator_size_mm", 360),
            ("supported_sockets", ["lga1851", "lga1700", "am5", "am4"]),
        ],
    ),
    31: (
        "Samsung 990 PRO 1 ТБ",
        "storage",
        [
            ("interface_detail", "PCIe 4.0 ×4 / NVMe 2.0"),
            ("read_speed_mb_s", 7450),
            ("drive_form_factor", "m2-2280"),
            ("write_speed_mb_s", 6900),
            ("nand_type", "Samsung V-NAND TLC"),
            ("dram_cache_gb", 1),
            ("dram_cache_type", "LPDDR4"),
            ("capacity_gb", 1024),
        ],
    ),
    32: (
        "WD Black SN850X 2 ТБ",
        "storage",
        [
            ("interface_detail", "PCIe 4.0 x4 / NVMe"),
            ("read_speed_mb_s", 7300),
            ("drive_form_factor", "m2-2280"),
            ("capacity_gb", 2048),
            ("interface", "nvme"),
            ("length_mm", 80),
        ],
    ),
    33: (
        "Kingston FURY Beast 32 ГБ (2×16) DDR5-6000",
        "ram",
        [
            ("color", "Чёрный"),
            ("frequency_mhz", 6000),
            ("cas_latency", 30),
            ("lighting", "RGB"),
            ("module_count", 2),
            ("module_size_gb", 16),
            ("capacity_gb", 32),
            ("memory_type", "ddr5"),
        ],
    ),
    34: (
        "G.Skill Trident Z5 32 ГБ (2×16) DDR5-6400",
        "ram",
        [
            ("color", "Серебристый"),
            ("frequency_mhz", 6400),
            ("cas_latency", 30),
            ("lighting", "RGB"),
            ("heatspreader_color", "Серебристый"),
            ("module_count", 2),
            ("module_size_gb", 16),
            ("capacity_gb", 32),
            ("memory_type", "ddr5"),
        ],
    ),
    35: (
        "Lian Li Lancool 216",
        "case",
        [
            ("color", "Чёрный"),
            ("form_factor", "atx"),
            ("front_fan_count", 2),
            ("front_fan_size_mm", 160),
        ],
    ),
    36: (
        "NZXT H5 Flow",
        "case",
        [
            ("color", "Белый"),
            ("form_factor", "atx"),
            ("front_fan_count", 2),
            ("front_fan_size_mm", 120),
            ("bokovaya_panel", "Закалённое стекло"),
        ],
    ),
    37: (
        "Corsair RM750e 750 Вт",
        "psu",
        [
            ("wattage_w", 750),
            ("efficiency_rating", "80 PLUS Gold"),
            ("psu_standard", "ATX 3.0"),
            ("cabling", "Модульная"),
        ],
    ),
    38: (
        "be quiet! Pure Power 12 M 850W",
        "psu",
        [
            ("wattage_w", 850),
            ("efficiency_rating", "80 PLUS Gold"),
            ("psu_standard", "ATX 3.0"),
            ("cabling", "Модульная"),
            ("length_mm", 160),
            ("form_factor", "atx"),
            ("available_cpu_power_connectors", ["cpu-8pin", "cpu-8pin"]),
            (
                "available_gpu_power_connectors",
                ["pcie-8pin", "pcie-8pin", "pcie-8pin", "pcie-8pin"],
            ),
            ("available_board_power_connectors", ["atx-24pin"]),
        ],
    ),
    39: (
        "Seagate BarraCuda 2 ТБ",
        "hdd",
        [
            ("interface", "sata"),
            ("rpm", 7200),
            ("cache_mb", 256),
            ("capacity_gb", 2048),
        ],
    ),
    40: (
        'AOC 27" Q27G2U',
        "monitor",
        [
            ("color", "Чёрный"),
            ("diagonal_inch", 27),
            ("panel_type", "IPS"),
            ("resolution", "2560 × 1440"),
            ("refresh_rate_hz", 144),
            ("response_time_ms", 1),
        ],
    ),
    41: (
        "ZOTAC RTX 4070 SUPER Twin Edge",
        "gpu",
        [
            ("color", "Чёрный"),
            ("graphics_chip_brand", "NVIDIA"),
            ("vram_gb", 12),
            ("vram_type", "GDDR6X"),
            ("memory_bus_bits", 192),
            ("gpu_model", "GeForce RTX 4070 SUPER"),
            ("series", "ZOTAC Twin Edge"),
            ("boost_clock_mhz", 2495),
        ],
    ),
    42: (
        "INNO3D RTX 4070 SUPER Twin Edge",
        "gpu",
        [
            ("color", "Чёрный"),
            ("graphics_chip_brand", "NVIDIA"),
            ("vram_gb", 12),
            ("vram_type", "GDDR6X"),
            ("memory_bus_bits", 192),
            ("gpu_model", "GeForce RTX 4070 SUPER"),
            ("series", "Twin Edge (по каталогу)"),
            ("boost_clock_mhz", 2490),
        ],
    ),
    43: (
        "Gainward RTX 4070 Ghost 12 ГБ",
        "gpu",
        [
            ("color", "Чёрный"),
            ("graphics_chip_brand", "NVIDIA"),
            ("vram_gb", 12),
            ("vram_type", "GDDR6X"),
            ("memory_bus_bits", 192),
            ("gpu_model", "GeForce RTX 4070"),
            ("length_mm", 269.1),
            ("thickness_slots", 2),
            ("required_power_connectors", ["pcie-8pin"]),
            ("boost_clock_mhz", 2475),
            ("interface", "pcie-x16"),
        ],
    ),
    44: (
        "AMD Ryzen 5 7600X",
        "cpu",
        [
            ("cores", 6),
            ("threads", 12),
            ("max_clock_ghz", 5.3),
            ("socket", "am5"),
            ("architecture", "AMD Zen 4"),
            ("base_clock_ghz", 4.7),
            ("cache_l3_mb", 32),
            ("thermal_design_power_w", 105),
            ("platform", "AM5 / DDR5"),
            ("unlocked_multiplier", True),
            ("memory_type", ["ddr5"]),
            ("model_id", "ryzen-5-7600x"),
        ],
    ),
    45: (
        "Игровой ПК RTX 4070 SUPER",
        "prebuilt",
        [
            ("color", "Чёрный"),
            ("cpu_description", "Core i7-13700KF"),
            ("gpu_description", "NVIDIA GeForce RTX 4070 SUPER"),
            ("ram_capacity_gb", 32),
            ("memory_type", "ddr5"),
            ("storage_capacity_gb", 1024),
            ("storage_type", "ssd"),
            ("socket", "lga1700"),
        ],
    ),
    46: (
        "Игровой ПК RTX 4070 White Edition",
        "prebuilt",
        [
            ("color", "Белый"),
            ("cpu_description", "Ryzen 7 7800X3D"),
            ("gpu_description", "NVIDIA GeForce RTX 4070"),
            ("ram_capacity_gb", 32),
            ("memory_type", "ddr5"),
            ("storage_capacity_gb", 1024),
            ("storage_type", "ssd"),
            ("socket", "am5"),
        ],
    ),
    47: (
        "Thermalright Peerless Assassin 120",
        "cooling",
        [
            ("color", "Серебристый"),
            ("cooling_type", "air"),
            ("fan_count", 2),
            ("fan_size_mm", 120),
        ],
    ),
    48: (
        "Fractal Design North",
        "case",
        [
            ("color", "Чёрный"),
            ("form_factor", "atx"),
            ("front_material", "Деревянные элементы"),
            ("supported_motherboard_form_factors", ["atx", "matx", "mini-itx"]),
            ("supported_psu_form_factors", ["atx"]),
        ],
    ),
    49: (
        "LG 27GP850-B",
        "monitor",
        [
            ("color", "Чёрный"),
            ("diagonal_inch", 27),
            ("panel_type", "Nano IPS"),
            ("resolution", "2560 × 1440"),
            ("refresh_rate_hz", 180),
        ],
    ),
    50: (
        "Corsair Vengeance 32 ГБ (2×16) DDR5-6000",
        "ram",
        [
            ("color", "Чёрный"),
            ("frequency_mhz", 6000),
            ("cas_latency", 36),
            ("heatspreader_color", "Чёрный"),
            ("module_count", 2),
            ("module_size_gb", 16),
            ("capacity_gb", 32),
            ("memory_type", "ddr5"),
        ],
    ),
    51: (
        "Lian Li Strimer Plus V2 24-pin",
        "accessories",
        [
            ("color", "Серебристый"),
            ("accessory_type", "кабель питания"),
            ("connector", "24-pin"),
            ("naznachenie", "Декоративный удлинитель питания ATX 24-pin"),
            ("lighting", "RGB"),
        ],
    ),
}

EXPECTED_CHARACTERISTICS = 161
EXPECTED_VALUES = 411


def _value_type(value: object) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float)):
        return "number"
    if isinstance(value, str):
        return "string"
    if isinstance(value, list) and value and all(isinstance(v, str) for v in value):
        return "string_list"
    if (
        isinstance(value, list)
        and value
        and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in value)
    ):
        return "number_list"
    raise RuntimeError(f"Unsupported characteristic value: {value!r}")


def upgrade() -> None:
    connection = op.get_bind()
    if (
        len(PRODUCTS) != 51
        or sum(map(len, CHARACTERISTICS.values())) != EXPECTED_CHARACTERISTICS
    ):
        raise RuntimeError("Embedded catalog definition count mismatch")
    if sum(len(specs) for _, _, specs in PRODUCTS.values()) != EXPECTED_VALUES:
        raise RuntimeError("Embedded catalog value count mismatch")

    # This revision initializes the newly created normalized tables only.
    # Refuse to overwrite any pre-existing characteristic definitions or values.
    for table in ("characteristics", "product_characteristics"):
        count = connection.execute(
            sa.select(sa.func.count()).select_from(sa.table(table))
        ).scalar_one()
        if count != 0:
            raise RuntimeError(
                f"{table} is not empty ({count} rows); refusing to overwrite data"
            )

    categories = dict(
        connection.execute(sa.text("SELECT slug, id FROM categories")).all()
    )
    missing_categories = set(CHARACTERISTICS) - set(categories)
    if missing_categories:
        raise RuntimeError(f"Missing categories: {sorted(missing_categories)}")

    # Fail before any INSERT if a catalog entry has moved, been renamed or
    # been assigned to a different category since the supplied CSV export.
    current = {
        row.id: (row.name, row.slug)
        for row in connection.execute(
            sa.text("""
        SELECT p.id AS id, p.name AS name, c.slug AS slug
        FROM products AS p
        JOIN product_types AS pt ON pt.id = p.product_type_id
        JOIN categories AS c ON c.id = pt.category_id
        WHERE p.id BETWEEN 1 AND 51
    """)
        )
    }
    for product_id, (expected_name, expected_slug, _) in PRODUCTS.items():
        if current.get(product_id) != (expected_name, expected_slug):
            raise RuntimeError(
                f"Catalog export mismatch for product {product_id}: "
                f"expected {(expected_name, expected_slug)!r}, "
                f"found {current.get(product_id)!r}"
            )

    definition_by_key = {}
    definition_rows = []
    for slug, definitions in CHARACTERISTICS.items():
        category_id = categories[slug]
        for code, name, data_type, unit, sort_order, show_in_short in definitions:
            key = (slug, code)
            if key in definition_by_key:
                raise RuntimeError(f"Duplicate characteristic definition: {key}")
            definition_by_key[key] = data_type
            definition_rows.append(
                {
                    "category_id": category_id,
                    "code": code,
                    "name": name,
                    "data_type": data_type,
                    "unit": unit,
                    "sort_order": sort_order,
                    "show_in_short": show_in_short,
                }
            )
    value_rows = []
    for product_id, (_, slug, values) in PRODUCTS.items():
        seen_codes = set()
        for code, value in values:
            if code in seen_codes:
                raise RuntimeError(f"Duplicate value for product {product_id}/{code}")
            seen_codes.add(code)
            expected_type = definition_by_key.get((slug, code))
            if expected_type != _value_type(value):
                raise RuntimeError(f"Type mismatch for product {product_id}/{code}")
            value_rows.append((product_id, slug, code, value))

    connection.execute(
        sa.text("""
        INSERT INTO characteristics
            (category_id, code, name, data_type, unit, sort_order,
             is_required, show_in_short, show_in_details)
        VALUES
            (:category_id, :code, :name, :data_type, :unit, :sort_order,
             false, :show_in_short, true)
    """),
        definition_rows,
    )

    ids = {
        (row.slug, row.code): row.id
        for row in connection.execute(
            sa.text("""
        SELECT c.slug AS slug, ch.code AS code, ch.id AS id
        FROM characteristics AS ch
        JOIN categories AS c ON c.id = ch.category_id
    """)
        )
    }
    if len(ids) != EXPECTED_CHARACTERISTICS:
        raise RuntimeError("Characteristic definitions were not fully inserted")

    payload = [
        {
            "product_id": product_id,
            "characteristic_id": ids[(slug, code)],
            "value_json": json.dumps(value, ensure_ascii=False, allow_nan=False),
        }
        for product_id, slug, code, value in value_rows
    ]

    connection.execute(
        sa.text("""
        INSERT INTO product_characteristics
            (product_id, characteristic_id, value)
        VALUES
            (:product_id, :characteristic_id, CAST(:value_json AS jsonb))
    """),
        payload,
    )

    result_count = connection.execute(
        sa.text("SELECT count(*) FROM product_characteristics")
    ).scalar_one()
    if result_count != EXPECTED_VALUES:
        raise RuntimeError(
            f"Expected {EXPECTED_VALUES} seeded values, found {result_count}"
        )


def downgrade() -> None:
    raise RuntimeError(
        "Irreversible seed: removal could erase subsequently edited characteristics."
    )
