"""Official daily exchange rates from the Bank of Russia.

Rates are presentation-only data: every monetary value of this application is
stored, calculated and persisted in RUB, so this module never touches the ORM,
the database, the cart or the order calculations. It only answers "how many
rubles is one unit of USD/EUR worth today" for display purposes.
"""

from __future__ import annotations

import asyncio
import codecs
import logging
import re
import time
import xml.etree.ElementTree as ET
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Final

import httpx

from app.services.errors import ServiceUnavailableError

log = logging.getLogger(__name__)

# Fixed official endpoint. The optional `date_req` parameter is deliberately not
# sent: without it the provider answers with its latest registered daily document.
CBR_DAILY_URL: Final = "https://www.cbr.ru/scripts/XML_daily.asp"
BASE_CURRENCY: Final = "RUB"
REQUIRED_CURRENCIES: Final = ("USD", "EUR")

CONNECT_TIMEOUT_SECONDS: Final = 5.0
READ_TIMEOUT_SECONDS: Final = 10.0
REQUEST_DEADLINE_SECONDS: Final = 15.0
MAX_RESPONSE_BYTES: Final = 256 * 1024

CACHE_TTL_SECONDS: Final = 3600.0
FAILURE_COOLDOWN_SECONDS: Final = 60.0

PROVIDER_UNAVAILABLE_MESSAGE: Final = "exchange rates are temporarily unavailable"

# The XML declaration is ASCII in every encoding this module accepts.
_DECLARATION_BYTES: Final = 512
_MAX_FIELD_LENGTH: Final = 32
_ENCODING_DECLARATION: Final = re.compile(
    rb"""encoding\s*=\s*["']([A-Za-z0-9._-]+)["']"""
)
_SUPPORTED_ENCODINGS: Final = frozenset({"utf-8", "cp1251"})
_UNSAFE_DECLARATION: Final = re.compile(r"<!\s*(?:DOCTYPE|ENTITY)", re.IGNORECASE)
_DATE_PATTERN: Final = re.compile(r"\d{2}\.\d{2}\.\d{4}\Z")
_NOMINAL_PATTERN: Final = re.compile(r"\d{1,6}\Z")
_VALUE_PATTERN: Final = re.compile(r"\d{1,12}(?:[.,]\d{1,10})?\Z")


class CurrencyProviderError(Exception):
    """Internal provider failure; never exposed to API clients as-is."""


@dataclass(frozen=True, slots=True)
class CurrencyQuote:
    """One validated provider document."""

    rates: dict[str, Decimal]
    rate_date: date


@dataclass(frozen=True, slots=True)
class RateSnapshot:
    """Everything a client may see about the rates currently in use."""

    rates: dict[str, Decimal]
    rate_date: date
    fetched_at: datetime
    monotonic_at: float


def _declared_encoding(raw: bytes) -> str:
    """Return the document encoding only when it is one of the supported ones."""
    if raw.startswith(codecs.BOM_UTF8):
        return "utf-8"
    if raw.startswith(
        (
            codecs.BOM_UTF16_LE,
            codecs.BOM_UTF16_BE,
            codecs.BOM_UTF32_LE,
            codecs.BOM_UTF32_BE,
        )
    ):
        raise CurrencyProviderError("unsupported document encoding")
    match = _ENCODING_DECLARATION.search(raw[:_DECLARATION_BYTES])
    if match is None:
        # XML without an encoding declaration is UTF-8 by definition. Guessing
        # another legacy encoding would accept documents the provider never sends.
        return "utf-8"
    try:
        name = codecs.lookup(match.group(1).decode("ascii")).name
    except (LookupError, UnicodeDecodeError) as exc:
        raise CurrencyProviderError("unsupported document encoding") from exc
    if name not in _SUPPORTED_ENCODINGS:
        raise CurrencyProviderError("unsupported document encoding")
    return name


def _decode_document(raw: bytes) -> str:
    """Decode with the declared encoding and reject DTD/entity declarations.

    The check runs on the decoded text, so an alternative byte spelling of the
    markup cannot hide a declaration from it: every accepted encoding is an
    ASCII-compatible superset, hence `<!DOCTYPE`/`<!ENTITY` always decode to the
    same characters the parser will see.
    """
    encoding = _declared_encoding(raw)
    try:
        text = raw.decode(encoding)
    except UnicodeDecodeError as exc:
        raise CurrencyProviderError("undecodable document") from exc
    if _UNSAFE_DECLARATION.search(text):
        raise CurrencyProviderError("document type declarations are not accepted")
    return text


def _single_child_text(entry: ET.Element, tag: str) -> str:
    """Read a field that must be present exactly once and stay a bounded token."""
    matches = entry.findall(tag)
    if len(matches) != 1:
        raise CurrencyProviderError(f"{tag} must appear exactly once")
    raw = matches[0].text
    if raw is None:
        raise CurrencyProviderError(f"{tag} is missing")
    text = raw.strip()
    if not text or len(text) > _MAX_FIELD_LENGTH:
        raise CurrencyProviderError(f"{tag} is not a bounded value")
    return text


def _parse_rate_date(value: str | None) -> date:
    if value is None or not _DATE_PATTERN.match(value.strip()):
        raise CurrencyProviderError("invalid rate date")
    try:
        return datetime.strptime(value.strip(), "%d.%m.%Y").date()
    except ValueError as exc:
        raise CurrencyProviderError("invalid rate date") from exc


def _parse_nominal(text: str) -> int:
    if not _NOMINAL_PATTERN.match(text):
        raise CurrencyProviderError("invalid nominal")
    nominal = int(text)
    if nominal <= 0:
        raise CurrencyProviderError("invalid nominal")
    return nominal


def _parse_value(text: str) -> Decimal:
    """Parse the provider's decimal-comma value without binary floating point.

    The pattern above already restricts the text to plain digits with at most one
    separator, which is always a valid `Decimal` literal.
    """
    if not _VALUE_PATTERN.match(text):
        raise CurrencyProviderError("invalid value")
    value = Decimal(text.replace(",", "."))
    if not value.is_finite() or value <= 0:
        raise CurrencyProviderError("invalid value")
    return value


def _entries_by_code(root: ET.Element) -> dict[str, ET.Element]:
    """Select the required currency entries by `CharCode`, ignoring the rest."""
    found: dict[str, list[ET.Element]] = {code: [] for code in REQUIRED_CURRENCIES}
    for entry in root.findall("Valute"):
        codes = [
            (element.text or "").strip().upper()
            for element in entry.findall("CharCode")
        ]
        for code in REQUIRED_CURRENCIES:
            if code not in codes:
                continue
            if len(codes) != 1:
                raise CurrencyProviderError(f"ambiguous {code} entry")
            found[code].append(entry)
    entries: dict[str, ET.Element] = {}
    for code in REQUIRED_CURRENCIES:
        matches = found[code]
        if len(matches) != 1:
            raise CurrencyProviderError(f"{code} must appear exactly once")
        entries[code] = matches[0]
    return entries


def parse_currency_rates(raw: bytes) -> CurrencyQuote:
    """Validate and normalize one provider document; reject it as a whole."""
    _decode_document(raw)  # Encoding and unsafe-declaration gate before parsing.
    try:
        root = ET.fromstring(raw)
    except ET.ParseError as exc:
        raise CurrencyProviderError("malformed document") from exc
    if root.tag != "ValCurs":
        raise CurrencyProviderError("unexpected root element")
    rate_date = _parse_rate_date(root.get("Date"))
    rates: dict[str, Decimal] = {BASE_CURRENCY: Decimal(1)}
    for code, entry in _entries_by_code(root).items():
        nominal = _parse_nominal(_single_child_text(entry, "Nominal"))
        value = _parse_value(_single_child_text(entry, "Value"))
        # `Value / Nominal` is the single authoritative normalization formula. Both
        # operands are already validated as positive, so the quotient is positive.
        rates[code] = value / Decimal(nominal)
    return CurrencyQuote(rates=rates, rate_date=rate_date)


def _request_timeout() -> httpx.Timeout:
    return httpx.Timeout(
        READ_TIMEOUT_SECONDS,
        connect=CONNECT_TIMEOUT_SECONDS,
        write=READ_TIMEOUT_SECONDS,
        pool=CONNECT_TIMEOUT_SECONDS,
    )


async def _read_bounded_body(response: httpx.Response) -> bytes:
    """Stream the body and stop as soon as the decoded size limit is exceeded."""
    declared = (response.headers.get("content-length") or "").strip()
    if declared.isdigit() and int(declared) > MAX_RESPONSE_BYTES:
        raise CurrencyProviderError("provider response is too large")
    chunks: list[bytes] = []
    size = 0
    async for chunk in response.aiter_bytes():
        size += len(chunk)
        if size > MAX_RESPONSE_BYTES:
            raise CurrencyProviderError("provider response is too large")
        chunks.append(chunk)
    return b"".join(chunks)


async def fetch_quote(
    *, transport: httpx.AsyncBaseTransport | None = None
) -> CurrencyQuote:
    """Fetch the latest daily document from the fixed CBR endpoint.

    A fresh client per call means no cookie jar or credential is ever reused, and
    the endpoint is a constant, so no request target can be influenced by a client.
    """
    try:
        async with asyncio.timeout(REQUEST_DEADLINE_SECONDS):
            async with (
                httpx.AsyncClient(
                    timeout=_request_timeout(),
                    follow_redirects=False,
                    verify=True,
                    transport=transport,
                ) as client,
                client.stream(
                    "GET", CBR_DAILY_URL, headers={"Accept": "application/xml"}
                ) as response,
            ):
                if response.status_code != httpx.codes.OK:
                    raise CurrencyProviderError("unexpected provider status")
                body = await _read_bounded_body(response)
    except CurrencyProviderError:
        raise
    except (TimeoutError, httpx.HTTPError, OSError) as exc:
        raise CurrencyProviderError("provider request failed") from exc
    return parse_currency_rates(body)


Fetcher = Callable[[], Awaitable[CurrencyQuote]]


class ExchangeRateCache:
    """Process-local rate snapshot with stale-on-failure semantics.

    The snapshot is fresh for one hour. After that the next request refreshes it;
    a failed refresh keeps the previous snapshot (reported as stale) and starts a
    one-minute cooldown, so an outage cannot produce one upstream request per view.
    """

    def __init__(
        self,
        *,
        fetcher: Fetcher | None = None,
        monotonic: Callable[[], float] = time.monotonic,
        wall_clock: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._fetcher: Fetcher = fetcher if fetcher is not None else fetch_quote
        self._monotonic = monotonic
        self._wall_clock = wall_clock
        self._snapshot: RateSnapshot | None = None
        self._failure_at: float | None = None
        self._lock: asyncio.Lock | None = None
        self._lock_loop: asyncio.AbstractEventLoop | None = None

    def _refresh_lock(self) -> asyncio.Lock:
        # An `asyncio.Lock` binds to the first event loop that awaits it, while
        # every test client runs the application on a fresh loop.
        loop = asyncio.get_running_loop()
        if self._lock is None or self._lock_loop is not loop:
            self._lock = asyncio.Lock()
            self._lock_loop = loop
        return self._lock

    def _fresh_snapshot(self) -> RateSnapshot | None:
        snapshot = self._snapshot
        if snapshot is None:
            return None
        return (
            snapshot
            if self._monotonic() - snapshot.monotonic_at < CACHE_TTL_SECONDS
            else None
        )

    def _fallback(self) -> tuple[RateSnapshot, bool]:
        snapshot = self._snapshot
        if snapshot is None:
            raise ServiceUnavailableError(PROVIDER_UNAVAILABLE_MESSAGE)
        return snapshot, True

    async def snapshot(self) -> tuple[RateSnapshot, bool]:
        """Return the snapshot in use and whether it is a stale fallback."""
        fresh = self._fresh_snapshot()
        if fresh is not None:
            return fresh, False
        async with self._refresh_lock():
            fresh = self._fresh_snapshot()  # Another waiter may have just refreshed.
            if fresh is not None:
                return fresh, False
            failure_at = self._failure_at
            if (
                failure_at is not None
                and self._monotonic() - failure_at < FAILURE_COOLDOWN_SECONDS
            ):
                return self._fallback()
            try:
                quote = await self._fetcher()
            except Exception as exc:  # Every provider failure must fall back.
                # Never propagate upstream detail to the client; the fixed message
                # and the exception type are enough for server-side diagnosis.
                log.warning("exchange rate refresh failed (%s)", type(exc).__name__)
                self._failure_at = self._monotonic()
                return self._fallback()
            snapshot = RateSnapshot(
                rates=quote.rates,
                rate_date=quote.rate_date,
                fetched_at=self._wall_clock(),
                monotonic_at=self._monotonic(),
            )
            # One immutable assignment publishes a fully validated snapshot.
            self._snapshot = snapshot
            self._failure_at = None
            return snapshot, False


_cache = ExchangeRateCache()


async def get_rates() -> tuple[RateSnapshot, bool]:
    """Public entry point used by the API route."""
    return await _cache.snapshot()
