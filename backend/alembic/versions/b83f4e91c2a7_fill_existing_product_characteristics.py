"""Fill missing normalized catalog values without changing the schema.

Revision ID: b83f4e91c2a7
Revises: 7e2c9b4a51f0

Catalog identity: the 51 products in revision 7e2c9b4a51f0.
Sources: manufacturer specifications listed beside each group, and the existing
catalog's typed values. Canonical compatibility identifiers match the existing
engine. No network access at migration time. Do not fill irrelevant fields with
zeros, fake strings or invented model-specific specifications.

Scope: INSERT into product_characteristics only, with one conditional correction
of the original Pure Power 12 M connector list. Existing user edits are retained.
The PowerPlay RAM/storage choices are explicitly DEMO assumptions, not verified
configuration facts. INNO3D's catalog name is treated as the TWIN X2 family;
only common family specifications are used, not an exact OC variant.
"""

from __future__ import annotations

import math

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, insert

from alembic import op

revision = "b83f4e91c2a7"
down_revision = "7e2c9b4a51f0"
branch_labels = None
depends_on = None

# id: (exact existing product name, category slug, additional values)
# An empty mapping means the existing relevant values are retained.
# CPU data for prebuilt machines is inherited from the documented CPU model;
# no assumption about a particular physical motherboard or graphics board.
PRODUCTS = {
    # Demo configuration: DDR4 is the 5700X memory type. RAM/SSD size and
    # SSD interface are plausible demo choices authorized for this catalog.
    1: (
        "Игровой ПК PowerPlay",
        "prebuilt",
        {
            "ram_capacity_gb": 16,
            "memory_type": "ddr4",
            "storage_capacity_gb": 1024,
            "storage_type": "nvme",
        },
    ),
    # Intel ARK: 14600KF (SKU 236778), 13700KF (SKU 230489).
    2: (
        "Игровой ПК Ultra",
        "prebuilt",
        {
            "cores": 14,
            "threads": 20,
            "base_clock_ghz": 3.5,
            "max_clock_ghz": 5.3,
            "platform": "LGA1700 / DDR5",
        },
    ),
    # https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-9-7900x.html
    3: (
        "Игровой ПК ProMax",
        "prebuilt",
        {
            "architecture": "Zen 4",
            "cores": 12,
            "threads": 24,
            "base_clock_ghz": 4.7,
            "max_clock_ghz": 5.6,
            "platform": "AM5 / DDR5",
        },
    ),
    # https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-7-7800X3d.html
    4: (
        "Стриминговый ПК StreamX",
        "prebuilt",
        {
            "architecture": "Zen 4",
            "cores": 8,
            "threads": 16,
            "base_clock_ghz": 4.2,
            "max_clock_ghz": 5.0,
            "socket": "am5",
            "platform": "AM5 / DDR5",
        },
    ),
    # https://www.amd.com/en/newsroom/press-releases/2023-10-19-amd-introduces-new-amd-ryzen-threadripper-7000-ser.html
    5: (
        "Рабочая станция WorkPro",
        "prebuilt",
        {
            "architecture": "Zen 4",
            "cores": 12,
            "threads": 24,
            "base_clock_ghz": 4.7,
            "max_clock_ghz": 5.3,
            "socket": "str5",
        },
    ),
    6: (
        "Компактный ПК MiniCube",
        "prebuilt",
        {
            "architecture": "Zen 4",
            "cores": 6,
            "threads": 12,
            "base_clock_ghz": 3.8,
            "max_clock_ghz": 5.1,
            "platform": "AM5 / DDR5",
        },
    ),
    # https://www.msi.com/Graphics-Card/GeForce-RTX-4070-SUPER-12G-GAMING-X-SLIM/Specification
    7: (
        "MSI GeForce RTX 4070 SUPER Gaming X Slim 12G",
        "gpu",
        {
            "interface": "pcie-x16",
            "length_mm": 307,
            "series": "GAMING X SLIM",
            "gpu_technology": "DLSS 3",
        },
    ),
    # https://www.asus.com/motherboards-components/graphics-cards/tuf-gaming/tuf-rtx4070tis-16g-gaming/techspec/
    8: (
        "ASUS GeForce RTX 4070 Ti SUPER TUF Gaming 16G",
        "gpu",
        {
            "architecture": "NVIDIA Ada Lovelace",
            "cuda_cores": 8448,
            "memory_speed_gbps": 21,
            "boost_clock_mhz": 2610,
            "interface": "pcie-x16",
            "interface_detail": "PCI Express 4.0 x16",
            "display_outputs": "3 × DisplayPort 1.4a, 2 × HDMI 2.1a",
            "max_monitors": 4,
            "max_resolution": "7680 × 4320",
            "required_power_connectors": ["pcie-16pin"],
            "recommended_psu_w": 750,
            "dimensions_mm": [305, 138, 65],
            "length_mm": 305,
            "thickness_slots": 3.25,
            "opengl": "4.6",
            "series": "TUF Gaming",
        },
    ),
    # https://www.gigabyte.com/hr/Graphics-Card/GV-N408SGAMING-OC-16GD/sp
    9: (
        "Gigabyte GeForce RTX 4080 SUPER Gaming OC 16G",
        "gpu",
        {
            "architecture": "NVIDIA Ada Lovelace",
            "cuda_cores": 10240,
            "memory_speed_gbps": 23,
            "boost_clock_mhz": 2595,
            "interface": "pcie-x16",
            "interface_detail": "PCI Express 4.0 x16",
            "display_outputs": "3 × DisplayPort 1.4a, 1 × HDMI 2.1a",
            "max_monitors": 4,
            "max_resolution": "7680 × 4320",
            "required_power_connectors": ["pcie-16pin"],
            "recommended_psu_w": 850,
            "dimensions_mm": [342, 150, 75],
            "length_mm": 342,
            "directx": "12 Ultimate",
            "opengl": "4.6",
        },
    ),
    # https://www.sapphiretech.com/en/consumer/nitro-radeon-rx-7800-xt-16g-gddr6
    10: (
        "Sapphire Radeon RX 7800 XT Nitro+ 16G",
        "gpu",
        {
            "architecture": "AMD RDNA 3",
            "memory_speed_gbps": 19.5,
            "boost_clock_mhz": 2565,
            "interface": "pcie-x16",
            "interface_detail": "PCI Express 4.0 x16",
            "max_power_draw_w": 288,
            "required_power_connectors": ["pcie-8pin", "pcie-8pin"],
            "recommended_psu_w": 700,
            "dimensions_mm": [320, 134.85, 61.57],
            "length_mm": 320,
            "thickness_slots": 3,
            "cooling_system": "Tri-X",
            "directx": "12 Ultimate",
        },
    ),
    # https://helpdesk.xfxforce.com/shop/xfx-radeon-tm-rx-7900-gre
    11: (
        "XFX Radeon RX 7900 GRE Merc 319 16G",
        "gpu",
        {
            "architecture": "AMD RDNA 3",
            "memory_speed_gbps": 18,
            "boost_clock_mhz": 2395,
            "interface": "pcie-x16",
            "interface_detail": "PCI Express 4.0 x16",
            "display_outputs": "3 × DisplayPort 2.1, 1 × HDMI 2.1",
            "required_power_connectors": ["pcie-8pin", "pcie-8pin"],
            "recommended_psu_w": 700,
            "thickness_slots": 2.5,
            "cooling_system": "3 вентилятора",
        },
    ),
    # https://rog.asus.com/us/graphics-cards/graphics-cards/rog-strix/rog-strix-rtx4090-24g-gaming-model/spec/
    12: (
        "ASUS GeForce RTX 4090 ROG Strix 24G",
        "gpu",
        {
            "architecture": "NVIDIA Ada Lovelace",
            "cuda_cores": 16384,
            "memory_speed_gbps": 21,
            "boost_clock_mhz": 2520,
            "interface": "pcie-x16",
            "interface_detail": "PCI Express 4.0 x16",
            "display_outputs": "3 × DisplayPort 1.4a, 2 × HDMI 2.1a",
            "max_monitors": 4,
            "max_resolution": "7680 × 4320",
            "required_power_connectors": ["pcie-16pin"],
            "recommended_psu_w": 1000,
            "dimensions_mm": [357.6, 149.3, 70.1],
            "length_mm": 357.6,
            "thickness_slots": 3.5,
            "opengl": "4.6",
        },
    ),
    # https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600.html
    13: (
        "AMD Ryzen 5 7600",
        "cpu",
        {
            "has_3d_vcache": False,
            "platform": "AM5 / DDR5",
            "model_id": "ryzen-5-7600",
        },
    ),
    # https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-7-7800X3d.html
    14: (
        "AMD Ryzen 7 7800X3D",
        "cpu",
        {
            "series": "Ryzen 7000",
            "kodovoe_imya": "Raphael",
            "cache_l1_kb": 512,
            "cache_l2_mb": 8,
            "cpu_process": "TSMC 5 нм",
            "memory_channels": 2,
            "supported_ram_speed_mhz": 5200,
            "pcie_version": "5.0",
            "has_integrated_graphics": True,
            "integrated_graphics": "AMD Radeon Graphics",
            "integrated_gpu_cores": 2,
            "integrated_gpu_clock_mhz": 2200,
            "platform": "AM5 / DDR5",
            "model_id": "ryzen-7-7800x3d",
        },
    ),
    # https://www.intel.com/content/www/us/en/products/sku/236778/intel-core-i5-processor-14600kf-24m-cache-up-to-5-30-ghz/specifications.html
    15: (
        "Intel Core i5-14600KF",
        "cpu",
        {
            "series": "Intel Core i5",
            "architecture": "Raptor Lake Refresh",
            "base_clock_ghz": 3.5,
            "cache_l2_mb": 20,
            "cache_l3_mb": 24,
            "cpu_process": "Intel 7",
            "max_temperature_c": 100,
            "memory_channels": 2,
            "supported_ram_speed_mhz": 5600,
            "pcie_version": "5.0",
            "unlocked_multiplier": True,
            "has_3d_vcache": False,
            "platform": "LGA1700 / DDR4 / DDR5",
            "model_id": "core-i5-14600kf",
        },
    ),
    # https://www.intel.com/content/www/us/en/products/sku/236789/intel-core-i7-processor-14700kf-33m-cache-up-to-5-60-ghz/specifications.html
    16: (
        "Intel Core i7-14700KF",
        "cpu",
        {
            "series": "Intel Core i7",
            "architecture": "Raptor Lake Refresh",
            "base_clock_ghz": 3.4,
            "cache_l2_mb": 28,
            "cache_l3_mb": 33,
            "cpu_process": "Intel 7",
            "max_temperature_c": 100,
            "memory_channels": 2,
            "supported_ram_speed_mhz": 5600,
            "pcie_version": "5.0",
            "unlocked_multiplier": True,
            "has_3d_vcache": False,
            "platform": "LGA1700 / DDR4 / DDR5",
            "model_id": "core-i7-14700kf",
        },
    ),
    # https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-9-7950x.html
    17: (
        "AMD Ryzen 9 7950X",
        "cpu",
        {
            "series": "Ryzen 7000",
            "kodovoe_imya": "Raphael",
            "cache_l1_kb": 1024,
            "cache_l2_mb": 16,
            "cpu_process": "TSMC 5 нм",
            "max_temperature_c": 95,
            "memory_channels": 2,
            "supported_ram_speed_mhz": 5200,
            "integrated_gpu_cores": 2,
            "integrated_gpu_clock_mhz": 2200,
            "unlocked_multiplier": True,
            "has_3d_vcache": False,
            "platform": "AM5 / DDR5",
            "model_id": "ryzen-9-7950x",
        },
    ),
    # https://www.intel.com/content/www/us/en/products/sku/236787/intel-core-i9-processor-14900kf-36m-cache-up-to-6-00-ghz/specifications.html
    18: (
        "Intel Core i9-14900KF",
        "cpu",
        {
            "series": "Intel Core i9",
            "architecture": "Raptor Lake Refresh",
            "base_clock_ghz": 3.2,
            "cache_l2_mb": 32,
            "cache_l3_mb": 36,
            "cpu_process": "Intel 7",
            "max_temperature_c": 100,
            "memory_channels": 2,
            "supported_ram_speed_mhz": 5600,
            "pcie_version": "5.0",
            "unlocked_multiplier": True,
            "has_3d_vcache": False,
            "platform": "LGA1700 / DDR4 / DDR5",
            "model_id": "core-i9-14900kf",
        },
    ),
    # https://in.msi.com/Motherboard/MAG-B650-TOMAHAWK-WIFI/Specification
    19: (
        "MSI MAG B650 Tomahawk WiFi",
        "mobo",
        {
            "ram_slots": 4,
            "max_memory_gb": 256,
            "storage_interfaces": ["nvme", "sata"],
            "gpu_interfaces": ["pcie-x16"],
            "supported_nvme_lengths_mm": [60, 80, 110],
            "required_cpu_power_connectors": ["cpu-8pin", "cpu-8pin"],
            "required_board_power_connectors": ["atx-24pin"],
            "expansion_interface": "PCIe 4.0 x16",
        },
    ),
    # https://rog.asus.com/us/motherboards/rog-strix/rog-strix-b650e-f-gaming-wifi-model/spec/
    # Use the main 8-pin EPS requirement; the extra 4-pin is supplementary.
    # The current engine cannot model optional connectors or split EPS plugs.
    20: (
        "ASUS ROG Strix B650E-F Gaming WiFi",
        "mobo",
        {
            "ram_slots": 4,
            "max_memory_gb": 192,
            "storage_interfaces": ["nvme", "sata"],
            "gpu_interfaces": ["pcie-x16"],
            "supported_nvme_lengths_mm": [42, 60, 80, 110],
            "required_cpu_power_connectors": ["cpu-8pin"],
            "required_board_power_connectors": ["atx-24pin"],
            "wireless": "Wi-Fi 6E",
        },
    ),
    # https://www.gigabyte.com/Motherboard/Z790-AORUS-ELITE-AX-rev-1x/sp
    21: (
        "Gigabyte Z790 AORUS Elite AX",
        "mobo",
        {
            "ram_slots": 4,
            "max_memory_gb": 256,
            "storage_interfaces": ["nvme", "sata"],
            "gpu_interfaces": ["pcie-x16"],
            "supported_nvme_lengths_mm": [80, 110],
            "required_cpu_power_connectors": ["cpu-8pin", "cpu-8pin"],
            "required_board_power_connectors": ["atx-24pin"],
            "expansion_interface": "PCIe 5.0 x16",
        },
    ),
    # https://ru.msi.com/Motherboard/MAG-B760-TOMAHAWK-WIFI/Specification
    22: (
        "MSI MAG B760 Tomahawk WiFi",
        "mobo",
        {
            "ram_slots": 4,
            "max_memory_gb": 256,
            "storage_interfaces": ["nvme", "sata"],
            "gpu_interfaces": ["pcie-x16"],
            "supported_nvme_lengths_mm": [42, 60, 80, 110],
            "required_cpu_power_connectors": ["cpu-8pin", "cpu-8pin"],
            "required_board_power_connectors": ["atx-24pin"],
            "expansion_interface": "PCIe 5.0 x16",
        },
    ),
    # https://www.asus.com/motherboards-components/motherboards/tuf-gaming/tuf-gaming-z790-plus-wifi/techspec/
    23: (
        "ASUS TUF Gaming Z790-Plus WiFi",
        "mobo",
        {
            "ram_slots": 4,
            "max_memory_gb": 192,
            "storage_interfaces": ["nvme", "sata"],
            "gpu_interfaces": ["pcie-x16"],
            "supported_nvme_lengths_mm": [42, 60, 80, 110],
            "required_cpu_power_connectors": ["cpu-8pin", "cpu-8pin"],
            "required_board_power_connectors": ["atx-24pin"],
            "expansion_interface": "PCIe 5.0 x16",
        },
    ),
    # https://www.asrock.com/mb/AMD/B650M%20Pro%20RS/
    24: (
        "ASRock B650M Pro RS",
        "mobo",
        {
            "series": "Pro RS",
            "expansion_interface": "PCIe 4.0 x16",
            "wireless": "M.2 Key E (модуль Wi-Fi приобретается отдельно)",
        },
    ),
    # https://support.logi.com/hc/en-ch/articles/14433208479511-Specification-PRO-X-TKL-Gaming-Keyboard-Linear
    25: ("Logitech G Pro X TKL", "peripheral", {"connection": "LIGHTSPEED / USB"}),
    # https://www.razer.com/gaming-mice/razer-deathadder-v3?page=tech-specs
    26: (
        "Razer DeathAdder V3",
        "peripheral",
        {
            "switch_mechanism": "Оптические",
            "switch_model": "Razer Optical Mouse Switches Gen-3",
        },
    ),
    27: (
        "HyperX Cloud III",
        "peripheral",
        {},
    ),  # existing applicable headset fields retained
    28: ("DXRacer Formula F08", "accessories", {"naznachenie": "Игровое кресло"}),
    # https://www.deepcool.com/products/Cooling/cpuaircoolers/AK620-High-Performance-CPU-Cooler-1851-1700-AM5/2024/13067.shtml
    29: (
        "DeepCool AK620",
        "cooling",
        {
            "supported_sockets": [
                "am4",
                "am5",
                "lga1150",
                "lga1151",
                "lga1155",
                "lga1200",
                "lga1700",
                "lga1851",
                "lga2011",
                "lga2011-v3",
                "lga2066",
            ],
        },
    ),
    # https://www.arctic.de/en/Liquid-Freezer-III-360/ACFRE00136A
    30: (
        "ARCTIC Liquid Freezer III 360",
        "cooling",
        {"fan_count": 3, "fan_size_mm": 120},
    ),
    # https://www.samsung.com/us/memory-storage/nvme-ssd/990-pro-pcie-4-0-nvme-ssd-2tb-sku-mz-v9p1t0b-am/
    31: ("Samsung 990 PRO 1 ТБ", "storage", {"interface": "nvme", "length_mm": 80}),
    # https://www.sandisk.com/products/ssd/internal-ssd/wd-black-sn850x-nvme-ssd
    32: ("WD Black SN850X 2 ТБ", "storage", {"write_speed_mb_s": 6600}),
    33: (
        "Kingston FURY Beast 32 ГБ (2×16) DDR5-6000",
        "ram",
        {"heatspreader_color": "Чёрный"},
    ),
    34: ("G.Skill Trident Z5 32 ГБ (2×16) DDR5-6400", "ram", {}),
    # https://lian-li.com/product/lancool-216/
    35: (
        "Lian Li Lancool 216",
        "case",
        {
            "supported_motherboard_form_factors": ["atx", "matx", "mini-itx"],
            "supported_psu_form_factors": ["atx"],
            "bokovaya_panel": "Закалённое стекло",
            "front_material": "Сталь / сетка",
        },
    ),
    # https://support.nzxt.com/hc/en-us/articles/37734705208347-H5-2022-Series-Specs
    # https://nzxt.com/products/h5-flow
    # Common supported formats across 2022/2024; no assumption about exact revision.
    36: (
        "NZXT H5 Flow",
        "case",
        {
            "supported_motherboard_form_factors": ["atx", "matx", "mini-itx"],
            "supported_psu_form_factors": ["atx"],
            "front_material": "Сталь / перфорация",
        },
    ),
    # https://www.corsair.com/ww/cf/explorer/diy-builder/power-supply-units/corsair-rme-series/
    37: (
        "Corsair RM750e 750 Вт",
        "psu",
        {
            "length_mm": 140,
            "form_factor": "atx",
            "available_cpu_power_connectors": ["cpu-8pin", "cpu-8pin"],
            "available_gpu_power_connectors": [
                "pcie-8pin",
                "pcie-8pin",
                "pcie-8pin",
                "pcie-16pin",
            ],
            "available_board_power_connectors": ["atx-24pin"],
        },
    ),
    # https://bequiet.com/en/powersupply/4162 — native 16-pin and four 6+2-pin connectors.
    38: (
        "be quiet! Pure Power 12 M 850W",
        "psu",
        {
            "available_gpu_power_connectors": [
                "pcie-8pin",
                "pcie-8pin",
                "pcie-8pin",
                "pcie-8pin",
                "pcie-16pin",
            ],
        },
    ),
    39: ("Seagate BarraCuda 2 ТБ", "hdd", {}),  # all defined fields already populated
    40: ('AOC 27" Q27G2U', "monitor", {}),  # all defined fields already populated
    # https://www.zotac.com/us/product/graphics_card/zotac-gaming-geforce-rtx-4070-super-twin-edge-12gb-gddr6x
    41: (
        "ZOTAC RTX 4070 SUPER Twin Edge",
        "gpu",
        {
            "architecture": "NVIDIA Ada Lovelace",
            "cuda_cores": 7168,
            "memory_speed_gbps": 21,
            "interface": "pcie-x16",
            "interface_detail": "PCI Express 4.0 x16",
            "display_outputs": "3 × DisplayPort 1.4a, 1 × HDMI 2.1a",
            "max_monitors": 4,
            "max_resolution": "7680 × 4320",
            "max_power_draw_w": 220,
            "required_power_connectors": ["pcie-16pin"],
            "recommended_psu_w": 650,
            "dimensions_mm": [234.1, 123.5, 40.2],
            "length_mm": 234.1,
            "thickness_slots": 2,
            "directx": "12 Ultimate",
            "opengl": "4.6",
        },
    ),
    # https://www.inno3d.com/product/inno3d-geforce-rtx-4070-super-twin-x2
    # Catalog misnames Twin X2 as Twin Edge; family-level properties only.
    42: (
        "INNO3D RTX 4070 SUPER Twin Edge",
        "gpu",
        {
            "architecture": "NVIDIA Ada Lovelace",
            "cuda_cores": 7168,
            "memory_speed_gbps": 21,
            "interface": "pcie-x16",
            "interface_detail": "PCI Express 4.0 x16",
            "display_outputs": "3 × DisplayPort 1.4a, 1 × HDMI 2.1a",
            "max_resolution": "7680 × 4320",
            "required_power_connectors": ["pcie-16pin"],
            "recommended_psu_w": 650,
            "directx": "12 Ultimate",
        },
    ),
    # https://www.gainward.com/main/edm/rtx4070/index_en.php
    # https://www.gainward.com/main/product/vga/pro/p01219/p01219_datasheet_79266c7034b8a16b.pdf?s=22
    43: (
        "Gainward RTX 4070 Ghost 12 ГБ",
        "gpu",
        {
            "architecture": "NVIDIA Ada Lovelace",
            "cuda_cores": 5888,
            "memory_speed_gbps": 21,
            "interface_detail": "PCI Express 4.0 x16",
            "max_power_draw_w": 200,
            "recommended_psu_w": 750,
            "dimensions_mm": [269.1, 131.8, 40.1],
            "series": "Ghost",
            "gpu_technology": "DLSS 3",
        },
    ),
    # https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600x.html
    44: (
        "AMD Ryzen 5 7600X",
        "cpu",
        {
            "series": "Ryzen 7000",
            "kodovoe_imya": "Raphael",
            "cache_l1_kb": 384,
            "cache_l2_mb": 6,
            "cpu_process": "TSMC 5 нм",
            "max_temperature_c": 95,
            "memory_channels": 2,
            "supported_ram_speed_mhz": 5200,
            "pcie_version": "5.0",
            "has_integrated_graphics": True,
            "integrated_graphics": "AMD Radeon Graphics",
            "integrated_gpu_cores": 2,
            "integrated_gpu_clock_mhz": 2200,
            "has_3d_vcache": False,
        },
    ),
    # https://www.intel.com/content/www/us/en/products/sku/230489/intel-core-i713700kf-processor-30m-cache-up-to-5-40-ghz/specifications.html
    45: (
        "Игровой ПК RTX 4070 SUPER",
        "prebuilt",
        {
            "cores": 16,
            "threads": 24,
            "base_clock_ghz": 3.4,
            "max_clock_ghz": 5.4,
            "platform": "LGA1700 / DDR5",
        },
    ),
    46: (
        "Игровой ПК RTX 4070 White Edition",
        "prebuilt",
        {
            "architecture": "Zen 4",
            "cores": 8,
            "threads": 16,
            "base_clock_ghz": 4.2,
            "max_clock_ghz": 5.0,
            "platform": "AM5 / DDR5",
            "osobennost_cpu": "3D V-Cache",
        },
    ),
    # https://www.thermalright.com/product/peerless-assassin-120/
    47: (
        "Thermalright Peerless Assassin 120",
        "cooling",
        {
            "supported_sockets": [
                "am4",
                "am5",
                "lga1150",
                "lga1151",
                "lga1155",
                "lga1156",
                "lga1200",
                "lga1700",
                "lga1851",
                "lga2011",
                "lga2011-v3",
                "lga2066",
            ],
        },
    ),
    # https://www.fractal-design.com/news/introducing-north/
    48: (
        "Fractal Design North",
        "case",
        {"front_fan_count": 2, "front_fan_size_mm": 140},
    ),
    # https://www.lg.com/us/monitors/lg-27gp850-b-gaming-monitor
    49: ("LG 27GP850-B", "monitor", {"response_time_ms": 1}),
    50: ("Corsair Vengeance 32 ГБ (2×16) DDR5-6000", "ram", {"color": "Чёрный"}),
    51: ("Lian Li Strimer Plus V2 24-pin", "accessories", {}),
}


def _number(value: object) -> bool:
    return type(value) in (int, float) and math.isfinite(value)  # type: ignore[arg-type]


def _matches_type(value: object, data_type: str) -> bool:
    if data_type == "boolean":
        return isinstance(value, bool)
    if data_type == "number":
        return _number(value)
    if data_type == "string":
        return isinstance(value, str) and bool(value.strip()) and len(value) <= 500
    if data_type in ("string_list", "number_list"):
        if not isinstance(value, list) or not value or len(value) > 50:
            return False
        scalar = "string" if data_type == "string_list" else "number"
        return all(_matches_type(item, scalar) for item in value)
    return False


def upgrade() -> None:
    connection = op.get_bind()
    products = sa.table(
        "products",
        sa.column("id", sa.BigInteger()),
        sa.column("name", sa.String()),
        sa.column("product_type_id", sa.BigInteger()),
    )
    types = sa.table(
        "product_types",
        sa.column("id", sa.BigInteger()),
        sa.column("category_id", sa.BigInteger()),
    )
    categories = sa.table(
        "categories", sa.column("id", sa.BigInteger()), sa.column("slug", sa.String())
    )
    definitions = sa.table(
        "characteristics",
        sa.column("id", sa.BigInteger()),
        sa.column("category_id", sa.BigInteger()),
        sa.column("code", sa.String()),
        sa.column("data_type", sa.String()),
    )
    values = sa.table(
        "product_characteristics",
        sa.column("product_id", sa.BigInteger()),
        sa.column("characteristic_id", sa.BigInteger()),
        sa.column("value", JSONB()),
    )

    # Preflight: exact catalog identity. Refuse to guess if a row has changed or
    # if the local catalog now contains additional products not in this manifest.
    actual = {
        row.id: (row.name, row.slug)
        for row in connection.execute(
            sa.select(products.c.id, products.c.name, categories.c.slug).select_from(
                products.join(types, products.c.product_type_id == types.c.id).join(
                    categories, types.c.category_id == categories.c.id
                )
            )
        )
    }
    expected = {pid: (name, slug) for pid, (name, slug, _) in PRODUCTS.items()}
    if actual != expected:
        changed = sorted(
            pid
            for pid in actual.keys() | expected.keys()
            if actual.get(pid) != expected.get(pid)
        )
        raise RuntimeError(
            f"Catalog mismatch; verify product IDs before migration: {changed}"
        )

    by_key = {
        (row.slug, row.code): (row.id, row.data_type)
        for row in connection.execute(
            sa.select(
                categories.c.slug,
                definitions.c.code,
                definitions.c.id,
                definitions.c.data_type,
            ).select_from(
                definitions.join(
                    categories, definitions.c.category_id == categories.c.id
                )
            )
        )
    }
    payload = []
    for product_id, (_, slug, additions) in PRODUCTS.items():
        for code, value in additions.items():
            definition = by_key.get((slug, code))
            if definition is None:
                raise RuntimeError(f"Missing existing definition: {slug}/{code}")
            characteristic_id, data_type = definition
            if not _matches_type(value, data_type):
                raise RuntimeError(f"Invalid value for {product_id}/{code}: {value!r}")
            payload.append(
                {
                    "product_id": product_id,
                    "characteristic_id": characteristic_id,
                    "value": value,
                }
            )

    # No DDL, no new characteristic definitions, no updates to products.
    # The composite PK makes missing-value insertion safe and repeatable.
    if payload:
        connection.execute(
            insert(values).on_conflict_do_nothing(
                index_elements=[values.c.product_id, values.c.characteristic_id]
            ),
            payload,
        )

    # One documented correction: the seed's Pure Power 12 M list omitted its
    # native 16-pin cable. Change only the exact original list, never user edits.
    connector_id = by_key[("psu", "available_gpu_power_connectors")][0]
    old_connectors = ["pcie-8pin"] * 4
    connection.execute(
        sa.update(values)
        .where(
            values.c.product_id == 38,
            values.c.characteristic_id == connector_id,
            values.c.value == old_connectors,
        )
        .values(value=PRODUCTS[38][2]["available_gpu_power_connectors"])
    )


def downgrade() -> None:
    # Missing-value insertions may have been skipped because of prior user edits;
    # deleting these keys would risk destroying legitimate catalog data.
    raise RuntimeError(
        "Irreversible data enrichment; restore a pre-migration backup to undo."
    )
