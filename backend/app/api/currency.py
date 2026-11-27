"""Public exchange-rate route: no authentication, no database dependency."""

from decimal import Decimal

from fastapi import APIRouter, Response, status

from app.schemas.currency import CurrencyRates, CurrencyRatesResponse
from app.services import currency_rates as service

router = APIRouter(prefix="/api/v1/currency", tags=["currency"])

_UNAVAILABLE_RESPONSE = {"description": "No validated rate snapshot is available."}


def _decimal_text(value: Decimal) -> str:
    """Serialize a `Decimal` rate without exponent notation or float rounding.

    `normalize()` only drops insignificant trailing zeros, so the published
    string keeps the exact normalized value the service computed.
    """
    return format(value.normalize(), "f")


@router.get(
    "/rates",
    response_model=CurrencyRatesResponse,
    responses={status.HTTP_503_SERVICE_UNAVAILABLE: _UNAVAILABLE_RESPONSE},
    summary="Current exchange rates",
)
async def get_currency_rates(response: Response) -> CurrencyRatesResponse:
    snapshot, stale = await service.get_rates()
    # Freshness (and staleness) belongs to this API and to the client query cache,
    # so an intermediary must never answer with a cached copy.
    response.headers["Cache-Control"] = "no-store"
    return CurrencyRatesResponse(
        rates=CurrencyRates(
            RUB=_decimal_text(snapshot.rates[service.BASE_CURRENCY]),
            USD=_decimal_text(snapshot.rates["USD"]),
            EUR=_decimal_text(snapshot.rates["EUR"]),
        ),
        rate_date=snapshot.rate_date,
        fetched_at=snapshot.fetched_at,
        stale=stale,
    )
