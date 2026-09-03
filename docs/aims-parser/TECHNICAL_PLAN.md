# AIMS eCrew Air Astana Parser — Технический План Разработки

**Версия:** v1.0  
**Дата:** 2026-09-03  
**Статус:** Готово к реализации

---

## 1. АРХИТЕКТУРА РЕШЕНИЯ

### 1.1 Общая схема взаимодействия

```
┌─────────────────────────────────────────────────────────────┐
│                  Ваше приложение                             │
│  (FastAPI/Django/Node.js + Database)                         │
└────────────────────┬────────────────────────────────────────┘
                     │ REST API (JSON)
                     │ GET /api/schedule
                     │ GET /api/crew/{id}
                     │ POST /api/sync
                     ▼
┌─────────────────────────────────────────────────────────────┐
│         AIMS Parser Middleware (FastAPI + Docker)            │
├─────────────────────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────────────────┐    │
│ │  Session Manager & Auth Layer                        │    │
│ │  - CSRF Token extraction                             │    │
│ │  - Cookie & JWT persistence                          │    │
│ │  - Rate limiting & retry logic                       │    │
│ └──────────────────────────────────────────────────────┘    │
│ ┌──────────────────────────────────────────────────────┐    │
│ │  HTTP Client (requests/httpx)                        │    │
│ │  - Selenium/Playwright (для JS-контента)            │    │
│ │  - Proxy rotation (опционально)                      │    │
│ └──────────────────────────────────────────────────────┘    │
│ ┌──────────────────────────────────────────────────────┐    │
│ │  Parser Engine (BeautifulSoup4 + lxml)              │    │
│ │  - HTML parsing                                      │    │
│ │  - XPath/CSS selectors                              │    │
│ │  - Data normalization                               │    │
│ └──────────────────────────────────────────────────────┘    │
│ ┌──────────────────────────────────────────────────────┐    │
│ │  Cache & Queue (Redis)                              │    │
│ │  - Session caching (30 мин)                         │    │
│ │  - Task queue (Celery/RQ)                           │    │
│ │  - Rate limit state                                 │    │
│ └──────────────────────────────────────────────────────┘    │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTPS
                     │ (Session cookies + CSRF token)
                     ▼
        ┌────────────────────────────────┐
        │   AIMS eCrew (Air Astana)       │
        │   https://aims.airastana.com/  │
        │   - Login page                  │
        │   - Schedule view               │
        │   - Crew database               │
        └────────────────────────────────┘
```

### 1.2 Формат обмена данных

**Входящий запрос:**
```json
{
  "action": "get_schedule",
  "params": {
    "start_date": "2026-09-03",
    "end_date": "2026-09-10",
    "crew_id": "optional_filter"
  },
  "credentials": {
    "username": "...",
    "password": "..."
  }
}
```

**Исходящий ответ:**
```json
{
  "status": "success",
  "data": {
    "schedule": [
      {
        "flight_id": "AE123",
        "date": "2026-09-03",
        "departure_time": "14:30",
        "arrival_time": "16:45",
        "departure_airport": "ALA",
        "arrival_airport": "NUR",
        "aircraft_type": "A320",
        "registration": "P4-AAA",
        "crew": [
          {
            "name": "John Doe",
            "position": "Captain",
            "id": "C001"
          },
          {
            "name": "Jane Smith",
            "position": "First Officer",
            "id": "C002"
          }
        ]
      }
    ],
    "last_update": "2026-09-03T10:30:00Z",
    "session_valid_until": "2026-09-03T14:30:00Z"
  },
  "errors": []
}
```

---

## 2. ПОШАГОВЫЙ АЛГОРИТМ ПАРСИНГА

### 2.1 Фаза 1: Авторизация

```
1. Загрузить страницу входа (GET https://aims.airastana.com/login)
   ├─ Извлечь CSRF-токен из <meta name="csrf-token">
   ├─ Сохранить все cookies (Set-Cookie)
   └─ Определить наличие JavaScript-обработки (проверить src тегов script)

2. POST запрос с логином/паролем
   ├─ URL: https://aims.airastana.com/api/auth/login
   ├─ Заголовки:
   │  ├─ X-CSRF-Token: [extracted_token]
   │  ├─ Content-Type: application/json
   │  └─ User-Agent: Mozilla/5.0 (Стандартный browser-like)
   ├─ Тело: {"username": "...", "password": "..."}
   └─ Ожидать: 200 OK + новые cookies + JWT token (если используется)

3. Проверка успеха авторизации
   ├─ Если 401/403 → Ошибка аутентификации (неверные credentials)
   ├─ Если редирект на /login → Сессия не создана
   ├─ Если 200 + cookies/token → Успех, переход к парсингу
   └─ Сохранить session_id в Redis с TTL 25 мин (не дольше сессии AIMS)
```

### 2.2 Фаза 2: Получение расписания

```
1. Запрос расписания
   ├─ URL: POST https://aims.airastana.com/api/schedule
   ├─ Параметры:
   │  ├─ start_date: YYYY-MM-DD
   │  ├─ end_date: YYYY-MM-DD
   │  └─ crew_id (опционально)
   ├─ Заголовки: включить сохраненные cookies/token
   └─ Обработать rate limiting (429 → wait 60s, retry)

2. Если ответ HTML (не JSON) → требуется Selenium/Playwright
   ├─ Запустить browser
   ├─ Загрузить с cookies
   ├─ Подождать элемент .schedule-table (max 5 сек)
   ├─ Получить page.content()
   └─ Парсить через BeautifulSoup

3. Парсинг полученного HTML/JSON
   └─ Перейти к Фазе 3
```

### 2.3 Фаза 3: Извлечение данных

```
Для каждого рейса в расписании:

1. Извлечь основные поля:
   ├─ flight_number      → tr.flight-row td.flight-number
   ├─ date               → tr.flight-row td.date (парс формата)
   ├─ departure_time     → tr.flight-row td.dep-time
   ├─ arrival_time       → tr.flight-row td.arr-time
   ├─ departure_airport  → tr.flight-row td.dep-airport
   ├─ arrival_airport    → tr.flight-row td.arr-airport
   ├─ aircraft_type      → tr.flight-row td.aircraft
   └─ registration       → tr.flight-row td.registration

2. Для каждого члена экипажа (проверить деталь рейса):
   ├─ Может потребоваться клик на рейс (JS-обработка)
   ├─ Извлечь список из div.crew-list ul li
   ├─ Каждый member: name, position, id
   └─ Сохранить

3. Обработать пустые/null значения
   ├─ Если поле отсутствует → null в JSON
   ├─ Если дата невалидна → skip эта запись + логировать
   └─ Если экипаж пуст → crew: []

4. Нормализация данных:
   ├─ Даты → ISO 8601
   ├─ Время → HH:MM (24-часовой формат)
   ├─ Коды аэропортов → IATA (3 символа, uppercase)
   └─ Регистрация → формат P4-XXX
```

### 2.4 Обработка динамического контента (JS/WebSocket)

**Признаки того, что нужен браузер:**
- После GET запроса HTML содержит `<script src="...bundle.js"></script>` без данных
- XHR/Fetch запросы видны в DevTools (Network tab)
- WebSocket соединение для real-time updates

**Решение: Selenium + ChromeDriver**
```python
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

driver = webdriver.Chrome()
driver.get("https://aims.airastana.com/")
# Передать cookies
for cookie in saved_cookies:
    driver.add_cookie(cookie)
driver.get("https://aims.airastana.com/schedule")
WebDriverWait(driver, 10).until(
    EC.presence_of_all_elements_located((By.CSS_SELECTOR, "table.schedule tbody tr"))
)
html_content = driver.page_source
driver.quit()
```

---

## 3. PYTHON КОД ДЛЯ КЛЮЧЕВЫХ БЛОКОВ

### 3.1 Авторизация с CSRF-токенами

```python
import requests
from requests.cookies import RequestsCookieJar
import logging
from typing import Tuple, Dict, Optional
import redis

logger = logging.getLogger(__name__)
redis_client = redis.Redis(host='localhost', port=6379, decode_responses=True)

class AImsAuthenticator:
    """Авторизация в AIMS eCrew с обработкой CSRF и сессий"""
    
    BASE_URL = "https://aims.airastana.com"
    LOGIN_URL = f"{BASE_URL}/api/auth/login"
    INIT_URL = f"{BASE_URL}/login"
    
    def __init__(self, username: str, password: str):
        self.username = username
        self.password = password
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        })
    
    def get_csrf_token(self) -> str:
        """Шаг 1: Загрузить страницу входа и извлечь CSRF-токен"""
        try:
            response = self.session.get(self.INIT_URL, timeout=10)
            response.raise_for_status()
            
            # Поиск CSRF-токена в meta теге
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(response.text, 'html.parser')
            csrf_meta = soup.find('meta', {'name': 'csrf-token'})
            
            if not csrf_meta:
                # Альтернативный поиск в скрытом input
                csrf_input = soup.find('input', {'name': '_csrf'})
                if not csrf_input:
                    raise ValueError("CSRF-токен не найден на странице входа")
                csrf_token = csrf_input.get('value')
            else:
                csrf_token = csrf_meta.get('content')
            
            logger.info(f"CSRF-токен успешно извлечен: {csrf_token[:10]}...")
            return csrf_token
        
        except requests.RequestException as e:
            logger.error(f"Ошибка при загрузке страницы входа: {e}")
            raise
    
    def authenticate(self) -> Tuple[bool, str]:
        """Шаг 2: Авторизация через POST запрос"""
        csrf_token = self.get_csrf_token()
        
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
                self.LOGIN_URL,
                json=payload,
                headers=headers,
                timeout=15,
                allow_redirects=True
            )
            
            if response.status_code == 401:
                return False, "Неверное имя пользователя или пароль"
            
            if response.status_code == 403:
                return False, "Доступ запрещен (2FA или блокировка аккаунта)"
            
            if response.status_code != 200:
                logger.warning(f"Неожиданный статус: {response.status_code}")
                return False, f"Ошибка авторизации: {response.status_code}"
            
            # Проверить наличие авторизационного токена
            try:
                data = response.json()
                jwt_token = data.get('token') or data.get('access_token')
                if jwt_token:
                    self.session.headers['Authorization'] = f'Bearer {jwt_token}'
            except:
                pass  # JWT может быть только в cookies
            
            # Сохранить сессию в Redis на 25 минут
            session_key = f"aims_session:{self.username}"
            session_data = {
                'cookies': self.session.cookies.get_dict(),
                'headers': dict(self.session.headers)
            }
            redis_client.setex(
                session_key, 
                1500,  # 25 мин
                str(session_data)
            )
            
            logger.info(f"Авторизация успешна для {self.username}")
            return True, "OK"
        
        except requests.RequestException as e:
            logger.error(f"Ошибка авторизации: {e}")
            return False, f"Сетевая ошибка: {str(e)}"
    
    def is_authenticated(self) -> bool:
        """Проверить, валидна ли текущая сессия"""
        try:
            response = self.session.get(
                f"{self.BASE_URL}/api/auth/status",
                timeout=5
            )
            return response.status_code == 200
        except:
            return False
```

### 3.2 Получение расписания на неделю

```python
from datetime import datetime, timedelta
from typing import List, Dict, Any
import json

class ScheduleFetcher:
    """Получение расписания из AIMS eCrew"""
    
    def __init__(self, session: requests.Session):
        self.session = session
        self.base_url = "https://aims.airastana.com"
    
    def fetch_schedule(
        self, 
        start_date: str,  # YYYY-MM-DD
        end_date: str,    # YYYY-MM-DD
        crew_id: Optional[str] = None,
        max_retries: int = 3
    ) -> Dict[str, Any]:
        """Получить расписание с обработкой ошибок и ретраев"""
        
        for attempt in range(max_retries):
            try:
                params = {
                    'start_date': start_date,
                    'end_date': end_date
                }
                if crew_id:
                    params['crew_id'] = crew_id
                
                response = self.session.get(
                    f"{self.base_url}/api/schedule",
                    params=params,
                    timeout=30
                )
                
                # Обработка rate limiting
                if response.status_code == 429:
                    wait_time = int(response.headers.get('Retry-After', 60))
                    logger.warning(f"Rate limit: ожидание {wait_time}с (попытка {attempt+1})")
                    if attempt < max_retries - 1:
                        import time
                        time.sleep(wait_time)
                        continue
                    return {'error': 'Rate limit exceeded'}
                
                # Обработка ошибок аутентификации
                if response.status_code == 401:
                    return {'error': 'Unauthorized', 'need_reauth': True}
                
                if response.status_code == 403:
                    return {'error': 'Forbidden'}
                
                if response.status_code != 200:
                    logger.error(f"Статус {response.status_code}: {response.text[:200]}")
                    return {'error': f'HTTP {response.status_code}'}
                
                # Если JSON
                try:
                    data = response.json()
                    return {'data': data, 'format': 'json'}
                except:
                    # Если HTML — требуется Selenium
                    return {'data': response.text, 'format': 'html', 'need_browser': True}
            
            except requests.Timeout:
                logger.warning(f"Timeout на попытке {attempt+1}/{max_retries}")
                if attempt < max_retries - 1:
                    import time
                    time.sleep(2 ** attempt)  # Exponential backoff
                    continue
                return {'error': 'Timeout'}
            
            except requests.RequestException as e:
                logger.error(f"Ошибка сети: {e}")
                return {'error': f'Network error: {str(e)}'}
        
        return {'error': 'Max retries exceeded'}
```

### 3.3 Парсинг HTML через BeautifulSoup4

```python
from bs4 import BeautifulSoup
from datetime import datetime
import re
from typing import List

class HTMLParser:
    """Парсинг расписания из HTML"""
    
    @staticmethod
    def parse_schedule(html_content: str) -> List[Dict[str, Any]]:
        """Извлечение рейсов и экипажа из HTML"""
        
        soup = BeautifulSoup(html_content, 'lxml')
        flights = []
        
        # Найти таблицу расписания (селектор может варьироваться)
        table = soup.find('table', {'class': re.compile('schedule|flight')})
        if not table:
            logger.error("Таблица расписания не найдена")
            return []
        
        for row in table.find_all('tr')[1:]:  # Пропустить заголовок
            try:
                cells = row.find_all('td')
                if len(cells) < 7:
                    continue
                
                flight = {
                    'flight_number': cells[0].get_text(strip=True),
                    'date': HTMLParser._parse_date(cells[1].get_text(strip=True)),
                    'departure_time': cells[2].get_text(strip=True),
                    'arrival_time': cells[3].get_text(strip=True),
                    'departure_airport': cells[4].get_text(strip=True).upper(),
                    'arrival_airport': cells[5].get_text(strip=True).upper(),
                    'aircraft_type': cells[6].get_text(strip=True),
                    'registration': cells[7].get_text(strip=True) if len(cells) > 7 else None,
                    'crew': []
                }
                
                # Проверить наличие деталей рейса (кликабельная ячейка)
                detail_link = row.find('a', {'data-flight-id': True})
                if detail_link:
                    flight['flight_id'] = detail_link.get('data-flight-id')
                else:
                    flight['flight_id'] = flight['flight_number']
                
                # Извлечь экипаж (может быть в отдельных ячейках или требовать доп. запроса)
                crew_cell = row.find('td', {'class': 'crew'})
                if crew_cell:
                    flight['crew'] = HTMLParser._parse_crew(crew_cell)
                
                flights.append(flight)
            
            except Exception as e:
                logger.warning(f"Ошибка парсинга строки: {e}")
                continue
        
        return flights
    
    @staticmethod
    def _parse_date(date_str: str) -> str:
        """Парсинг даты в различных форматах"""
        formats = [
            '%d.%m.%Y',      # 03.09.2026
            '%d/%m/%Y',      # 03/09/2026
            '%Y-%m-%d',      # 2026-09-03
            '%d %b %Y',      # 03 Sep 2026
        ]
        
        for fmt in formats:
            try:
                dt = datetime.strptime(date_str, fmt)
                return dt.strftime('%Y-%m-%d')
            except ValueError:
                continue
        
        logger.warning(f"Не удалось распарсить дату: {date_str}")
        return None
    
    @staticmethod
    def _parse_crew(crew_element) -> List[Dict[str, str]]:
        """Извлечение информации об экипаже"""
        crew_list = []
        
        # Формат: "John Doe (Captain) | Jane Smith (First Officer)"
        crew_text = crew_element.get_text()
        members = re.split(r'\|', crew_text)
        
        for member in members:
            match = re.match(r'(.+?)\s*\((\w+(?:\s+\w+)?)\)', member.strip())
            if match:
                crew_list.append({
                    'name': match.group(1),
                    'position': match.group(2),
                    'id': None  # Может быть заполнено из data-атрибутов
                })
        
        return crew_list
```

### 3.4 Обработка ошибок и ре-авторизация

```python
from functools import wraps
import time

class ErrorHandler:
    """Обработка ошибок парсинга и ре-авторизация"""
    
    def __init__(self, authenticator: AImsAuthenticator):
        self.authenticator = authenticator
    
    def with_retry_and_reauth(func):
        """Декоратор для автоматической ре-авторизации при 401"""
        @wraps(func)
        def wrapper(self, *args, **kwargs):
            max_attempts = 2
            
            for attempt in range(max_attempts):
                try:
                    result = func(self, *args, **kwargs)
                    
                    # Проверить ошибку авторизации в результате
                    if isinstance(result, dict) and result.get('need_reauth'):
                        if attempt == 0:
                            logger.info("Сессия истекла, переавторизация...")
                            success, msg = self.authenticator.authenticate()
                            if not success:
                                return {'error': f'Reauth failed: {msg}'}
                            continue
                        else:
                            return {'error': 'Reauth failed after retry'}
                    
                    return result
                
                except Exception as e:
                    logger.error(f"Ошибка в попытке {attempt+1}: {e}")
                    if attempt < max_attempts - 1:
                        time.sleep(2 ** attempt)
            
            return {'error': 'Max attempts exceeded'}
        
        return wrapper

class ScheduleService(ErrorHandler):
    """Сервис получения расписания с обработкой ошибок"""
    
    def __init__(self, username: str, password: str):
        auth = AImsAuthenticator(username, password)
        super().__init__(auth)
        self.fetcher = ScheduleFetcher(auth.session)
        self.parser = HTMLParser()
    
    def authenticate(self):
        return self.authenticator.authenticate()
    
    @ErrorHandler.with_retry_and_reauth
    def get_schedule(self, start_date: str, end_date: str) -> Dict[str, Any]:
        """Получить и распарсить расписание"""
        result = self.fetcher.fetch_schedule(start_date, end_date)
        
        if 'error' in result:
            return result
        
        if result.get('format') == 'json':
            return {'flights': result['data'], 'source': 'json'}
        
        elif result.get('format') == 'html':
            if result.get('need_browser'):
                # Требуется Selenium — см. раздел 3.5
                logger.info("Требуется браузер для JS-контента")
                return {'need_browser': True}
            
            flights = self.parser.parse_schedule(result['data'])
            return {'flights': flights, 'source': 'html'}
        
        return {'error': 'Unknown format'}
```

### 3.5 Selenium для JavaScript-контента

```python
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
import json

class SeleniumBrowser:
    """Парсинг AIMS eCrew через браузер для JS-контента"""
    
    def __init__(self, headless: bool = True):
        options = Options()
        if headless:
            options.add_argument('--headless')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu')
        options.add_argument('user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64)')
        
        self.driver = webdriver.Chrome(options=options)
        self.wait = WebDriverWait(self.driver, 10)
    
    def fetch_schedule_with_browser(
        self,
        cookies: Dict[str, str],
        start_date: str,
        end_date: str
    ) -> str:
        """Загрузить расписание через браузер"""
        
        try:
            # Загрузить страницу
            self.driver.get("https://aims.airastana.com/schedule")
            
            # Добавить cookies
            for name, value in cookies.items():
                try:
                    self.driver.add_cookie({'name': name, 'value': value})
                except:
                    pass  # Некоторые cookies могут быть невалидны
            
            # Перезагрузить страницу с cookies
            self.driver.refresh()
            
            # Установить дату (может быть различный селектор)
            self._set_date_filter(start_date, end_date)
            
            # Дождаться загрузки таблицы
            self.wait.until(
                EC.presence_of_all_elements_located((By.CSS_SELECTOR, "table.schedule tbody tr"))
            )
            
            # Получить HTML
            html = self.driver.page_source
            return html
        
        finally:
            self.driver.quit()
    
    def _set_date_filter(self, start_date: str, end_date: str):
        """Установить фильтр по датам"""
        
        # Попытка 1: input type="date"
        try:
            start_input = self.driver.find_element(By.CSS_SELECTOR, "input[type='date'][name*='start']")
            start_input.clear()
            start_input.send_keys(start_date.replace('-', ''))
        except:
            logger.info("Не найден input для даты начала")
        
        # Попытка 2: date picker кнопка
        try:
            self.wait.until(EC.element_to_be_clickable((By.CLASS_NAME, "date-picker-btn"))).click()
            # Логика заполнения date picker...
        except:
            pass
```

---

## 4. БЕЗОПАСНОСТЬ

### 4.1 Хранение учетных данных

**Вариант 1: Environment Variables (локальная разработка)**
```bash
# .env файл (НЕ коммитить в git!)
AIMS_USERNAME=your_username
AIMS_PASSWORD=your_password_encrypted

# .gitignore
.env
.env.local
```

**Вариант 2: AWS Secrets Manager (production)**
```python
import boto3
import json

def get_credentials() -> Tuple[str, str]:
    client = boto3.client('secretsmanager', region_name='eu-west-1')
    try:
        secret = client.get_secret_value(SecretId='aims-ecrew-creds')
        creds = json.loads(secret['SecretString'])
        return creds['username'], creds['password']
    except Exception as e:
        logger.error(f"Failed to retrieve credentials: {e}")
        raise
```

**Вариант 3: HashiCorp Vault**
```python
import hvac

def get_credentials_from_vault() -> Tuple[str, str]:
    client = hvac.Client(url='https://vault.company.com', token=os.getenv('VAULT_TOKEN'))
    secret = client.secrets.kv.read_secret_version(path='aims-ecrew')
    return secret['data']['data']['username'], secret['data']['data']['password']
```

### 4.2 Логирование без утечки данных

```python
import logging
import re
from functools import wraps

class SanitizedFormatter(logging.Formatter):
    """Логирование с маскированием чувствительных данных"""
    
    PATTERNS = [
        (r'password["\']?\s*[:=]\s*["\']([^"\']+)["\']', r'password: ***REDACTED***'),
        (r'authorization["\']?\s*:\s*Bearer\s+(\S+)', r'authorization: Bearer ***TOKEN***'),
        (r'cookie["\']?\s*:\s*([^;]+)', r'cookie: ***COOKIE***'),
        (r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}', r'***EMAIL***'),
    ]
    
    def format(self, record):
        msg = super().format(record)
        for pattern, replacement in self.PATTERNS:
            msg = re.sub(pattern, replacement, msg, flags=re.IGNORECASE)
        return msg

# Применить к логгеру
handler = logging.StreamHandler()
handler.setFormatter(SanitizedFormatter(
    '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
))
logger.addHandler(handler)

# Пример безопасного логирования в действии
logger.info(f"Authenticating user")  # Вместо логирования пароля
logger.debug(f"Session created, expires at {expiry}")
```

### 4.3 HTTPS и сертификаты

```python
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

def create_secure_session() -> requests.Session:
    """Создать сессию с проверкой HTTPS сертификатов"""
    
    session = requests.Session()
    
    # Использовать сертификаты по умолчанию (certifi)
    # Для самоподписанных: requests.certs('/path/to/ca-bundle.crt')
    
    # Retry strategy для сетевых ошибок
    retry_strategy = Retry(
        total=3,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET", "POST"]
    )
    
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    
    return session
```

---

## 5. РИСКИ И МИТИГАЦИЯ

| Риск | Вероятность | Влияние | Митигация |
|------|-------------|--------|----------|
| **Смена структуры HTML** | Высокая | Критическое (парсер сломается) | 1. Использовать XPath/CSS для гибкости 2. Мониторинг через тесты 3. Версионирование селекторов 4. Weekly проверки 5. Алерты при 404+ ошибках |
| **Введение CAPTCHA** | Средняя | Высокое (требует ручного ввода) | 1. 2Captcha/Anti-Captcha API 2. Уменьшить частоту запросов 3. Использовать Cloudflare Challenge обход 4. Динамическая смена User-Agent |
| **Блокировка IP** | Средняя | Высокое | 1. Proxy rotation (Bright Data, Oxylabs) 2. Увеличить delays между запросами 3. Использовать VPN/SSH туннель 4. Rate limiting: не более 5 req/min |
| **Истечение сессии** | Высокая | Среднее (требует ре-авторизация) | 1. Кэширование сессии в Redis 2. Проверка валидности перед запросом 3. Автоматическая ре-авторизация 4. TTL < длительности сессии AIMS |
| **2FA / MFA включена** | Средняя | Критическое | 1. Использовать backup коды в Vault 2. Selenium для manual ввода OTP 3. Попросить исключение от IT (может быть недостижимо) |
| **Rate limiting (429)** | Высокая | Среднее | 1. Respect Retry-After заголовок 2. Exponential backoff 3. Распределенные запросы через queue 4. Рассчитать: макс. ~3 req/sec per IP |
| **Утечка credentials** | Низкая* | Критическое | 1. Использовать Vault/Secrets Manager 2. Не логировать пароли 3. Rotate credentials регулярно 4. Audit logs всех доступов |

\* *Низкая только при соблюдении практик безопасности*

### 5.1 Стратегия мониторинга

```python
from dataclasses import dataclass
from datetime import datetime

@dataclass
class ParsingMetric:
    timestamp: datetime
    status: str  # 'success', 'error', 'blocked'
    error_code: Optional[int]
    response_time: float
    records_parsed: int

class MetricsCollector:
    """Сбор метрик для детектирования проблем"""
    
    def __init__(self, influxdb_url: str):
        self.influxdb = influxdb_url
    
    def record_metric(self, metric: ParsingMetric):
        """Отправить метрику в InfluxDB"""
        # Логика отправки...
        pass
    
    def alert_on_pattern(self):
        """Проверить на паттерны проблем"""
        # Если 5+ ошибок 404 за 10 мин → структура изменилась
        # Если 3+ ошибок 429 подряд → требуется throttling
        # Если все запросы возвращают 403 → IP заблокирован
        pass
```

---

## 6. АЛЬТЕРНАТИВА: ГОТОВЫЕ API

### Сравнение: Парсинг vs Готовые API

| Параметр | Собственный парсер | Wingman API | Avio Crew API |
|----------|-------------------|------------|---------------|
| **Стоимость** | $0 (dev time) | $500-2000/месяц | $300-1500/месяц |
| **Время разработки** | 2-4 недели | 1-2 дня | 1-2 дня |
| **Отказоустойчивость** | Средняя (зависит от AIMS) | Высокая | Высокая |
| **Поддержка при изменении AIMS** | Своя | Поставщик обновляет | Поставщик обновляет |
| **Задержка данных** | Real-time | 2-5 минут | 1-3 минуты |
| **Локальный контроль** | Полный | Нет (облако) | Нет (облако) |
| **Compliance / NDA** | Требует разрешения Air Astana | Уже согласовано | Уже согласовано |
| **Data privacy** | На вас | На поставщике | На поставщике |

### Рекомендация:

**Выбрать готовое API если:**
- У вас нет ресурсов на поддержку парсера
- Требуется 99.9% uptime
- AIMS может ввести защиту (CAPTCHA, IP-блокировка)
- Нужна техподдержка

**Выбрать собственный парсер если:**
- Есть dedicated backend разработчик
- Полный контроль критичен
- Ready to invest в мониторинг/mitigation
- Air Astana не запретила (проверить контракт!)

---

## 7. РЕАЛИЗАЦИЯ НА FASTAPI + DOCKER

### 7.1 Структура проекта

```
aims-parser/
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
├── .env.example
├── src/
│   ├── main.py
│   ├── config.py
│   ├── auth/
│   │   └── authenticator.py
│   ├── parser/
│   │   ├── html_parser.py
│   │   └── schedule_fetcher.py
│   ├── api/
│   │   ├── routes.py
│   │   └── schemas.py
│   ├── utils/
│   │   ├── logger.py
│   │   └── validators.py
│   └── tests/
│       └── test_parser.py
└── README.md
```

### 7.2 FastAPI приложение

```python
# src/main.py
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from datetime import datetime, timedelta
import logging

from auth.authenticator import AImsAuthenticator
from parser.schedule_fetcher import ScheduleFetcher
from parser.html_parser import HTMLParser

app = FastAPI(title="AIMS eCrew Parser API", version="1.0")
logger = logging.getLogger(__name__)

class ScheduleRequest(BaseModel):
    username: str
    password: str
    start_date: str  # YYYY-MM-DD
    end_date: str

class ScheduleResponse(BaseModel):
    status: str
    data: dict
    cached: bool
    last_update: datetime

@app.get("/health")
async def health_check():
    return {"status": "ok"}

@app.post("/api/schedule", response_model=ScheduleResponse)
async def get_schedule(request: ScheduleRequest):
    """Получить расписание из AIMS eCrew"""
    
    try:
        # Авторизация
        auth = AImsAuthenticator(request.username, request.password)
        success, msg = auth.authenticate()
        
        if not success:
            raise HTTPException(status_code=401, detail=msg)
        
        # Получение расписания
        fetcher = ScheduleFetcher(auth.session)
        result = fetcher.fetch_schedule(
            request.start_date,
            request.end_date
        )
        
        if 'error' in result:
            raise HTTPException(status_code=400, detail=result['error'])
        
        # Парсинг
        flights = HTMLParser.parse_schedule(result['data'])
        
        return ScheduleResponse(
            status="success",
            data={"flights": flights},
            cached=False,
            last_update=datetime.utcnow()
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail="Internal server error")

@app.post("/api/sync")
async def sync_schedule(request: ScheduleRequest, background_tasks: BackgroundTasks):
    """Асинхронная синхронизация расписания"""
    
    background_tasks.add_task(get_schedule, request)
    return {"status": "sync started"}
```

### 7.3 Docker Compose

```yaml
# docker-compose.yml
version: '3.9'

services:
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  parser:
    build: .
    ports:
      - "8000:8000"
    environment:
      - AIMS_USERNAME=${AIMS_USERNAME}
      - AIMS_PASSWORD=${AIMS_PASSWORD}
      - REDIS_URL=redis://redis:6379
      - LOG_LEVEL=INFO
    depends_on:
      - redis
    volumes:
      - ./src:/app/src
    command: uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload

  # Опционально: Celery для фоновых задач
  celery:
    build: .
    command: celery -A src.tasks worker --loglevel=info
    environment:
      - AIMS_USERNAME=${AIMS_USERNAME}
      - AIMS_PASSWORD=${AIMS_PASSWORD}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

volumes:
  redis_data:
```

### 7.4 Dockerfile

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Установить зависимости системы
RUN apt-get update && apt-get install -y \
    gcc \
    libxml2-dev \
    libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

# Установить Python зависимости
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копировать код
COPY src ./src

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8000/health')"

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 7.5 requirements.txt

```txt
fastapi==0.104.1
uvicorn[standard]==0.24.0
requests==2.31.0
beautifulsoup4==4.12.2
lxml==4.9.3
redis==5.0.1
python-dotenv==1.0.0
pydantic==2.5.0
boto3==1.28.85
hvac==1.2.1

# Опционально: Selenium для JS
selenium==4.15.2

# Опционально: Celery
celery==5.3.4

# Testing
pytest==7.4.3
pytest-asyncio==0.21.1
```

---

## 8. ЗАПУСК И РАЗВЕРТЫВАНИЕ

### Локальное развертывание

```bash
# 1. Клонировать и настроить
git clone https://github.com/your-org/aims-parser.git
cd aims-parser

# 2. Создать .env
cp .env.example .env
# Отредактировать: AIMS_USERNAME, AIMS_PASSWORD

# 3. Запустить Docker Compose
docker-compose up -d

# 4. Проверить health
curl http://localhost:8000/health

# 5. Тест API
curl -X POST http://localhost:8000/api/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_username",
    "password": "your_password",
    "start_date": "2026-09-03",
    "end_date": "2026-09-10"
  }'
```

### Production deployment (AWS ECS)

```bash
# 1. Создать ECR репозиторий
aws ecr create-repository --repository-name aims-parser

# 2. Собрать и загрузить образ
docker build -t aims-parser .
docker tag aims-parser:latest \
  123456789.dkr.ecr.eu-west-1.amazonaws.com/aims-parser:latest
docker push 123456789.dkr.ecr.eu-west-1.amazonaws.com/aims-parser:latest

# 3. Задать credentials в AWS Secrets Manager
aws secretsmanager create-secret \
  --name aims-ecrew-creds \
  --secret-string '{"username":"...", "password":"..."}'

# 4. Развернуть через CloudFormation/Terraform
# (конфигурация опущена для краткости)
```

---

## 9. ТЕСТИРОВАНИЕ

```python
# src/tests/test_parser.py
import pytest
from datetime import datetime
from unittest.mock import Mock, patch

def test_csrf_token_extraction():
    """Проверить извлечение CSRF-токена"""
    authenticator = AImsAuthenticator("user", "pass")
    
    with patch('requests.Session.get') as mock_get:
        mock_get.return_value.text = '<meta name="csrf-token" content="abc123">'
        token = authenticator.get_csrf_token()
        assert token == "abc123"

def test_schedule_parsing():
    """Проверить парсинг расписания"""
    html = """
    <table>
        <tr>
            <td>AE123</td>
            <td>03.09.2026</td>
            <td>14:30</td>
            <td>16:45</td>
            <td>ALA</td>
            <td>NUR</td>
            <td>A320</td>
        </tr>
    </table>
    """
    
    flights = HTMLParser.parse_schedule(html)
    assert len(flights) == 1
    assert flights[0]['flight_number'] == 'AE123'
    assert flights[0]['date'] == '2026-09-03'

def test_retry_on_rate_limit():
    """Проверить retry при rate limiting"""
    fetcher = ScheduleFetcher(Mock())
    
    with patch('requests.Session.get') as mock_get:
        # Первый запрос: 429 Too Many Requests
        # Второй запрос: 200 OK
        mock_get.side_effect = [
            Mock(status_code=429, headers={'Retry-After': '1'}),
            Mock(status_code=200, text='<schedule>...</schedule>')
        ]
        
        result = fetcher.fetch_schedule('2026-09-03', '2026-09-10', max_retries=2)
        assert 'data' in result
```

---

## 10. ЗАКЛЮЧЕНИЕ

| Этап | Сложность | Время |
|------|-----------|-------|
| Прототип (базовый парсер) | Средняя | 1 неделя |
| Production-ready (с обработкой ошибок) | Высокая | 2-3 недели |
| Мониторинг & Alerting | Средняя | 1 неделя |
| Тестирование & QA | Средняя | 1 неделя |
| **ИТОГО** | | **4-6 недель** |

**Рекомендация:** Начать с собственного парсера для полного контроля. Если Air Astana предоставит официальное API — переключиться на него. Параллельно изучить готовые решения (Wingman, Avio Crew) как backup.

---

**Версия документа:** 1.0  
**Последнее обновление:** 2026-09-03  
**Автор:** Senior Integration Developer  
**Статус:** Ready for Implementation
