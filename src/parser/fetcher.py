import requests
import time
from typing import Dict, Any, Optional
from src.config import get_settings
from src.utils.logger import logger


class ScheduleFetcher:
    """Fetch schedule data from AIMS eCrew with retry and rate limiting"""

    def __init__(self, session: requests.Session):
        self.session = session
        self.settings = get_settings()

    def fetch_schedule(
        self,
        start_date: str,
        end_date: str,
        crew_id: Optional[str] = None,
        max_retries: int = None
    ) -> Dict[str, Any]:
        """
        Fetch schedule from AIMS eCrew with automatic retry and rate limit handling.

        Args:
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            crew_id: Optional crew filter
            max_retries: Max retry attempts (default: settings.max_retries)

        Returns:
            Dict with 'data' key or 'error' key
        """
        max_retries = max_retries or self.settings.max_retries

        for attempt in range(max_retries):
            try:
                params = {
                    'start_date': start_date,
                    'end_date': end_date
                }
                if crew_id:
                    params['crew_id'] = crew_id

                logger.debug(f"Fetching schedule: {start_date} to {end_date} (attempt {attempt + 1}/{max_retries})")

                response = self.session.get(
                    f"{self.settings.aims_base_url}/api/schedule",
                    params=params,
                    timeout=self.settings.request_timeout
                )

                # Handle rate limiting
                if response.status_code == 429:
                    wait_time = int(response.headers.get('Retry-After', 60))
                    logger.warning(f"Rate limited: waiting {wait_time}s (attempt {attempt + 1}/{max_retries})")
                    if attempt < max_retries - 1:
                        time.sleep(wait_time)
                        continue
                    return {'error': 'Rate limit exceeded after retries'}

                # Handle authentication errors
                if response.status_code == 401:
                    logger.error("Session expired (401)")
                    return {'error': 'Unauthorized', 'need_reauth': True}

                if response.status_code == 403:
                    logger.error("Access forbidden (403)")
                    return {'error': 'Forbidden'}

                if response.status_code != 200:
                    logger.error(f"HTTP {response.status_code}: {response.text[:200]}")
                    if attempt < max_retries - 1:
                        backoff = self.settings.retry_backoff_base ** attempt
                        logger.debug(f"Retrying in {backoff}s...")
                        time.sleep(backoff)
                        continue
                    return {'error': f'HTTP {response.status_code}'}

                # Check if response is JSON or HTML
                try:
                    data = response.json()
                    logger.info(f"Successfully fetched schedule (JSON format)")
                    return {'data': data, 'format': 'json'}
                except:
                    logger.info(f"Response is HTML, will require parsing")
                    return {'data': response.text, 'format': 'html', 'need_browser': False}

            except requests.Timeout:
                logger.warning(f"Request timeout (attempt {attempt + 1}/{max_retries})")
                if attempt < max_retries - 1:
                    backoff = self.settings.retry_backoff_base ** attempt
                    time.sleep(backoff)
                    continue
                return {'error': 'Request timeout after retries'}

            except requests.RequestException as e:
                logger.error(f"Network error: {e}")
                if attempt < max_retries - 1:
                    backoff = self.settings.retry_backoff_base ** attempt
                    time.sleep(backoff)
                    continue
                return {'error': f'Network error: {str(e)}'}

        return {'error': 'Max retries exceeded'}

    def check_rate_limit(self) -> bool:
        """Check current rate limit status"""
        try:
            response = self.session.head(
                f"{self.settings.aims_base_url}/api/schedule",
                timeout=5
            )
            if response.status_code == 429:
                logger.warning("Rate limit active")
                return False
            return True
        except Exception as e:
            logger.debug(f"Rate limit check failed: {e}")
            return True
