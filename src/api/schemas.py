from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime


class CrewMember(BaseModel):
    """Crew member information"""
    name: str
    position: str
    id: Optional[str] = None
    license: Optional[str] = None


class Flight(BaseModel):
    """Flight schedule information"""
    flight_id: str
    flight_number: str
    date: str = Field(..., description="Date in YYYY-MM-DD format")
    departure_time: str = Field(..., description="Time in HH:MM format")
    arrival_time: str = Field(..., description="Time in HH:MM format")
    departure_airport: str = Field(..., description="IATA airport code")
    arrival_airport: str = Field(..., description="IATA airport code")
    aircraft_type: str = Field(..., description="Aircraft model (A320, B787, etc.)")
    registration: Optional[str] = Field(None, description="Aircraft registration (e.g., P4-AAA)")
    crew: List[CrewMember] = Field(default_factory=list)


class ScheduleRequest(BaseModel):
    """Request to fetch schedule"""
    username: str = Field(..., description="AIMS username")
    password: str = Field(..., description="AIMS password")
    start_date: str = Field(..., description="Start date (YYYY-MM-DD)")
    end_date: str = Field(..., description="End date (YYYY-MM-DD)")
    crew_id: Optional[str] = Field(None, description="Optional crew member ID for filtering")
    use_cache: bool = Field(True, description="Use cached session if available")


class ScheduleResponse(BaseModel):
    """Response with schedule data"""
    status: str = Field(..., description="'success' or 'error'")
    data: Optional[Dict[str, Any]] = Field(None)
    flights: Optional[List[Flight]] = Field(None)
    error: Optional[str] = Field(None)
    cached: bool = Field(False, description="Whether response came from cache")
    last_update: Optional[datetime] = Field(None)
    session_valid_until: Optional[datetime] = Field(None)


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    app_name: str
    app_version: str
    timestamp: datetime


class AuthTestRequest(BaseModel):
    """Request to test authentication"""
    username: str
    password: str


class AuthTestResponse(BaseModel):
    """Response to auth test"""
    authenticated: bool
    message: str
    session_valid_until: Optional[datetime] = None


class SyncRequest(BaseModel):
    """Async sync request"""
    username: str
    password: str
    start_date: str
    end_date: str


class SyncResponse(BaseModel):
    """Async sync response"""
    status: str = Field(..., description="'started', 'processing', 'completed'")
    task_id: str = Field(..., description="Celery task ID for tracking")
    message: str
