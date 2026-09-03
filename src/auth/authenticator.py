import requests
import redis
import json
from typing import Tuple, Dict, Optional
from bs4 import BeautifulSoup
from src.config import get_settings
from src.utils.logger import logger


class AImsAuthenticator:
    """Authenticate against AIMS eCrew with CSRF protection and session caching"""

    def __init__(self, username: str, password: str):
        self.username = username
        self.password = password
        self.settings = get_settings()
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
                         '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        })

        # Redis client for session caching
        try:
            self.redis_client = redis.from_url(self.settings.redis_url)
            self.redis_client.ping()
        except Exception as e:
            logger.warning(f"Redis unavailable: {e}. Session caching disabled.")
            self.redis_client = None

    def get_csrf_token(self) -> Optional[str]:
        """Extract CSRF token from login page"""
        try:
            response = self.session.get(
                f"{self.settings.aims_base_url}/login",
                timeout=self.settings.request_timeout
            )
            response.raise_for_status()

            soup = BeautifulSoup(response.text, 'html.parser')

            # Try meta tag first
            csrf_meta = soup.find('meta', {'name': 'csrf-token'})
            if csrf_meta:
                token = csrf_meta.get('content')
                logger.debug(f"CSRF token extracted from meta tag: {token[:10]}...")
                return token

            # Try hidden input
            csrf_input = soup.find('input', {'name': '_csrf'})
            if csrf_input:
                token = csrf_input.get('value')
                logger.debug(f"CSRF token extracted from input: {token[:10]}...")
                return token

            logger.error("CSRF token not found on login page")
            return None

        except requests.RequestException as e:
            logger.error(f"Failed to fetch login page: {e}")
            return None

    def authenticate(self) -> Tuple[bool, str]:
        """Perform authentication with CSRF protection"""
        csrf_token = self.get_csrf_token()
        if not csrf_token:
            return False, "Could not extract CSRF token"

        payload = {
            "username": self.username,
            "password": self.password,
            "_csrf": csrf_token
        }

        headers = {
            'X-CSRF-Token': csrf_token,
            'Content-Type': 'application/json'
        }

        try:
            response = self.session.post(
                f"{self.settings.aims_base_url}/api/auth/login",
                json=payload,
                headers=headers,
                timeout=self.settings.request_timeout,
                allow_redirects=True
            )

            if response.status_code == 401:
                logger.warning(f"Authentication failed for {self.username}: Invalid credentials")
                return False, "Invalid username or password"

            if response.status_code == 403:
                logger.warning(f"Access denied for {self.username}: 2FA or account locked")
                return False, "Access forbidden (2FA enabled or account locked)"

            if response.status_code != 200:
                logger.error(f"Unexpected status {response.status_code} during auth")
                return False, f"Authentication error: HTTP {response.status_code}"

            # Try to extract JWT token if provided
            try:
                data = response.json()
                jwt_token = data.get('token') or data.get('access_token')
                if jwt_token:
                    self.session.headers['Authorization'] = f'Bearer {jwt_token}'
                    logger.debug("JWT token set in Authorization header")
            except:
                pass  # JWT might be in cookies only

            # Cache session in Redis
            if self.redis_client:
                try:
                    session_data = {
                        'cookies': self.session.cookies.get_dict(),
                        'headers': dict(self.session.headers),
                        'username': self.username
                    }
                    session_key = f"aims_session:{self.username}"
                    self.redis_client.setex(
                        session_key,
                        self.settings.redis_session_ttl,
                        json.dumps(session_data)
                    )
                    logger.info(f"Session cached for {self.username} ({self.settings.redis_session_ttl}s TTL)")
                except Exception as e:
                    logger.warning(f"Failed to cache session: {e}")

            logger.info(f"Successfully authenticated {self.username}")
            return True, "OK"

        except requests.Timeout:
            logger.error("Authentication request timed out")
            return False, "Authentication timeout"
        except requests.RequestException as e:
            logger.error(f"Network error during authentication: {e}")
            return False, f"Network error: {str(e)}"

    def is_authenticated(self) -> bool:
        """Check if current session is still valid"""
        try:
            response = self.session.get(
                f"{self.settings.aims_base_url}/api/auth/status",
                timeout=5
            )
            is_valid = response.status_code == 200
            logger.debug(f"Session validity check: {is_valid}")
            return is_valid
        except Exception as e:
            logger.debug(f"Session check failed: {e}")
            return False

    def get_cached_session(self) -> Optional[Dict]:
        """Retrieve cached session from Redis"""
        if not self.redis_client:
            return None

        try:
            session_key = f"aims_session:{self.username}"
            cached = self.redis_client.get(session_key)
            if cached:
                logger.info(f"Retrieved cached session for {self.username}")
                return json.loads(cached)
        except Exception as e:
            logger.warning(f"Failed to retrieve cached session: {e}")

        return None

    def restore_from_cache(self) -> bool:
        """Restore session from Redis cache"""
        cached_session = self.get_cached_session()
        if not cached_session:
            return False

        try:
            # Restore cookies
            for name, value in cached_session.get('cookies', {}).items():
                self.session.cookies.set(name, value)

            # Restore headers
            for name, value in cached_session.get('headers', {}).items():
                if name not in ['Connection', 'Content-Length']:  # Skip non-persistent headers
                    self.session.headers[name] = value

            logger.info(f"Session restored from cache for {self.username}")
            return True
        except Exception as e:
            logger.error(f"Failed to restore session from cache: {e}")
            return False
