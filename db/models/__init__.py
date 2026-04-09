from db.models.shared import (
    Sport, Competition, Season, Venue,
    Team, Player,
    Match,
    Prediction,
    TeamRating, PlayerRating, HeadToHead,
    ModelVersion, CalibrationModel, BacktestRun,
)
from db.models.soccer import (
    SoccerMatch, SoccerTeamMatchStats, SoccerPlayerMatchStats,
    SoccerLineup, SoccerInjury, SoccerTeamForm,
)
from db.models.tennis import (
    TennisMatch, TennisMatchStats, TennisPlayerForm,
)
from db.models.mvp import (
    CoreLeague, CoreTeam, CoreMatch, CoreTeamMatchStats,
    RatingEloTeam, FeatSoccerMatch, PredMatch, ModelRegistry,
)
from db.models.esports import (
    EsportsTitle, EsportsMap, EsportsPatch, EsportsMatch,
    EsportsMapResult, EsportsPlayerMatchStats,
    EsportsRosterChange, EsportsTeamForm,
)
from db.models.challenges import (
    Challenge, ChallengeMember, ChallengeEntry, ChallengeEntryResult,
)
from db.models.baseball import BaseballTeamMatchStats, EventContext
from db.models.tipsters import TipsterTip, TipsterFollow
from db.models.notifications import UserNotification
from db.models.horseracing import HorseRace, HorseRunner
from db.models.user import User
from db.models.odds import SpreadOdds  # registers table with Base.metadata for create_all()

__all__ = [
    "Sport", "Competition", "Season", "Venue",
    "Team", "Player",
    "Match",
    "Prediction",
    "TeamRating", "PlayerRating", "HeadToHead",
    "ModelVersion", "CalibrationModel", "BacktestRun",
    "SoccerMatch", "SoccerTeamMatchStats", "SoccerPlayerMatchStats",
    "SoccerLineup", "SoccerInjury", "SoccerTeamForm",
    "TennisMatch", "TennisMatchStats", "TennisPlayerForm",
    "EsportsTitle", "EsportsMap", "EsportsPatch", "EsportsMatch",
    "EsportsMapResult", "EsportsPlayerMatchStats",
    "EsportsRosterChange", "EsportsTeamForm",
    "CoreLeague", "CoreTeam", "CoreMatch", "CoreTeamMatchStats",
    "RatingEloTeam", "FeatSoccerMatch", "PredMatch", "ModelRegistry",
    "Challenge", "ChallengeMember", "ChallengeEntry", "ChallengeEntryResult",
    "BaseballTeamMatchStats", "EventContext",
    "TipsterTip", "TipsterFollow",
    "UserNotification",
    "HorseRace", "HorseRunner",
    "User",
    "MarketOdds", "SpreadOdds",
]
