from typing import Dict, Optional
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options as ChromeOptions
from selenium.webdriver.firefox.options import Options as FirefoxOptions
from src.config import get_settings
from src.utils.logger import logger


class SeleniumBrowser:
    """Browser automation for JS-rendered content"""

    def __init__(self, browser: str = "chrome", headless: bool = True):
        """
        Initialize Selenium WebDriver.

        Args:
            browser: 'chrome' or 'firefox'
            headless: Run in headless mode
        """
        self.settings = get_settings()
        self.browser = browser
        self.headless = headless
        self.driver = None
        self.wait = None

    def start(self):
        """Start the browser"""
        if self.browser == "chrome":
            options = ChromeOptions()
            if self.headless:
                options.add_argument('--headless')
            options.add_argument('--no-sandbox')
            options.add_argument('--disable-dev-shm-usage')
            options.add_argument('--disable-gpu')
            options.add_argument(
                'user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            )
            self.driver = webdriver.Chrome(options=options)
        else:
            options = FirefoxOptions()
            if self.headless:
                options.add_argument('--headless')
            self.driver = webdriver.Firefox(options=options)

        self.wait = WebDriverWait(self.driver, self.settings.browser_timeout)
        logger.info(f"Browser started: {self.browser} (headless={self.headless})")

    def stop(self):
        """Stop the browser"""
        if self.driver:
            self.driver.quit()
            logger.info("Browser stopped")

    def fetch_schedule_with_browser(
        self,
        cookies: Dict[str, str],
        start_date: str,
        end_date: str
    ) -> Optional[str]:
        """
        Fetch schedule through browser for JS-rendered content.

        Args:
            cookies: Session cookies
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)

        Returns:
            HTML content or None on error
        """
        try:
            self.start()

            # Load page
            logger.debug("Loading AIMS schedule page...")
            self.driver.get(f"{self.settings.aims_base_url}/schedule")

            # Add cookies
            for name, value in cookies.items():
                try:
                    self.driver.add_cookie({
                        'name': name,
                        'value': value,
                        'domain': 'aims.airastana.com',
                        'path': '/'
                    })
                except Exception as e:
                    logger.debug(f"Could not add cookie {name}: {e}")

            # Reload page with cookies
            self.driver.refresh()

            # Set date filters
            self._set_date_filter(start_date, end_date)

            # Wait for table to load
            logger.debug("Waiting for schedule table to render...")
            self.wait.until(
                EC.presence_of_all_elements_located(
                    (By.CSS_SELECTOR, "table.schedule tbody tr")
                )
            )

            # Get page content
            html = self.driver.page_source
            logger.info("Successfully fetched schedule via browser")
            return html

        except Exception as e:
            logger.error(f"Browser fetch failed: {e}")
            return None

        finally:
            self.stop()

    def _set_date_filter(self, start_date: str, end_date: str):
        """Set date range filters on the page"""
        try:
            # Try to find and fill date input fields
            start_inputs = self.driver.find_elements(
                By.CSS_SELECTOR,
                "input[type='date'][name*='start'], input[placeholder*='from'], input[placeholder*='Start']"
            )

            if start_inputs:
                logger.debug(f"Found {len(start_inputs)} start date input(s)")
                start_inputs[0].clear()
                start_inputs[0].send_keys(start_date.replace('-', ''))

            end_inputs = self.driver.find_elements(
                By.CSS_SELECTOR,
                "input[type='date'][name*='end'], input[placeholder*='to'], input[placeholder*='End']"
            )

            if end_inputs:
                logger.debug(f"Found {len(end_inputs)} end date input(s)")
                end_inputs[0].clear()
                end_inputs[0].send_keys(end_date.replace('-', ''))

            # Try to click submit/search button
            buttons = self.driver.find_elements(
                By.CSS_SELECTOR,
                "button[type='submit'], button:contains('Search'), button:contains('Filter')"
            )

            if buttons:
                logger.debug("Clicking submit button...")
                buttons[0].click()

        except Exception as e:
            logger.warning(f"Failed to set date filter: {e}")

    def take_screenshot(self, filename: str):
        """Take a screenshot for debugging"""
        try:
            self.driver.save_screenshot(filename)
            logger.info(f"Screenshot saved: {filename}")
        except Exception as e:
            logger.error(f"Failed to take screenshot: {e}")

    def get_page_text(self) -> str:
        """Get all text content from page"""
        try:
            body = self.driver.find_element(By.TAG_NAME, "body")
            return body.get_attribute("innerText")
        except Exception as e:
            logger.error(f"Failed to get page text: {e}")
            return ""

    def wait_for_element(self, selector: str, by: By = By.CSS_SELECTOR, timeout: int = None) -> bool:
        """Wait for element to appear"""
        try:
            wait = WebDriverWait(self.driver, timeout or self.settings.browser_timeout)
            wait.until(EC.presence_of_element_located((by, selector)))
            return True
        except Exception as e:
            logger.warning(f"Element not found: {selector} ({e})")
            return False
