"""Domain exceptions for the service layer.

Services raise these; the global exception handlers in main.py translate
them to HTTP responses. Nothing in the service layer imports from FastAPI.
"""


class ServiceError(Exception):
    """Base class for all domain errors."""


class NotFound(ServiceError):
    """The requested resource does not exist."""


class PermissionDenied(ServiceError):
    """The actor is not allowed to perform this operation."""


class InvalidOperation(ServiceError):
    """The operation is invalid given the current state or constraints."""


class Conflict(ServiceError):
    """The operation conflicts with existing data (e.g. duplicate)."""


class PayloadTooLarge(ServiceError):
    """The uploaded payload exceeds the allowed size."""


class Unauthorized(ServiceError):
    """The request is not authenticated (wrong credentials, expired token)."""
