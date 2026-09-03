import logging
import re
from logging import Logger
from src.config import get_settings


class SanitizedFormatter(logging.Formatter):
    """Formatter that redacts sensitive data from logs"""

    PATTERNS = [
        (r'password["\']?\s*[:=]\s*["\']([^"\']+)["\']', r'password: ***REDACTED***'),
        (r'authorization["\']?\s*:\s*Bearer\s+(\S+)', r'authorization: Bearer ***TOKEN***'),
        (r'x-csrf-token["\']?\s*:\s*(\S+)', r'x-csrf-token: ***REDACTED***'),
        (r'cookie["\']?\s*:\s*([^;]+)', r'cookie: ***REDACTED***'),
        (r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', r'***EMAIL***'),
        (r'P4-[A-Z0-9]{3}', r'P4-***'),  # Aircraft registration
    ]

    def format(self, record: logging.LogRecord) -> str:
        msg = super().format(record)
        for pattern, replacement in self.PATTERNS:
            msg = re.sub(pattern, replacement, msg, flags=re.IGNORECASE)
        return msg


def setup_logger(name: str, level: str = "INFO") -> Logger:
    """Configure a logger with sanitized output"""

    logger = logging.getLogger(name)
    logger.setLevel(getattr(logging, level))

    # Console handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(getattr(logging, level))
    formatter = SanitizedFormatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    )
    console_handler.setFormatter(formatter)

    # File handler
    settings = get_settings()
    file_handler = logging.FileHandler(settings.log_file)
    file_handler.setLevel(getattr(logging, level))
    file_handler.setFormatter(formatter)

    # Clear existing handlers and add new ones
    logger.handlers.clear()
    logger.addHandler(console_handler)
    logger.addHandler(file_handler)

    return logger


logger = setup_logger("aims_parser")
