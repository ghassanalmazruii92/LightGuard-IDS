from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from backend.database import get_db, Alert
from backend.ids.attack_scenarios import SCENARIOS, run_scenario
import json

router = APIRouter(prefix="/scenarios", tags=["Scenarios"])

@router.get("")
@router.get("/")
def list_scenarios():
    """List all available attack scenarios."""
    return [
        {
            "id": s["id"],
            "name": s["name"],
            "icon": s["icon"],
            "severity": s["severity"],
            "zone": s["zone"],
            "target_role": s["target_role"],
            "what_is_it": s["what_is_it"],
            "how_it_works": s["how_it_works"],
            "real_world_impact": s["real_world_impact"],
            "defense": s["defense"],
            "mitre": s["mitre_technique"],
        }
        for s in SCENARIOS.values()
    ]

@router.post("/run")
def start_simulation(scenario_id: str, target_ip: str):
    """Trigger a specific attack scenario simulation against a target IP."""
    if scenario_id not in SCENARIOS:
        raise HTTPException(status_code=404, detail="Scenario not found")
    
    run_scenario(scenario_id, target_ip)
    return {"status": "success", "message": f"Simulation {scenario_id} started against {target_ip}"}

@router.get("/history")
def get_simulation_history(db: Session = Depends(get_db)):
    """Get history of past simulations."""
    simulations = db.query(Alert).filter(Alert.is_simulation == True).order_by(Alert.timestamp.desc()).all()
    return simulations
