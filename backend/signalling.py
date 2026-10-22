"""
TeleThread WebRTC Signalling Server
FastAPI APIRouter WebSocket implementation for TeleThread consultations.

Relays JSON signalling messages between Spoke (Primary Health Centre) and Hub (District / Specialist Hospital):
- SDP_OFFER
- SDP_ANSWER
- ICE_CANDIDATE
- TIER_CHANGE
- STILL_PHOTO
- OUTBOX_SYNCED
- CASE_UPDATED
"""

import json
import logging
from typing import Any, Dict, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger("telethread.signalling")
logging.basicConfig(level=logging.INFO)

router = APIRouter()


class SignallingConnectionManager:
    """
    Manages active WebSocket connections per case_id for spoke and hub roles.
    Relays signalling messages between the two endpoints of a teleconsultation.
    """

    def __init__(self) -> None:
        # active_rooms: { case_id: { "spoke": WebSocket, "hub": WebSocket } }
        self.active_rooms: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, case_id: str, role: str, websocket: WebSocket) -> None:
        """
        Accepts a WebSocket connection, registers it in the room for case_id,
        and informs both peers of connection status.
        """
        role = role.lower()
        await websocket.accept()

        if case_id not in self.active_rooms:
            self.active_rooms[case_id] = {}

        # If a connection for this role already exists, close it cleanly first
        if role in self.active_rooms[case_id]:
            old_ws = self.active_rooms[case_id][role]
            try:
                await old_ws.close(code=1000, reason="Replaced by new connection")
            except Exception:
                pass

        self.active_rooms[case_id][role] = websocket
        logger.info(f"Connected: case_id={case_id}, role={role}. Active roles: {list(self.active_rooms[case_id].keys())}")

        peer_role = "hub" if role == "spoke" else "spoke"
        peer_connected = peer_role in self.active_rooms[case_id]

        # Send initial room status to the newly connected client
        await websocket.send_json({
            "type": "ROOM_STATUS",
            "case_id": case_id,
            "role": role,
            "peer_connected": peer_connected,
            "timestamp": _current_iso_timestamp(),
        })

        # If the other peer is already connected, notify them that this role joined
        if peer_connected:
            peer_ws = self.active_rooms[case_id][peer_role]
            try:
                await peer_ws.send_json({
                    "type": "PEER_CONNECTED",
                    "case_id": case_id,
                    "role": role,
                    "peer_role": role,
                    "timestamp": _current_iso_timestamp(),
                })
            except Exception as e:
                logger.warning(f"Failed to notify peer {peer_role} in case {case_id}: {e}")

    async def disconnect(self, case_id: str, role: str) -> None:
        """
        Removes the WebSocket from the room and notifies the opposite peer if present.
        """
        role = role.lower()
        if case_id in self.active_rooms:
            if role in self.active_rooms[case_id]:
                del self.active_rooms[case_id][role]
                logger.info(f"Disconnected: case_id={case_id}, role={role}")

            peer_role = "hub" if role == "spoke" else "spoke"
            if peer_role in self.active_rooms[case_id]:
                peer_ws = self.active_rooms[case_id][peer_role]
                try:
                    await peer_ws.send_json({
                        "type": "PEER_DISCONNECTED",
                        "case_id": case_id,
                        "role": role,
                        "timestamp": _current_iso_timestamp(),
                    })
                except Exception as e:
                    logger.warning(f"Failed to notify peer {peer_role} about disconnect: {e}")

            # Clean up empty room
            if not self.active_rooms[case_id]:
                del self.active_rooms[case_id]

    async def relay_message(self, case_id: str, sender_role: str, message: Dict[str, Any]) -> bool:
        """
        Relays a JSON message from sender_role to the opposite peer in the case room.
        Supported types:
        - SDP_OFFER
        - SDP_ANSWER
        - ICE_CANDIDATE
        - TIER_CHANGE
        - STILL_PHOTO
        - OUTBOX_SYNCED
        - CASE_UPDATED
        """
        sender_role = sender_role.lower()
        peer_role = "hub" if sender_role == "spoke" else "spoke"

        if case_id not in self.active_rooms or peer_role not in self.active_rooms[case_id]:
            logger.info(
                f"Peer {peer_role} not yet connected in case {case_id} to receive {message.get('type')}. "
                "Message will be acknowledged."
            )
            return False

        peer_ws = self.active_rooms[case_id][peer_role]
        
        # Ensure sender metadata is attached
        outgoing = dict(message)
        outgoing["sender_role"] = sender_role
        outgoing["case_id"] = case_id
        if "timestamp" not in outgoing:
            outgoing["timestamp"] = _current_iso_timestamp()

        try:
            await peer_ws.send_json(outgoing)
            logger.debug(f"Relayed {message.get('type')} from {sender_role} to {peer_role} (case {case_id})")
            return True
        except Exception as e:
            logger.error(f"Error relaying message {message.get('type')} to {peer_role} in case {case_id}: {e}")
            return False


def _current_iso_timestamp() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


# Global connection manager instance
manager = SignallingConnectionManager()


@router.websocket("/ws/consult/{case_id}/{role}")
async def consult_websocket_endpoint(websocket: WebSocket, case_id: str, role: str):
    """
    WebSocket endpoint for TeleThread live consultations.
    Roles:
      - 'spoke': Primary Health Centre client (captures video/audio/photos/vitals).
      - 'hub': District Hospital Specialist client (reviews stream/photos/vitals/advises).
    """
    normalized_role = role.lower()
    if normalized_role not in ("spoke", "hub"):
        await websocket.close(code=1008, reason="Role must be 'spoke' or 'hub'")
        return

    await manager.connect(case_id, normalized_role, websocket)

    try:
        while True:
            # Accept text or JSON frames
            raw_data = await websocket.receive_text()
            try:
                data = json.loads(raw_data)
            except json.JSONDecodeError:
                logger.warning(f"Received invalid JSON from {normalized_role} in case {case_id}")
                await websocket.send_json({"type": "ERROR", "message": "Invalid JSON format"})
                continue

            msg_type = data.get("type", "").upper()

            # Heartbeat check
            if msg_type == "PING":
                await websocket.send_json({"type": "PONG", "timestamp": _current_iso_timestamp()})
                continue

            # Validated signalling message types per specification:
            # SDP_OFFER, SDP_ANSWER, ICE_CANDIDATE, TIER_CHANGE, STILL_PHOTO, OUTBOX_SYNCED, CASE_UPDATED
            valid_types = {
                "SDP_OFFER",
                "SDP_ANSWER",
                "ICE_CANDIDATE",
                "TIER_CHANGE",
                "STILL_PHOTO",
                "OUTBOX_SYNCED",
                "CASE_UPDATED",
            }

            if msg_type in valid_types or msg_type.startswith("CUSTOM_"):
                relayed = await manager.relay_message(case_id, normalized_role, data)
                # Acknowledge receipt to sender
                await websocket.send_json({
                    "type": "ACK",
                    "relayed": relayed,
                    "ref_type": msg_type,
                    "case_id": case_id,
                })
            else:
                logger.warning(f"Unrecognized message type '{msg_type}' from {normalized_role} in case {case_id}")
                # Relay anyway for forward compatibility with teammate modules
                await manager.relay_message(case_id, normalized_role, data)

    except WebSocketDisconnect:
        logger.info(f"Client disconnected: case_id={case_id}, role={normalized_role}")
        await manager.disconnect(case_id, normalized_role)
    except Exception as exc:
        logger.error(f"Unexpected WebSocket error in case {case_id}, role {normalized_role}: {exc}")
        await manager.disconnect(case_id, normalized_role)
