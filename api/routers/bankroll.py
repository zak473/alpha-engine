"""
Bankroll API — /api/v1/bankroll

Tracks user's betting bankroll with deposits, withdrawals, and daily snapshots.
"""

from __future__ import annotations

import math
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from api.deps import get_db, get_current_user
from db.models.bankroll import BankrollSnapshot

router = APIRouter(prefix="/bankroll", tags=["Bankroll"])


# ─── Schemas ──────────────────────────────────────────────────────────────────

class BankrollEvent(BaseModel):
    amount: float                         # positive for deposit, negative for withdrawal
    event_type: str = "deposit"           # "deposit" | "withdrawal"
    notes: Optional[str] = None


class BankrollSnapshotOut(BaseModel):
    id: str
    balance: float
    event_type: str
    pnl: Optional[float]
    notes: Optional[str]
    created_at: str

    model_config = {"from_attributes": True}


class BankrollStatsOut(BaseModel):
    current_balance: float
    starting_balance: float
    peak_balance: float
    total_deposited: float
    total_withdrawn: float
    total_pnl: float
    roi: float                      # total_pnl / total_deposited
    max_drawdown: float             # largest peak-to-trough drop
    sharpe: Optional[float]         # annualised Sharpe (daily returns)
    snapshots: list[BankrollSnapshotOut]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _compute_stats(snaps: list[BankrollSnapshot]) -> BankrollStatsOut:
    if not snaps:
        return BankrollStatsOut(
            current_balance=0, starting_balance=0, peak_balance=0,
            total_deposited=0, total_withdrawn=0, total_pnl=0,
            roi=0, max_drawdown=0, sharpe=None, snapshots=[],
        )

    balances = [s.balance for s in snaps]
    current  = balances[-1]
    peak     = max(balances)
    starting = balances[0]

    deposits   = sum(s.balance - (balances[i-1] if i > 0 else 0)
                     for i, s in enumerate(snaps) if s.event_type == "deposit")
    withdrawals = sum(abs(s.balance - (balances[i-1] if i > 0 else 0))
                      for i, s in enumerate(snaps) if s.event_type == "withdrawal")
    total_pnl  = sum(s.pnl or 0 for s in snaps)
    roi        = round(total_pnl / deposits, 4) if deposits > 0 else 0.0

    # Max drawdown: largest peak-to-trough percentage drop
    max_dd  = 0.0
    running_peak = balances[0]
    for b in balances:
        running_peak = max(running_peak, b)
        dd = (running_peak - b) / running_peak if running_peak > 0 else 0
        max_dd = max(max_dd, dd)

    # Daily Sharpe: use pick_settled pnl values
    pnl_series = [s.pnl for s in snaps if s.pnl is not None and s.event_type == "pick_settled"]
    sharpe = None
    if len(pnl_series) >= 10:
        mean   = sum(pnl_series) / len(pnl_series)
        var    = sum((x - mean) ** 2 for x in pnl_series) / len(pnl_series)
        std    = math.sqrt(var) if var > 0 else 0
        sharpe = round((mean / std) * math.sqrt(252), 2) if std > 0 else None

    snap_outs = [
        BankrollSnapshotOut(
            id=s.id,
            balance=s.balance,
            event_type=s.event_type,
            pnl=s.pnl,
            notes=s.notes,
            created_at=s.created_at.isoformat(),
        )
        for s in snaps
    ]

    return BankrollStatsOut(
        current_balance=round(current, 2),
        starting_balance=round(starting, 2),
        peak_balance=round(peak, 2),
        total_deposited=round(deposits, 2),
        total_withdrawn=round(withdrawals, 2),
        total_pnl=round(total_pnl, 2),
        roi=roi,
        max_drawdown=round(max_dd, 4),
        sharpe=sharpe,
        snapshots=snap_outs,
    )


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("", response_model=BankrollStatsOut)
def get_bankroll(
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Get bankroll stats and full history."""
    snaps = (
        db.query(BankrollSnapshot)
        .filter(BankrollSnapshot.user_id == user_id)
        .order_by(BankrollSnapshot.created_at.asc())
        .all()
    )
    return _compute_stats(snaps)


@router.post("/deposit", response_model=BankrollSnapshotOut, status_code=201)
def deposit(
    body: BankrollEvent,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Deposit funds to bankroll (or set initial balance)."""
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Deposit amount must be positive")

    # Current balance
    last = (
        db.query(BankrollSnapshot)
        .filter(BankrollSnapshot.user_id == user_id)
        .order_by(BankrollSnapshot.created_at.desc())
        .first()
    )
    current = last.balance if last else 0.0
    new_balance = current + body.amount

    snap = BankrollSnapshot(
        id=str(uuid.uuid4()),
        user_id=user_id,
        balance=round(new_balance, 2),
        event_type="deposit",
        pnl=None,
        notes=body.notes,
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return BankrollSnapshotOut(
        id=snap.id, balance=snap.balance, event_type=snap.event_type,
        pnl=snap.pnl, notes=snap.notes, created_at=snap.created_at.isoformat(),
    )


@router.post("/withdraw", response_model=BankrollSnapshotOut, status_code=201)
def withdraw(
    body: BankrollEvent,
    db: Session = Depends(get_db),
    user_id: str = Depends(get_current_user),
):
    """Withdraw funds from bankroll."""
    if body.amount <= 0:
        raise HTTPException(status_code=400, detail="Withdrawal amount must be positive")

    last = (
        db.query(BankrollSnapshot)
        .filter(BankrollSnapshot.user_id == user_id)
        .order_by(BankrollSnapshot.created_at.desc())
        .first()
    )
    current = last.balance if last else 0.0
    if body.amount > current:
        raise HTTPException(status_code=400, detail=f"Insufficient balance: {current:.2f}")

    snap = BankrollSnapshot(
        id=str(uuid.uuid4()),
        user_id=user_id,
        balance=round(current - body.amount, 2),
        event_type="withdrawal",
        pnl=None,
        notes=body.notes,
    )
    db.add(snap)
    db.commit()
    db.refresh(snap)
    return BankrollSnapshotOut(
        id=snap.id, balance=snap.balance, event_type=snap.event_type,
        pnl=snap.pnl, notes=snap.notes, created_at=snap.created_at.isoformat(),
    )
