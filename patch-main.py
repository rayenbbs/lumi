import time
import pprint
import threading
import asyncio
import websockets
import json

import cv2
import mediapipe as mp
import numpy as np

from attention_scorer import AttentionScorer as AttScorer
from eye_detector import EyeDetector as EyeDet
from parser import get_args
from pose_estimation import HeadPoseEstimator as HeadPoseEst
from utils import get_landmarks, load_camera_parameters

current_state = {
    "tired": False,
    "asleep": False,
    "looking_away": False,
    "distracted": False,
    "ear": 0.0,
    "perclos": 0.0,
    "gaze": 0.0,
    "roll": 0.0, "pitch": 0.0, "yaw": 0.0
}

async def ws_handler(websocket):
    try:
        while True:
            await websocket.send(json.dumps(current_state))
            await asyncio.sleep(0.1)
    except websockets.exceptions.ConnectionClosed:
        pass

def start_ws_server():
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    start_server = websockets.serve(ws_handler, "127.0.0.1", 8000)
    print("WebSocket server started on ws://127.0.0.1:8000")
    loop.run_until_complete(start_server)
    loop.run_forever()

def main():
    threading.Thread(target=start_ws_server, daemon=True).start()
