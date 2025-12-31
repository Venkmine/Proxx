"""
Readiness API endpoint for Forge first-run status.

Provides structured readiness report for frontend consumption.

Part of IMPLEMENTATION SLICE 6: Operator Entrypoints and Packaging.
"""

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()


@router.get("/api/readiness")
async def get_readiness():
    """
    Get Forge readiness report.
    
    Returns:
        JSON readiness report with all check results.
    
    Example Response:
        {
            "version": "1.0.0",
            "ready": true,
            "timestamp": "2025-12-31T10:00:00Z",
            "summary": {
                "total_checks": 8,
                "passed": 7,
                "failed": 1,
                "blocking_failures": 0
            },
            "checks": [
                {
                    "id": "python_version",
                    "status": "pass",
                    "message": "Python 3.11 (minimum: 3.11)"
                },
                ...
            ]
        }
    """
    try:
        # Import readiness module
        import sys
        from pathlib import Path
        
        # Ensure readiness module is importable
        backend_dir = Path(__file__).parent.parent.parent.resolve()
        if str(backend_dir) not in sys.path:
            sys.path.insert(0, str(backend_dir))
        
        from readiness import generate_readiness_report
        
        report = generate_readiness_report()
        return JSONResponse(content=report.to_dict())
        
    except ImportError as e:
        # Readiness module not available
        return JSONResponse(
            status_code=500,
            content={
                "version": "unknown",
                "ready": False,
                "error": f"Readiness module not available: {e}",
                "checks": [],
            }
        )
    except Exception as e:
        # Unexpected error
        return JSONResponse(
            status_code=500,
            content={
                "version": "unknown",
                "ready": False,
                "error": str(e),
                "checks": [],
            }
        )
