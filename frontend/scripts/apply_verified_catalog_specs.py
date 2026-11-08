"""Apply sourced compatibility fields to the existing demo catalog, safely.

Run from the backend directory with its Python environment. Existing values are
never overwritten. Lists below contain all options asserted by their sources;
fields whose meaning requires unknown configuration details are omitted.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "backend"))

from sqlalchemy import select  # noqa: E402
from app.db.session import SessionLocal  # noqa: E402
from app.models import Product  # noqa: E402

# Sources describe the exact product, except RAM, where the listed fields are
# shared by every variant matching the catalog's 32GB (2x16GB) DDR5 description.
DATA = {
    "cpu-ryzen-5-7600x": (44, "https://www.amd.com/en/products/processors/desktops/ryzen/7000-series/amd-ryzen-5-7600x.html", {
        "socket": "am5", "model_id": "ryzen-5-7600x", "thermal_design_power_w": 105,
    }),
    "mobo-asrock-b650m-pro": (24, "https://www.asrock.com/MB/AMD/B650M%20Pro%20RS/", {
        "socket": "am5", "memory_type": "ddr5", "max_memory_gb": 256, "ram_slots": 4,
        "form_factor": "matx", "gpu_interfaces": ["pcie-x16"],
        "storage_interfaces": ["nvme", "sata"], "supported_nvme_lengths_mm": [60, 80],
        "required_cpu_power_connectors": ["cpu-8pin"], "required_board_power_connectors": ["atx-24pin"],
    }),
    "gpu-gainward-rtx-4070-ghost": (43, "https://www.gainward.com/main/vgapro.php?id=1180&lang=en", {
        "interface": "pcie-x16", "length_mm": 269.1, "thickness_slots": 2,
        "required_power_connectors": ["pcie-8pin"],
    }),
    "ram-corsair-vengeance-32gb": (50, "https://www.corsair.com/us/en/p/memory/cmk32gx5m2e6000c36/vengeance-32gb-2x16gb-ddr5-dram-6000mt-s-c36-memory-kit-black-cmk32gx5m2e6000c36", {
        "memory_type": "ddr5", "capacity_gb": 32, "module_count": 2,
    }),
    "storage-wd-black-sn850x": (32, "https://documents.westerndigital.com/content/dam/doc-library/en_us/assets/public/western-digital/product/internal-drives/wd-black-ssd/data-sheet-wd-black-sn850x-nvme-ssd.pdf", {
        "interface": "nvme", "length_mm": 80,
    }),
    "psu-bequiet-pure-power-12": (38, "https://bequiet.com/en/powersupply/4072", {
        "wattage_w": 850, "form_factor": "atx", "length_mm": 160,
        "available_gpu_power_connectors": ["pcie-8pin"] * 4,
        "available_cpu_power_connectors": ["cpu-8pin"] * 2,
        "available_board_power_connectors": ["atx-24pin"],
    }),
    "case-fractal-north": (48, "https://www.fractal-design.com/app/uploads/2022/12/North_Product-Sheet_EN.pdf", {
        "supported_motherboard_form_factors": ["atx", "matx", "mini-itx"],
        "supported_psu_form_factors": ["atx"],
    }),
    "cooling-arctic-freezer-iii": (30, "https://www.arctic.de/media/16/63/19/1708429821/Spec_Sheet_Liquid_Freezer_III_360_Black_EN.pdf", {
        "supported_sockets": ["lga1851", "lga1700", "am5", "am4"],
        "cooling_type": "liquid", "radiator_size_mm": 360,
    }),
}


def main():
    with SessionLocal.begin() as db:
        products = db.scalars(select(Product).where(Product.slug.in_(DATA)).with_for_update()).all()
        if len(products) != len(DATA):
            raise RuntimeError("Catalog differs from the expected demo catalog")
        for product in products:
            expected_id, _, values = DATA[product.slug]
            if product.id != expected_id or not (product.sku or "").startswith("DEMO-"):
                raise RuntimeError(f"Unexpected catalog identity: {product.slug}")
            if product.slug == "gpu-gainward-rtx-4070-ghost" and not any("GDDR6X" in line for line in product.spec_lines):
                raise RuntimeError("GPU variant is not identified as GDDR6X")
            conflicts = [key for key, value in values.items() if key in product.technical_specs and product.technical_specs[key] != value]
            if conflicts:
                raise RuntimeError(f"Refusing to overwrite {product.slug}: {conflicts}")
            product.technical_specs = {**product.technical_specs, **values}
        print(f"Verified fields applied to {len(products)} demo products")


if __name__ == "__main__":
    main()
