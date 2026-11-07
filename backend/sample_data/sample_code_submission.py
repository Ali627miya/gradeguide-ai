# [DEMONSTRATION DATA] Fictional student code submission for the CODE assessment section.
"""CampusBook booking helpers."""
from datetime import datetime


class BookingError(Exception):
    """Raised when a booking request is not valid."""


def parse_time(value: str) -> datetime:
    """Parse an ISO time string, rejecting bad input."""
    if not value:
        raise BookingError("Time is required")
    try:
        return datetime.fromisoformat(value)
    except ValueError as exc:
        raise BookingError(f"Invalid time: {value}") from exc


def overlaps(start_a, end_a, start_b, end_b) -> bool:
    return start_a < end_b and start_b < end_a


def book_room(bookings: dict, room: str, start: str, end: str) -> dict:
    """Add a booking if the room is free."""
    s, e = parse_time(start), parse_time(end)
    if e <= s:
        raise BookingError("End must be after start")
    for existing in bookings.get(room, []):
        if overlaps(s, e, existing["start"], existing["end"]):
            raise BookingError("Room already booked")
    booking = {"start": s, "end": e}
    bookings.setdefault(room, []).append(booking)
    return booking


def test_rejects_double_booking():
    bookings = {}
    book_room(bookings, "L1", "2026-11-07T10:00", "2026-11-07T11:00")
    try:
        book_room(bookings, "L1", "2026-11-07T10:30", "2026-11-07T11:30")
        assert False
    except BookingError:
        assert True


def test_end_after_start():
    try:
        book_room({}, "L1", "2026-11-07T11:00", "2026-11-07T10:00")
        assert False
    except BookingError:
        assert True
