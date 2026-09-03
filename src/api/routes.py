from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
from datetime import datetime, timedelta
from typing import Optional
from src.api.schemas import (
    ScheduleRequest, ScheduleResponse, HealthResponse,
    AuthTestRequest, AuthTestResponse, SyncRequest, SyncResponse,
    Flight
)
from src.auth.authenticator import AImsAuthenticator
from src.parser.fetcher import ScheduleFetcher
from src.parser.html_parser import HTMLParser
from src.parser.selenium_browser import SeleniumBrowser
from src.config import get_settings
from src.utils.logger import logger

router = APIRouter(tags=["schedule"])
settings = get_settings()


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    return HealthResponse(
        status="ok",
        app_name=settings.app_name,
        app_version=settings.app_version,
        timestamp=datetime.utcnow()
    )


@router.post("/auth/test", response_model=AuthTestResponse)
async def test_auth(request: AuthTestRequest) -> AuthTestResponse:
    """Test authentication against AIMS"""
    logger.info(f"Testing authentication for user: {request.username}")

    try:
        auth = AImsAuthenticator(request.username, request.password)
        success, message = auth.authenticate()

        if success:
            is_valid = auth.is_authenticated()
            return AuthTestResponse(
                authenticated=is_valid,
                message="Authentication successful",
                session_valid_until=datetime.utcnow() + timedelta(minutes=25)
            )
        else:
            return AuthTestResponse(
                authenticated=False,
                message=f"Authentication failed: {message}"
            )

    except Exception as e:
        logger.error(f"Auth test error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/schedule", response_model=ScheduleResponse)
async def get_schedule(request: ScheduleRequest) -> ScheduleResponse:
    """
    Fetch and parse schedule from AIMS eCrew.

    Returns flights with crew information for the specified date range.
    """
    logger.info(f"Schedule request: {request.start_date} to {request.end_date}")

    try:
        # Authenticate
        auth = AImsAuthenticator(request.username, request.password)

        # Try to restore from cache first
        if request.use_cache:
            if auth.restore_from_cache():
                logger.info("Using cached session")
            else:
                logger.debug("No valid cache, authenticating...")
                success, message = auth.authenticate()
                if not success:
                    return ScheduleResponse(
                        status="error",
                        error=f"Authentication failed: {message}",
                        cached=False
                    )
        else:
            success, message = auth.authenticate()
            if not success:
                return ScheduleResponse(
                    status="error",
                    error=f"Authentication failed: {message}",
                    cached=False
                )

        # Fetch schedule
        fetcher = ScheduleFetcher(auth.session)
        fetch_result = fetcher.fetch_schedule(
            request.start_date,
            request.end_date,
            request.crew_id
        )

        if 'error' in fetch_result:
            error = fetch_result['error']
            need_reauth = fetch_result.get('need_reauth', False)

            if need_reauth:
                # Try to re-authenticate once
                logger.info("Re-authenticating due to 401...")
                success, message = auth.authenticate()
                if success:
                    fetch_result = fetcher.fetch_schedule(
                        request.start_date,
                        request.end_date,
                        request.crew_id
                    )
                    if 'error' not in fetch_result:
                        return ScheduleResponse(
                            status="error",
                            error=error,
                            cached=False
                        )
                else:
                    return ScheduleResponse(
                        status="error",
                        error=f"Re-authentication failed: {message}",
                        cached=False
                    )

            return ScheduleResponse(
                status="error",
                error=error,
                cached=False
            )

        # Parse based on format
        flights: list[Flight] = []

        if fetch_result.get('format') == 'json':
            # If API returns JSON, use it directly
            data = fetch_result['data']
            if isinstance(data, dict) and 'flights' in data:
                # Validate against Flight schema
                for flight_data in data['flights']:
                    try:
                        flights.append(Flight(**flight_data))
                    except Exception as e:
                        logger.warning(f"Could not parse flight: {e}")

        elif fetch_result.get('format') == 'html':
            # Parse HTML response
            if fetch_result.get('need_browser'):
                logger.info("JS content detected, using browser...")
                browser = SeleniumBrowser(headless=settings.browser_headless)
                html_content = browser.fetch_schedule_with_browser(
                    auth.session.cookies.get_dict(),
                    request.start_date,
                    request.end_date
                )
                if not html_content:
                    return ScheduleResponse(
                        status="error",
                        error="Failed to fetch with browser",
                        cached=False
                    )
            else:
                html_content = fetch_result['data']

            # Parse HTML
            parsed_flights = HTMLParser.parse_schedule(html_content)
            flights = [Flight(**f) for f in parsed_flights]

        logger.info(f"Successfully fetched {len(flights)} flights")

        return ScheduleResponse(
            status="success",
            flights=flights,
            cached=False,
            last_update=datetime.utcnow(),
            session_valid_until=datetime.utcnow() + timedelta(minutes=25)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/schedule/sync", response_model=SyncResponse)
async def sync_schedule(request: SyncRequest, background_tasks: BackgroundTasks):
    """
    Asynchronously sync schedule (useful for large date ranges).

    Returns immediately with task ID for polling.
    """
    logger.info(f"Async sync request: {request.start_date} to {request.end_date}")

    task_id = f"sync_{datetime.utcnow().timestamp()}"

    # Add background task
    background_tasks.add_task(
        _background_sync,
        request.username,
        request.password,
        request.start_date,
        request.end_date,
        task_id
    )

    return SyncResponse(
        status="started",
        task_id=task_id,
        message="Sync task started in background. Use task_id to poll for status."
    )


async def _background_sync(
    username: str,
    password: str,
    start_date: str,
    end_date: str,
    task_id: str
):
    """Background task to sync schedule"""
    try:
        logger.info(f"Starting background sync: {task_id}")
        # Implementation would store result in database/cache
        # For now, just log
        logger.info(f"Completed sync: {task_id}")
    except Exception as e:
        logger.error(f"Background sync failed: {task_id} - {e}")


@router.get("/status/session")
async def check_session_status(username: str):
    """Check if a cached session exists and is valid"""
    try:
        auth = AImsAuthenticator(username, "")
        cached = auth.get_cached_session()

        if cached:
            return {
                "cached": True,
                "username": username,
                "expires_in_seconds": "unknown"  # Would need to check TTL
            }
        else:
            return {
                "cached": False,
                "username": username
            }

    except Exception as e:
        logger.error(f"Session check failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/cache/clear")
async def clear_session_cache(username: str):
    """Clear cached session for a user"""
    try:
        auth = AImsAuthenticator(username, "")
        if auth.redis_client:
            session_key = f"aims_session:{username}"
            auth.redis_client.delete(session_key)
            logger.info(f"Cache cleared for {username}")
            return {"status": "cleared", "username": username}
        else:
            return {"status": "redis_unavailable", "username": username}

    except Exception as e:
        logger.error(f"Cache clear failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
