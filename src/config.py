import os
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """Application configuration from environment variables"""

    # AIMS Configuration
    aims_base_url: str = "https://aims.airastana.com"
    aims_username: str = ""
    aims_password: str = ""

    # Redis
    redis_url: str = "redis://localhost:6379"
    redis_session_ttl: int = 1500  # 25 minutes

    # Logging
    log_level: str = "INFO"
    log_file: str = "parser.log"

    # Request settings
    request_timeout: int = 30
    max_retries: int = 3
    retry_backoff_base: int = 2

    # Rate limiting
    rate_limit_delay: float = 1.0  # seconds between requests
    rate_limit_max_per_minute: int = 3

    # Browser (Selenium)
    browser_headless: bool = True
    browser_timeout: int = 10
    use_browser_for_js_content: bool = True

    # AWS/Vault (optional)
    aws_region: str = "eu-west-1"
    vault_addr: str = ""
    vault_token: str = ""

    # Application
    app_name: str = "AIMS eCrew Parser"
    app_version: str = "1.0.0"
    debug: bool = False

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"
        case_sensitive = False


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
