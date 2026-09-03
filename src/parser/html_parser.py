import re
from datetime import datetime
from typing import List, Dict, Any, Optional
from bs4 import BeautifulSoup
from src.utils.logger import logger


class HTMLParser:
    """Parse AIMS schedule data from HTML"""

    DATE_FORMATS = [
        '%d.%m.%Y',      # 03.09.2026
        '%d/%m/%Y',      # 03/09/2026
        '%Y-%m-%d',      # 2026-09-03
        '%d %b %Y',      # 03 Sep 2026
        '%d %B %Y',      # 03 September 2026
    ]

    @staticmethod
    def parse_schedule(html_content: str) -> List[Dict[str, Any]]:
        """
        Extract flights and crew from HTML schedule table.

        Args:
            html_content: Raw HTML content

        Returns:
            List of flight dictionaries
        """
        soup = BeautifulSoup(html_content, 'lxml')
        flights = []

        # Find schedule table
        table = soup.find('table', {'class': re.compile(r'schedule|flight', re.I)})
        if not table:
            logger.error("Schedule table not found in HTML")
            return []

        logger.debug("Found schedule table, parsing rows...")

        for idx, row in enumerate(table.find_all('tr')[1:], 1):  # Skip header
            try:
                cells = row.find_all('td')
                if len(cells) < 7:
                    logger.debug(f"Row {idx}: Skipping (insufficient cells: {len(cells)})")
                    continue

                flight_number = cells[0].get_text(strip=True)
                date_str = cells[1].get_text(strip=True)
                parsed_date = HTMLParser._parse_date(date_str)

                if not parsed_date:
                    logger.warning(f"Row {idx}: Could not parse date '{date_str}'")
                    continue

                flight = {
                    'flight_number': flight_number,
                    'date': parsed_date,
                    'departure_time': cells[2].get_text(strip=True),
                    'arrival_time': cells[3].get_text(strip=True),
                    'departure_airport': cells[4].get_text(strip=True).upper(),
                    'arrival_airport': cells[5].get_text(strip=True).upper(),
                    'aircraft_type': cells[6].get_text(strip=True),
                    'registration': cells[7].get_text(strip=True) if len(cells) > 7 else None,
                    'crew': []
                }

                # Extract flight ID if available
                detail_link = row.find('a', {'data-flight-id': True})
                flight['flight_id'] = detail_link.get('data-flight-id') if detail_link else flight_number

                # Parse crew information
                crew_cell = row.find('td', {'class': re.compile('crew', re.I)})
                if crew_cell:
                    flight['crew'] = HTMLParser._parse_crew(crew_cell)

                flights.append(flight)
                logger.debug(f"Parsed flight {flight_number}: {parsed_date}")

            except Exception as e:
                logger.warning(f"Row {idx}: Error parsing: {e}")
                continue

        logger.info(f"Successfully parsed {len(flights)} flights from HTML")
        return flights

    @staticmethod
    def _parse_date(date_str: str) -> Optional[str]:
        """
        Parse date from various formats to ISO 8601 (YYYY-MM-DD).

        Args:
            date_str: Date string in any supported format

        Returns:
            ISO 8601 formatted date or None
        """
        date_str = date_str.strip()

        for fmt in HTMLParser.DATE_FORMATS:
            try:
                dt = datetime.strptime(date_str, fmt)
                iso_date = dt.strftime('%Y-%m-%d')
                logger.debug(f"Parsed date '{date_str}' -> {iso_date} (format: {fmt})")
                return iso_date
            except ValueError:
                continue

        logger.warning(f"Could not parse date: {date_str}")
        return None

    @staticmethod
    def _parse_crew(crew_element) -> List[Dict[str, Optional[str]]]:
        """
        Extract crew member information from crew cell.

        Format: "John Doe (Captain) | Jane Smith (First Officer)"

        Args:
            crew_element: BeautifulSoup element containing crew info

        Returns:
            List of crew member dictionaries
        """
        crew_list = []
        crew_text = crew_element.get_text()

        # Split by pipe or line break
        members = re.split(r'\s*[\|;\n]\s*', crew_text)

        for member_text in members:
            member_text = member_text.strip()
            if not member_text:
                continue

            # Pattern: "Name (Position)"
            match = re.match(r'(.+?)\s*\((\w+(?:\s+\w+)?)\)', member_text)
            if match:
                crew_list.append({
                    'name': match.group(1).strip(),
                    'position': match.group(2).strip(),
                    'id': None  # Could be filled from data attributes
                })
            else:
                # Fallback: treat entire string as name
                crew_list.append({
                    'name': member_text,
                    'position': 'Crew',
                    'id': None
                })

        return crew_list

    @staticmethod
    def parse_crew_details(html_content: str, flight_id: str) -> List[Dict[str, Any]]:
        """
        Parse detailed crew information for a specific flight.
        May require separate page/API call.

        Args:
            html_content: HTML content of flight detail page
            flight_id: Flight identifier

        Returns:
            List of detailed crew dictionaries
        """
        soup = BeautifulSoup(html_content, 'lxml')
        crew_list = []

        # Look for crew roster table/list
        crew_section = soup.find(['div', 'section'], {'class': re.compile('crew', re.I)})
        if not crew_section:
            logger.warning(f"Crew section not found for flight {flight_id}")
            return crew_list

        for member in crew_section.find_all(['tr', 'li']):
            try:
                # Try table row format
                cells = member.find_all('td')
                if cells and len(cells) >= 2:
                    crew_list.append({
                        'name': cells[0].get_text(strip=True),
                        'position': cells[1].get_text(strip=True),
                        'id': cells[2].get_text(strip=True) if len(cells) > 2 else None,
                        'license': cells[3].get_text(strip=True) if len(cells) > 3 else None,
                    })
                else:
                    # Try simple text format
                    text = member.get_text(strip=True)
                    match = re.match(r'(.+?)\s*-\s*(.+)', text)
                    if match:
                        crew_list.append({
                            'name': match.group(1),
                            'position': match.group(2),
                            'id': None,
                            'license': None
                        })
            except Exception as e:
                logger.debug(f"Error parsing crew member: {e}")

        logger.info(f"Parsed {len(crew_list)} crew members for flight {flight_id}")
        return crew_list
