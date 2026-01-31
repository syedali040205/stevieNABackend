from pydantic import BaseModel, Field
from typing import Optional, List
from enum import Enum

class Geography(str, Enum):
    """Geographic regions for Stevie Awards"""
    WORLDWIDE = "worldwide"
    ASIA_PACIFIC_MIDDLE_EAST_NORTH_AFRICA = "asia_pacific_middle_east_north_africa"
    EUROPE = "europe"
    LATIN_AMERICA = "latin_america"
    USA = "usa"
    CANADA = "canada"

class OrganizationType(str, Enum):
    """Types of organizations"""
    FOR_PROFIT = "for_profit"
    NON_PROFIT = "non_profit"
    GOVERNMENT = "government"

class OrganizationSize(str, Enum):
    """Organization size categories"""
    SMALL = "small"           # Up to 100 employees
    MEDIUM = "medium"         # 101-2,500 employees
    LARGE = "large"           # 2,501+ employees

class NominationSubject(str, Enum):
    """Subject of the nomination"""
    ORGANIZATION = "organization"
    TEAM = "team"
    INDIVIDUAL = "individual"
    PRODUCT = "product"

class OperatingScope(str, Enum):
    """Operating scope of the organization"""
    LOCAL = "local"
    REGIONAL = "regional"
    NATIONAL = "national"
    INTERNATIONAL = "international"

class TechOrientation(str, Enum):
    """Technology orientation"""
    TECH_COMPANY = "tech_company"
    TECH_USER = "tech_user"
    NON_TECH = "non_tech"

class UserContext(BaseModel):
    """
    User context for Stevie Awards recommendation.
    Represents all information collected during the conversation.
    """
    # Pre-populated from user profile
    geography: Optional[Geography] = None
    organization_name: Optional[str] = None
    job_title: Optional[str] = None
    
    # Collected during conversation
    org_type: Optional[OrganizationType] = None
    org_size: Optional[OrganizationSize] = None
    nomination_subject: Optional[NominationSubject] = None
    description: Optional[str] = Field(None, description="Description of the achievement or nomination")
    achievement_focus: Optional[List[str]] = Field(None, description="Areas of achievement focus")
    tech_orientation: Optional[TechOrientation] = None
    operating_scope: Optional[OperatingScope] = None
    
    class Config:
        use_enum_values = True
        json_schema_extra = {
            "example": {
                "geography": "usa",
                "organization_name": "Acme Corp",
                "job_title": "Marketing Director",
                "org_type": "for_profit",
                "org_size": "medium",
                "nomination_subject": "team",
                "description": "Innovative marketing campaign that increased brand awareness by 300%",
                "achievement_focus": ["Marketing", "Innovation"],
                "tech_orientation": "tech_user",
                "operating_scope": "national"
            }
        }
