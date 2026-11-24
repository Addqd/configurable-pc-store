# PC Builder — проверка совместимости на backend

Реализация: `backend/app/services/compatibility.py`. Источник данных — **только** нормализованные
таблицы `characteristics` / `product_characteristics` (`spec_service.load_values` /
`load_definitions`), а не текст названия, описание или старые JSONB-спеки. Значения читаются
одним запросом на все товары сборки, определения — одним запросом на все категории; правил,
которые ходят в БД по одному товару, нет.

## Статусы

- `incompatible` — доказан конкретный конфликт (неверная категория товара, несовпадающий сокет,
  неподдерживаемый форм-фактор, недостаточные разъёмы питания и т. п.).
- `unknown` — выбран не все восемь компонентов **или** для обязательной проверки не хватает
  структурированных данных.
- `compatible` — все восемь компонентов выбраны, категории верны и **все применимые проверки
  утверждённого набора** пройдены.

Подтверждённый конфликт имеет приоритет над неизвестными проверками. Каждая проверка возвращает
строку с устойчивым `slot` (например `cpu+mobo_socket`), `status`, английский `message` для логов
и `details` — структурированные свидетельства (`slot`, `product_name`, `code`, `name`, `unit`,
`value`, `display_value`). Frontend локализует конфликт по `details` и никогда не разбирает
`message`.

## Утверждённый набор правил (`RULES`)

Сравнения выполняются только по характеристикам, которые действительно есть в нормализованной
модели каталога:

| Код проверки | Сравнение |
|---|---|
| `cpu+mobo_socket` | `cpu.socket` = `mobo.socket` |
| `cpu+ram_type` | `ram.memory_type` входит в `cpu.memory_type` (string_list) |
| `ram+mobo_type` | `ram.memory_type` = `mobo.memory_type` |
| `ram+mobo_capacity` | `ram.capacity_gb` ≤ `mobo.max_memory_gb` |
| `ram+mobo_slots` | `ram.module_count` ≤ `mobo.ram_slots` |
| `mobo+case_form_factor` | `mobo.form_factor` входит в `case.supported_motherboard_form_factors` |
| `cpu+cooling_socket` | `cpu.socket` входит в `cooling.supported_sockets` |
| `gpu+mobo_slot` | `gpu.interface` входит в `mobo.gpu_interfaces` |
| `storage+mobo_interface` | `storage.interface` входит в `mobo.storage_interfaces` |
| `storage+mobo_length` | только для NVMe: `storage.length_mm` входит в `mobo.supported_nvme_lengths_mm` |
| `psu+case_form_factor` | `psu.form_factor` входит в `case.supported_psu_form_factors` |
| `psu+gpu_connectors` | `psu.available_gpu_power_connectors` покрывает `gpu.required_power_connectors` |
| `psu+mobo_main_connector` | `psu.available_board_power_connectors` покрывает `mobo.required_board_power_connectors` |
| `psu+mobo_connectors` | `psu.available_cpu_power_connectors` покрывает `mobo.required_cpu_power_connectors` |
| `psu+gpu_recommended_power` | `gpu.recommended_psu_w` ≤ `psu.wattage_w` (применяется только если GPU документирует рекомендацию) |

Нормализация: текстовые идентификаторы и элементы списков сравниваются без учёта регистра,
пробелы по краям отбрасываются; числа — только конечные положительные JSON-числа (не строки и не
`bool`); списки разъёмов учитывают количество (два `8pin` ≠ один `8pin`).

## Исключённые правила и причина

Эти проверки были в прежней версии движка, но не имеют опоры в утверждённой модели характеристик,
поэтому **не выполняются** и не выдаются как `unknown`:

- `cpu+mobo_bios_support` — нет `mobo.supported_cpu_models`;
- `cpu+cooling_thermal` — нет `cooling.cooling_capacity_w`;
- `cooling+case_height`, `ram+cooling_clearance` — у `cooling` нет `height_mm`/`ram_clearance_mm`,
  у `ram` нет `height_mm`;
- `cooling+case_radiator`, `gpu+case_length`, `gpu+case_thickness`, `psu+case_length`,
  `storage+case_bay` — у `case` нет соответствующих предельных размеров и списков отсеков;
- `psu+system_power` — суммировать нечего: `max_power_draw_w` есть только у GPU. `thermal_design_power_w`
  — теплопакет, а не максимальное электрическое потребление, поэтому он не сравнивается с мощностью БП.

Пустой список значений (например `available_gpu_power_connectors: []`) считается отсутствующими
данными, а не подтверждённым «разъёмов нет»: в каталоге пустой список неотличим от незаполненного.
Отсутствие данных в поддерживаемом правиле даёт `unknown` только для этого правила; глобально
неподдерживаемые правила вообще не влияют на результат.

## Границы

- `compatible` означает прохождение **реализованного набора проверок**, а не сертификацию
  производителя. Нестандартные корпуса, райзеры, переходники, разгон и ограничения по линиям PCIe
  требуют отдельных подтверждённых правил.
- `cart_service._build_snapshot()` использует тот же `check_selections()`: незавершённые,
  неизвестные и несовместимые конфигурации не попадают в корзину и заказ, как и
  прямое добавление сборки из конфигуратора без сохранения.
- Новые правила добавляются в `RULES` вместе с тестовыми фикстурами в
  `tests/test_compatibility_engine.py` без изменения API-контракта.
