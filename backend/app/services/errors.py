"""Domain errors raised by services and mapped to HTTP responses by `main`."""

from __future__ import annotations


class ServiceError(Exception):
    """Base class for expected, user-facing service failures."""

    status_code = 400

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class InvalidInputError(ServiceError):
    status_code = 422


class NotFoundError(ServiceError):
    status_code = 404


class ConflictError(ServiceError):
    status_code = 409


class ForbiddenError(ServiceError):
    status_code = 403


class PayloadTooLargeError(ServiceError):
    status_code = 413


class ServiceUnavailableError(ServiceError):
    status_code = 503
