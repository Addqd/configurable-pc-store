"""Offline regression tests for the CBR exchange-rate integration.

The upstream transport is mocked; parsing, validation, normalization, caching and
the HTTP contract are the production code paths. No test reaches the internet.
"""

from __future__ import annotations

import asyncio
import codecs
from collections.abc import Awaitable, Callable, Iterable
from datetime import UTC, date, datetime
from decimal import Decimal
from functools import partial
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import currency_rates as service

RATES_PATH = "/api/v1/currency/rates"
EXPECTED_URL = "https://www.cbr.ru/scripts/XML_daily.asp"

FIXED_WALL_CLOCK = datetime(2026, 11, 26, 10, 0, 0, tzinfo=UTC)


# --------------------------------------------------------------------------- fixtures


def _entry(
    code: str,
    nominal: str,
    value: str,
    *,
    vunit_rate: str | None = None,
    char_code_twice: bool = False,
    extra: str = "",
) -> str:
    unit = f"<VunitRate>{vunit_rate}</VunitRate>" if vunit_rate is not None else ""
    codes = f"<CharCode>{code}</CharCode>" * (2 if char_code_twice else 1)
    return (
        "<Valute>"
        "<NumCode>840</NumCode>"
        f"{codes}"
        f"<Nominal>{nominal}</Nominal>"
        "<Name>Доллар США</Name>"
        f"<Value>{value}</Value>"
        f"{unit}"
        f"{extra}"
        "</Valute>"
    )


DEFAULT_ENTRIES = (
    _entry("USD", "1", "90,1234", vunit_rate="90,1234"),
    _entry("EUR", "1", "100,5678", vunit_rate="100,5678"),
    _entry("CNY", "1", "12,5000"),
)


def _document(
    entries: Iterable[str] = DEFAULT_ENTRIES,
    *,
    rate_date: str = "26.11.2026",
    encoding: str = "windows-1251",
    declaration: str | None = None,
    body: str | None = None,
) -> bytes:
    text = (
        body
        if body is not None
        else (
            f'<?xml version="1.0" encoding="{encoding}"?>'
            f'<ValCurs Date="{rate_date}" name="Foreign Currency Market">'
            f"{''.join(entries)}"
            "</ValCurs>"
        )
    )
    if declaration is not None:
        text = declaration + text
    return text.encode(encoding)


def _quote(usd: str = "90", eur: str = "100") -> service.CurrencyQuote:
    return service.CurrencyQuote(
        rates={
            "RUB": Decimal(1),
            "USD": Decimal(usd),
            "EUR": Decimal(eur),
        },
        rate_date=date(2026, 11, 26),
    )


def _transport(
    handler: Callable[[httpx.Request], httpx.Response],
) -> httpx.MockTransport:
    return httpx.MockTransport(handler)


def _ok_handler(
    raw: bytes, seen: list[httpx.Request] | None = None
) -> Callable[[httpx.Request], httpx.Response]:
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        return httpx.Response(
            200, content=raw, headers={"Content-Type": "application/xml"}
        )

    return handler


class Clock:
    """Controllable monotonic clock."""

    def __init__(self, start: float = 1000.0) -> None:
        self.now = start

    def __call__(self) -> float:
        return self.now

    def advance(self, seconds: float) -> None:
        self.now += seconds


def _cache_with(
    *,
    raw: bytes | None = None,
    handler: Callable[[httpx.Request], httpx.Response] | None = None,
    monkeypatch: pytest.MonkeyPatch,
    clock: Clock | None = None,
    seen: list[httpx.Request] | None = None,
) -> service.ExchangeRateCache:
    """Install a cache whose transport is mocked but whose parser is real."""
    resolved_handler = (
        handler if handler is not None else _ok_handler(raw or _document(), seen)
    )
    cache = service.ExchangeRateCache(
        fetcher=partial(service.fetch_quote, transport=_transport(resolved_handler)),
        monotonic=clock or Clock(),
        wall_clock=lambda: FIXED_WALL_CLOCK,
    )
    monkeypatch.setattr(service, "_cache", cache)
    return cache


def _run(coro: Awaitable[Any]) -> Any:
    return asyncio.run(coro)  # type: ignore[arg-type]


# ------------------------------------------------------------------- provider request


def test_requests_the_fixed_official_endpoint_once_without_date_parameter(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seen: list[httpx.Request] = []
    _cache_with(raw=_document(), monkeypatch=monkeypatch, seen=seen)

    with TestClient(app) as client:
        assert client.get(RATES_PATH).status_code == 200

    assert len(seen) == 1
    assert seen[0].method == "GET"
    assert str(seen[0].url) == EXPECTED_URL
    assert "date_req" not in seen[0].url.params
    # No credential or cookie of any client is forwarded to the provider.
    assert "authorization" not in seen[0].headers
    assert "cookie" not in seen[0].headers


@pytest.mark.parametrize(
    ("encoding", "ids"),
    [("windows-1251", "cp1251"), ("utf-8", "utf-8")],
)
def test_parses_declared_encodings(
    encoding: str, ids: str, monkeypatch: pytest.MonkeyPatch
) -> None:
    _cache_with(raw=_document(encoding=encoding), monkeypatch=monkeypatch)
    with TestClient(app) as client:
        body = client.get(RATES_PATH).json()
    assert body["rates"] == {"RUB": "1", "USD": "90.1234", "EUR": "100.5678"}


def test_returns_both_required_rates_from_one_upstream_request(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, content=_document())

    _cache_with(handler=handler, monkeypatch=monkeypatch)
    with TestClient(app) as client:
        body = client.get(RATES_PATH).json()
    assert calls == 1
    assert set(body["rates"]) == {"RUB", "USD", "EUR"}


# ------------------------------------------------------------------------ normalization


def test_decimal_comma_is_normalized_and_rate_date_comes_from_the_document(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _cache_with(raw=_document(rate_date="31.12.2026"), monkeypatch=monkeypatch)
    with TestClient(app) as client:
        body = client.get(RATES_PATH).json()
    assert body["rates"]["USD"] == "90.1234"
    assert body["rates"]["EUR"] == "100.5678"
    assert body["rate_date"] == "2026-12-31"


def test_nominal_other_than_one_divides_the_value(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    raw = _document(
        (
            _entry("USD", "10", "900,0000"),
            _entry("EUR", "100", "10056,7800"),
        )
    )
    _cache_with(raw=raw, monkeypatch=monkeypatch)
    with TestClient(app) as client:
        body = client.get(RATES_PATH).json()
    assert body["rates"]["USD"] == "90"
    assert body["rates"]["EUR"] == "100.5678"


def test_normalization_uses_decimal_not_binary_float() -> None:
    quote = service.parse_currency_rates(
        _document((_entry("USD", "1", "0,1000"), _entry("EUR", "1", "100,5678")))
    )
    # The same arithmetic in binary floating point gives 0.30000000000000004.
    assert quote.rates["USD"] * 3 == Decimal("0.3")
    assert quote.rates["USD"] == Decimal("0.1")


def test_unrelated_currencies_are_ignored_and_vunit_rate_is_optional(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    raw = _document(
        (
            _entry("CNY", "1", "12,5000"),
            _entry("USD", "1", "90,1234"),  # no VunitRate element
            _entry("EUR", "1", "100,5678"),
            _entry("GBP", "1", "111,1111"),
        )
    )
    _cache_with(raw=raw, monkeypatch=monkeypatch)
    with TestClient(app) as client:
        body = client.get(RATES_PATH).json()
    assert body["rates"] == {"RUB": "1", "USD": "90.1234", "EUR": "100.5678"}


def test_extra_provider_metadata_is_tolerated() -> None:
    quote = service.parse_currency_rates(
        _document(
            (
                _entry("USD", "1", "90,1234", extra="<Name>Доллар США</Name>"),
                _entry("EUR", "1", "100,5678"),
            )
        )
    )
    assert quote.rates["USD"] == Decimal("90.1234")


# ----------------------------------------------------------------------- XML hardening


@pytest.mark.parametrize(
    "body",
    [
        (
            '<!DOCTYPE ValCurs [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>'
            '<ValCurs Date="26.11.2026">&xxe;</ValCurs>'
        ),
        (
            '<!doctype valcurs system "http://example.test/a.dtd">'
            '<ValCurs Date="26.11.2026"></ValCurs>'
        ),
        '<ValCurs Date="26.11.2026"><!ENTITY a "b"></ValCurs>',
    ],
    ids=["doctype-internal-entity", "lowercase-doctype", "entity-declaration"],
)
def test_rejects_dtd_and_entity_declarations(body: str) -> None:
    with pytest.raises(service.CurrencyProviderError):
        service.parse_currency_rates(_document(body=body))


def test_dtd_check_reads_the_document_through_its_declared_encoding() -> None:
    body = (
        '<!DOCTYPE ValCurs SYSTEM "http://example.test/a.dtd">'
        '<ValCurs Date="26.11.2026"></ValCurs>'
    )
    # The same declaration encoded as windows-1251 must still be found.
    with pytest.raises(service.CurrencyProviderError):
        service.parse_currency_rates(_document(body=body, encoding="windows-1251"))


@pytest.mark.parametrize(
    "raw",
    [
        '<?xml version="1.0" encoding="iso-8859-1"?><ValCurs Date="26.11.2026"/>'.encode(
            "iso-8859-1"
        ),
        '<?xml version="1.0" encoding="utf-16"?><ValCurs Date="26.11.2026"/>'.encode(
            "utf-16"
        ),
        '\ufeff<?xml version="1.0" encoding="utf-16"?><ValCurs/>'.encode("utf-16-le"),
    ],
    ids=["unsupported-declared", "utf16-declared", "utf16-bom"],
)
def test_rejects_unsupported_encodings(raw: bytes) -> None:
    with pytest.raises(service.CurrencyProviderError):
        service.parse_currency_rates(raw)


def test_rejects_body_that_does_not_match_its_declared_encoding() -> None:
    body = '<ValCurs Date="26.11.2026">Доллар</ValCurs>'.encode("cp1251")
    raw = b'<?xml version="1.0" encoding="utf-8"?>' + body
    with pytest.raises(service.CurrencyProviderError):
        service.parse_currency_rates(raw)


def test_document_without_an_encoding_declaration_is_read_as_utf_8() -> None:
    body = f'<ValCurs Date="26.11.2026">{"".join(DEFAULT_ENTRIES)}</ValCurs>'
    quote = service.parse_currency_rates(_document(body=body, encoding="utf-8"))
    assert quote.rates["USD"] == Decimal("90.1234")
    assert quote.rate_date == date(2026, 11, 26)


def test_rejects_an_unknown_encoding_name() -> None:
    raw = b'<?xml version="1.0" encoding="klingon-1"?><ValCurs Date="26.11.2026"/>'
    with pytest.raises(service.CurrencyProviderError):
        service.parse_currency_rates(raw)


def test_accepts_a_utf_8_byte_order_mark() -> None:
    body = f'<ValCurs Date="26.11.2026">{"".join(DEFAULT_ENTRIES)}</ValCurs>'
    raw = codecs.BOM_UTF8 + body.encode("utf-8")
    quote = service.parse_currency_rates(raw)
    assert quote.rates["EUR"] == Decimal("100.5678")


@pytest.mark.parametrize(
    "raw",
    [
        b"",
        b"<ValCurs",
        b"<?xml version='1.0'?><Valute/>",
        b"<ValCurs Date='26.11.2026'><Valute>",
    ],
    ids=["empty", "truncated", "wrong-root", "unclosed"],
)
def test_rejects_malformed_documents(raw: bytes) -> None:
    with pytest.raises(service.CurrencyProviderError):
        service.parse_currency_rates(raw)


@pytest.mark.parametrize(
    "rate_date",
    [
        "2026-11-26",
        "26/11/2026",
        "6.11.2026",
        "32.11.2026",
        "26.13.2026",
        "",
        "26.11.26",
    ],
)
def test_rejects_invalid_rate_dates(rate_date: str) -> None:
    with pytest.raises(service.CurrencyProviderError):
        service.parse_currency_rates(_document(rate_date=rate_date))


def test_rejects_missing_rate_date() -> None:
    body = (
        f'<ValCurs name="Foreign Currency Market">{"".join(DEFAULT_ENTRIES)}</ValCurs>'
    )
    with pytest.raises(service.CurrencyProviderError):
        service.parse_currency_rates(_document(body=body))


@pytest.mark.parametrize(
    "entries",
    [
        (_entry("USD", "1", "90,1234"),),
        (_entry("EUR", "1", "100,5678"),),
        (),
        (_entry("CNY", "1", "12,5000"),),
    ],
    ids=["missing-eur", "missing-usd", "no-entries", "only-unrelated"],
)
def test_rejects_missing_required_currencies(entries: tuple[str, ...]) -> None:
    with pytest.raises(service.CurrencyProviderError):
        service.parse_currency_rates(_document(entries))


def test_rejects_duplicate_required_currency() -> None:
    entries = (
        _entry("USD", "1", "90,1234"),
        _entry("USD", "1", "91,0000"),
        _entry("EUR", "1", "100,5678"),
    )
    with pytest.raises(service.CurrencyProviderError):
        service.parse_currency_rates(_document(entries))


def test_rejects_entry_with_repeated_required_field() -> None:
    entry = (
        "<Valute><CharCode>USD</CharCode><Nominal>1</Nominal>"
        "<Value>90,1234</Value><Value>91,0000</Value></Valute>"
    )
    with pytest.raises(service.CurrencyProviderError):
        service.parse_currency_rates(_document((entry, _entry("EUR", "1", "100,5678"))))


def test_rejects_entry_with_repeated_char_code() -> None:
    with pytest.raises(service.CurrencyProviderError):
        service.parse_currency_rates(
            _document(
                (
                    _entry("USD", "1", "90,1234", char_code_twice=True),
                    _entry("EUR", "1", "100,5678"),
                )
            )
        )


@pytest.mark.parametrize("field", ["Nominal", "Value"])
def test_rejects_missing_required_field(field: str) -> None:
    entry = (
        "<Valute><CharCode>USD</CharCode>"
        + ("" if field == "Nominal" else "<Nominal>1</Nominal>")
        + ("" if field == "Value" else "<Value>90,1234</Value>")
        + "</Valute>"
    )
    with pytest.raises(service.CurrencyProviderError):
        service.parse_currency_rates(_document((entry, _entry("EUR", "1", "100,5678"))))


@pytest.mark.parametrize(
    "nominal",
    ["0", "-1", "1.5", "1e3", "", "  ", "abcdef", "9999999999"],
)
def test_rejects_invalid_nominal(nominal: str) -> None:
    with pytest.raises(service.CurrencyProviderError):
        service.parse_currency_rates(
            _document((_entry("USD", nominal, "90,1234"), _entry("EUR", "1", "1")))
        )


@pytest.mark.parametrize(
    "value",
    [
        "0",
        "0,0000",
        "-90,1234",
        "NaN",
        "Infinity",
        "-Infinity",
        "1e5",
        "9,1,2",
        "",
        "  ",
        "90.1234.5",
        "12345678901234",  # 14 integer digits: beyond the bounded field length
        "1," + "1" * 11,  # 11 fractional digits: beyond the bounded field length
    ],
)
def test_rejects_invalid_values(value: str) -> None:
    with pytest.raises(service.CurrencyProviderError):
        service.parse_currency_rates(
            _document((_entry("USD", "1", value), _entry("EUR", "1", "1")))
        )


def test_rejects_excessively_long_field() -> None:
    with pytest.raises(service.CurrencyProviderError):
        service.parse_currency_rates(
            _document(
                (
                    _entry("USD", "1", "9" * 40),
                    _entry("EUR", "1", "100,5678"),
                )
            )
        )


def test_rejects_the_whole_snapshot_when_one_currency_is_invalid() -> None:
    entries = (_entry("USD", "1", "90,1234"), _entry("EUR", "1", "-5,0000"))
    with pytest.raises(service.CurrencyProviderError):
        service.parse_currency_rates(_document(entries))


# ------------------------------------------------------------------------ HTTP failures


@pytest.mark.parametrize(
    "handler",
    [
        lambda request: httpx.Response(500),
        lambda request: httpx.Response(404),
        lambda request: httpx.Response(302, headers={"Location": "/elsewhere"}),
        lambda request: httpx.Response(204),
    ],
    ids=["server-error", "not-found", "redirect", "empty-success"],
)
def test_unexpected_status_is_a_provider_failure(
    handler: Callable[[httpx.Request], httpx.Response],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _cache_with(handler=handler, monkeypatch=monkeypatch)
    with TestClient(app) as client:
        response = client.get(RATES_PATH)
    assert response.status_code == 503
    assert response.json() == {"detail": service.PROVIDER_UNAVAILABLE_MESSAGE}


@pytest.mark.parametrize(
    "error",
    [
        httpx.ConnectError("connection failed"),
        httpx.ReadTimeout("read timed out"),
        httpx.ConnectTimeout("connect timed out"),
        httpx.RemoteProtocolError("broken protocol"),
    ],
    ids=["connect", "read-timeout", "connect-timeout", "protocol"],
)
def test_transport_failures_are_controlled(
    error: Exception, monkeypatch: pytest.MonkeyPatch
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise error

    _cache_with(handler=handler, monkeypatch=monkeypatch)
    with TestClient(app) as client:
        response = client.get(RATES_PATH)
    assert response.status_code == 503
    assert response.json() == {"detail": service.PROVIDER_UNAVAILABLE_MESSAGE}


def test_oversized_response_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    padding = b"<!--" + b"x" * service.MAX_RESPONSE_BYTES + b"-->"
    raw = _document().replace(b"</ValCurs>", padding + b"</ValCurs>")
    assert len(raw) > service.MAX_RESPONSE_BYTES

    _cache_with(raw=raw, monkeypatch=monkeypatch)
    with TestClient(app) as client:
        response = client.get(RATES_PATH)
    assert response.status_code == 503


def test_oversized_body_is_rejected_without_content_length(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The stream itself is bounded, so a missing/lying Content-Length is not enough."""

    def handler(request: httpx.Request) -> httpx.Response:
        async def body() -> Any:
            chunk = b"x" * 65536
            for _ in range(8):  # 512 KiB, twice the limit
                yield chunk

        return httpx.Response(
            200, headers={"Content-Type": "application/xml"}, content=body()
        )

    _cache_with(handler=handler, monkeypatch=monkeypatch)
    with TestClient(app) as client:
        response = client.get(RATES_PATH)
    assert response.status_code == 503


# ------------------------------------------------------------------------------ cache


def test_snapshot_is_reused_within_its_freshness_lifetime(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    clock = Clock()
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(200, content=_document())

    _cache_with(handler=handler, monkeypatch=monkeypatch, clock=clock)
    with TestClient(app) as client:
        for _ in range(5):
            assert client.get(RATES_PATH).status_code == 200
            clock.advance(600)
    assert calls == 1


def test_snapshot_expires_after_one_hour(monkeypatch: pytest.MonkeyPatch) -> None:
    clock = Clock()
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        value = "90,0000" if calls == 1 else "95,0000"
        return httpx.Response(
            200,
            content=_document(
                (_entry("USD", "1", value), _entry("EUR", "1", "100,5678"))
            ),
        )

    _cache_with(handler=handler, monkeypatch=monkeypatch, clock=clock)
    with TestClient(app) as client:
        assert client.get(RATES_PATH).json()["rates"]["USD"] == "90"
        clock.advance(service.CACHE_TTL_SECONDS - 0.5)
        assert calls == 1
        clock.advance(0.5)
        assert client.get(RATES_PATH).json()["rates"]["USD"] == "95"
    assert calls == 2


def test_concurrent_requests_trigger_exactly_one_refresh(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = 0

    async def fetcher() -> service.CurrencyQuote:
        nonlocal calls
        calls += 1
        await asyncio.sleep(0.02)  # Let every waiter queue on the lock.
        return _quote()

    cache = service.ExchangeRateCache(fetcher=fetcher, monotonic=Clock())
    monkeypatch.setattr(service, "_cache", cache)

    async def collect() -> list[tuple[service.RateSnapshot, bool]]:
        return await asyncio.gather(*(cache.snapshot() for _ in range(5)))

    results = _run(collect())
    assert calls == 1
    assert all(not stale for _, stale in results)
    assert len({id(snapshot) for snapshot, _ in results}) == 1


def test_failed_refresh_keeps_the_previous_snapshot_and_its_fetch_time(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    clock = Clock()
    state = {"fail": False}

    async def fetcher() -> service.CurrencyQuote:
        if state["fail"]:
            raise service.CurrencyProviderError("upstream down")
        return _quote()

    cache = service.ExchangeRateCache(
        fetcher=fetcher, monotonic=clock, wall_clock=lambda: FIXED_WALL_CLOCK
    )
    monkeypatch.setattr(service, "_cache", cache)

    first, stale = _run(cache.snapshot())
    assert stale is False
    clock.advance(service.CACHE_TTL_SECONDS)
    state["fail"] = True
    second, stale = _run(cache.snapshot())
    assert stale is True
    assert second.rates == first.rates
    assert second.fetched_at == first.fetched_at
    assert second.monotonic_at == first.monotonic_at


def test_refresh_replaces_the_snapshot_atomically(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    clock = Clock()
    state = {"value": "90", "fail": False}

    async def fetcher() -> service.CurrencyQuote:
        if state["fail"]:
            raise service.CurrencyProviderError("upstream down")
        return _quote(usd=state["value"])

    cache = service.ExchangeRateCache(fetcher=fetcher, monotonic=clock)
    monkeypatch.setattr(service, "_cache", cache)

    assert _run(cache.snapshot())[0].rates["USD"] == Decimal(90)
    state["value"] = "95"
    state["fail"] = True
    clock.advance(service.CACHE_TTL_SECONDS)
    # A failing refresh must not partially publish anything.
    snapshot, stale = _run(cache.snapshot())
    assert stale is True
    assert snapshot.rates["USD"] == Decimal(90)
    clock.advance(service.FAILURE_COOLDOWN_SECONDS)
    state["fail"] = False
    snapshot, stale = _run(cache.snapshot())
    assert stale is False
    assert snapshot.rates["USD"] == Decimal(95)


def test_failure_cooldown_prevents_repeated_upstream_attempts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    clock = Clock()
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(500)

    _cache_with(handler=handler, monkeypatch=monkeypatch, clock=clock)
    with TestClient(app) as client:
        assert client.get(RATES_PATH).status_code == 503
        clock.advance(service.FAILURE_COOLDOWN_SECONDS - 1)
        assert client.get(RATES_PATH).status_code == 503
    assert calls == 1


def test_cooldown_expires_and_refresh_is_attempted_again(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    clock = Clock()
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(500)

    _cache_with(handler=handler, monkeypatch=monkeypatch, clock=clock)
    with TestClient(app) as client:
        assert client.get(RATES_PATH).status_code == 503
        clock.advance(service.FAILURE_COOLDOWN_SECONDS)
        assert client.get(RATES_PATH).status_code == 503
    assert calls == 2


def test_successful_refresh_clears_the_failure_cooldown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    clock = Clock()
    state = {"fail": True}

    def handler(request: httpx.Request) -> httpx.Response:
        if state["fail"]:
            return httpx.Response(500)
        return httpx.Response(200, content=_document())

    _cache_with(handler=handler, monkeypatch=monkeypatch, clock=clock)
    with TestClient(app) as client:
        assert client.get(RATES_PATH).status_code == 503
    state["fail"] = False
    clock.advance(service.FAILURE_COOLDOWN_SECONDS)
    with TestClient(app) as client:
        assert client.get(RATES_PATH).status_code == 200


def test_no_snapshot_and_failed_refresh_is_http_503(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _cache_with(handler=lambda request: httpx.Response(500), monkeypatch=monkeypatch)
    with TestClient(app) as client:
        response = client.get(RATES_PATH)
    assert response.status_code == 503
    assert response.json() == {"detail": service.PROVIDER_UNAVAILABLE_MESSAGE}


def test_stale_snapshot_is_served_with_http_200(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    clock = Clock()
    state = {"fail": False}

    def handler(request: httpx.Request) -> httpx.Response:
        if state["fail"]:
            return httpx.Response(500)
        return httpx.Response(200, content=_document())

    _cache_with(handler=handler, monkeypatch=monkeypatch, clock=clock)
    with TestClient(app) as client:
        first = client.get(RATES_PATH).json()
        state["fail"] = True
        clock.advance(service.CACHE_TTL_SECONDS)
        second = client.get(RATES_PATH)
    assert second.status_code == 200
    body = second.json()
    assert body["stale"] is True
    assert body["rates"] == first["rates"]
    assert body["fetched_at"] == first["fetched_at"]


# ----------------------------------------------------------------------- HTTP contract


def test_response_contract_and_cache_control(monkeypatch: pytest.MonkeyPatch) -> None:
    _cache_with(raw=_document(), monkeypatch=monkeypatch)
    with TestClient(app) as client:
        response = client.get(RATES_PATH)
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert response.json() == {
        "base_currency": "RUB",
        "rates": {"RUB": "1", "USD": "90.1234", "EUR": "100.5678"},
        "rate_date": "2026-11-26",
        "fetched_at": "2026-11-26T10:00:00Z",
        "stale": False,
        "source": "CBR",
    }


def test_endpoint_needs_no_authentication_or_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No token, no cookie and no DB session override: the route still answers."""
    _cache_with(raw=_document(), monkeypatch=monkeypatch)
    client = TestClient(app)
    response = client.get(RATES_PATH, headers={})
    assert response.status_code == 200
    assert "set-cookie" not in response.headers


def test_application_startup_does_not_fetch_rates(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[float] = []

    async def forbidden() -> service.CurrencyQuote:
        calls.append(1.0)
        raise AssertionError("rates must not be fetched during startup")

    monkeypatch.setattr(service, "_cache", service.ExchangeRateCache(fetcher=forbidden))
    with TestClient(app) as client:
        assert client.get("/").status_code == 200
        assert client.get("/health/db").status_code in {200, 503}
    assert calls == []


def test_openapi_documents_the_public_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    with TestClient(app) as client:
        spec = client.get("/openapi.json").json()
    operation = spec["paths"][RATES_PATH]["get"]
    assert "security" not in operation
    assert "200" in operation["responses"]
    assert "503" in operation["responses"]
    schema = spec["components"]["schemas"]["CurrencyRatesResponse"]
    assert set(schema["properties"]) == {
        "base_currency",
        "rates",
        "rate_date",
        "fetched_at",
        "stale",
        "source",
    }
    assert set(spec["components"]["schemas"]["CurrencyRates"]["properties"]) == {
        "RUB",
        "USD",
        "EUR",
    }
