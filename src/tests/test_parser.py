import pytest
from unittest.mock import Mock, patch, MagicMock
from src.parser.html_parser import HTMLParser
from src.auth.authenticator import AImsAuthenticator


class TestHTMLParser:
    """Test HTML parsing functionality"""

    def test_parse_date_iso_format(self):
        """Test ISO date parsing"""
        result = HTMLParser._parse_date("2026-09-03")
        assert result == "2026-09-03"

    def test_parse_date_european_format(self):
        """Test European date format (DD.MM.YYYY)"""
        result = HTMLParser._parse_date("03.09.2026")
        assert result == "2026-09-03"

    def test_parse_date_us_format(self):
        """Test US date format (MM/DD/YYYY)"""
        result = HTMLParser._parse_date("09/03/2026")
        assert result == "2026-09-03"

    def test_parse_date_invalid(self):
        """Test invalid date"""
        result = HTMLParser._parse_date("invalid-date")
        assert result is None

    def test_parse_crew_single_member(self):
        """Test parsing single crew member"""
        crew_element = Mock()
        crew_element.get_text.return_value = "John Doe (Captain)"

        result = HTMLParser._parse_crew(crew_element)

        assert len(result) == 1
        assert result[0]['name'] == "John Doe"
        assert result[0]['position'] == "Captain"

    def test_parse_crew_multiple_members(self):
        """Test parsing multiple crew members"""
        crew_element = Mock()
        crew_element.get_text.return_value = "John Doe (Captain) | Jane Smith (First Officer)"

        result = HTMLParser._parse_crew(crew_element)

        assert len(result) == 2
        assert result[0]['name'] == "John Doe"
        assert result[1]['name'] == "Jane Smith"

    def test_parse_crew_with_spaces(self):
        """Test parsing crew with extra spaces"""
        crew_element = Mock()
        crew_element.get_text.return_value = "  John Doe  (  Captain  )  ;  Jane Smith (First Officer)  "

        result = HTMLParser._parse_crew(crew_element)

        assert len(result) == 2
        assert result[0]['name'] == "John Doe"
        assert result[0]['position'] == "Captain"

    def test_parse_schedule_empty_html(self):
        """Test parsing empty HTML"""
        html = "<html><body></body></html>"
        result = HTMLParser.parse_schedule(html)
        assert result == []

    def test_parse_schedule_no_table(self):
        """Test parsing HTML without schedule table"""
        html = "<html><body><p>No schedule found</p></body></html>"
        result = HTMLParser.parse_schedule(html)
        assert result == []


class TestAuthenticator:
    """Test authentication functionality"""

    @patch('requests.Session.get')
    def test_get_csrf_token_from_meta(self, mock_get):
        """Test CSRF token extraction from meta tag"""
        mock_response = Mock()
        mock_response.text = '<meta name="csrf-token" content="abc123xyz">'
        mock_get.return_value = mock_response

        auth = AImsAuthenticator("user", "pass")
        token = auth.get_csrf_token()

        assert token == "abc123xyz"

    @patch('requests.Session.get')
    def test_get_csrf_token_from_input(self, mock_get):
        """Test CSRF token extraction from input field"""
        mock_response = Mock()
        mock_response.text = '<input name="_csrf" value="def456uvw">'
        mock_get.return_value = mock_response

        auth = AImsAuthenticator("user", "pass")
        token = auth.get_csrf_token()

        assert token == "def456uvw"

    @patch('requests.Session.post')
    @patch('requests.Session.get')
    @patch('redis.from_url')
    def test_authenticate_success(self, mock_redis, mock_get, mock_post):
        """Test successful authentication"""
        # Mock CSRF extraction
        mock_response_csrf = Mock()
        mock_response_csrf.text = '<meta name="csrf-token" content="abc123">'
        mock_get.return_value = mock_response_csrf

        # Mock login response
        mock_response_login = Mock()
        mock_response_login.status_code = 200
        mock_response_login.json.return_value = {"token": "jwt_token"}
        mock_post.return_value = mock_response_login

        # Mock Redis
        mock_redis_instance = Mock()
        mock_redis_instance.ping.return_value = True
        mock_redis.return_value = mock_redis_instance

        auth = AImsAuthenticator("testuser", "testpass")
        success, message = auth.authenticate()

        assert success is True
        assert message == "OK"

    @patch('requests.Session.post')
    @patch('requests.Session.get')
    def test_authenticate_invalid_credentials(self, mock_get, mock_post):
        """Test authentication with invalid credentials"""
        # Mock CSRF extraction
        mock_response_csrf = Mock()
        mock_response_csrf.text = '<meta name="csrf-token" content="abc123">'
        mock_get.return_value = mock_response_csrf

        # Mock 401 response
        mock_response_login = Mock()
        mock_response_login.status_code = 401
        mock_post.return_value = mock_response_login

        auth = AImsAuthenticator("baduser", "badpass")
        success, message = auth.authenticate()

        assert success is False
        assert "Invalid" in message

    @patch('requests.Session.get')
    def test_is_authenticated_valid_session(self, mock_get):
        """Test session validation"""
        mock_response = Mock()
        mock_response.status_code = 200
        mock_get.return_value = mock_response

        auth = AImsAuthenticator("user", "pass")
        result = auth.is_authenticated()

        assert result is True

    @patch('requests.Session.get')
    def test_is_authenticated_invalid_session(self, mock_get):
        """Test invalid session detection"""
        mock_response = Mock()
        mock_response.status_code = 401
        mock_get.return_value = mock_response

        auth = AImsAuthenticator("user", "pass")
        result = auth.is_authenticated()

        assert result is False


@pytest.fixture
def sample_schedule_html():
    """Sample HTML schedule for testing"""
    return """
    <table class="schedule">
        <thead><tr><th>Flight</th><th>Date</th><th>Dep</th><th>Arr</th></tr></thead>
        <tbody>
            <tr>
                <td>AE123</td>
                <td>03.09.2026</td>
                <td>14:30</td>
                <td>16:45</td>
                <td>ALA</td>
                <td>NUR</td>
                <td>A320</td>
                <td>P4-AAA</td>
                <td>John Doe (Captain) | Jane Smith (FO)</td>
            </tr>
        </tbody>
    </table>
    """


def test_schedule_parsing_integration(sample_schedule_html):
    """Integration test: parse full schedule"""
    flights = HTMLParser.parse_schedule(sample_schedule_html)

    assert len(flights) >= 1
    assert flights[0]['flight_number'] == 'AE123'
    assert flights[0]['date'] == '2026-09-03'
    assert len(flights[0]['crew']) > 0
