"""Public exchange-rate contract; RUB is always the base currency."""

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class CurrencyRates(BaseModel):
    """RUB per one unit of each supported currency, as decimal strings."""

    RUB: str = Field(
        description="Always '1': the base currency of every stored amount."
    )
    USD: str = Field(description="Rubles per one US dollar.")
    EUR: str = Field(description="Rubles per one euro.")


class CurrencyRatesResponse(BaseModel):
    """One validated rate snapshot as returned to storefront clients."""

    base_currency: Literal["RUB"] = "RUB"
    rates: CurrencyRates
    rate_date: date = Field(description="Effective date reported by the provider.")
    fetched_at: datetime = Field(description="UTC time of the last successful fetch.")
    stale: bool = Field(
        description="True when an expired snapshot is served because a refresh failed."
    )
    source: Literal["CBR"] = "CBR"
